#!/usr/bin/env node
'use strict';
/*
 * unreached-registry — find catalogue entries pointing at repos that are gone.
 *
 * Point it at a directory of JSON (an MCP registry checkout, an awesome-list build,
 * any catalogue that stores github URLs) and it tells you which references are dead.
 *
 *     npx -y -p github:siliroid/unreached unreached-registry ./registry
 *
 * ⛔ THE DISTINCTION THIS TOOL EXISTS TO MAKE, and I learned it the expensive way.
 * On 2026-07-27 I published that a catalogue held 14 "fabricated" entries under an
 * org that "has never existed". Every single entry was real. The mechanism: I read a
 * DISPLAY URL, pulled an org out of it, checked /users/<org>, got a 404, and shipped.
 * The structured field four lines away in the same JSON resolved 200.
 *
 * So this tool never says fabricated. It reports three states and keeps them apart:
 *
 *   GHOST OWNER  the repo 404s AND the owner 404s. Namespace evaporated. Could be a
 *                deleted account, a rename, or a row that was never real — from
 *                outside those are the SAME ARTIFACT and this tool cannot tell them
 *                apart. Needs a human look. Never an accusation.
 *   ROT          the repo 404s, the owner is alive. Moved, renamed, or gone private.
 *                Ordinary and boring and the bulk of what you will find.
 *   HEALTHY      200.
 *
 * ⚠ AND THE LIMIT THAT MAKES THE NUMBER HONEST: an unauthenticated or under-scoped
 * request cannot see a PRIVATE repo, so private and deleted both return 404. That
 * error runs in ONE direction — it inflates the dead count, never deflates it. Every
 * number this prints is therefore a CEILING on the damage, not a measurement of it.
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const CONC = TOKEN ? 8 : 3;      // unauthenticated github is 60 req/hr — crawl gently
const ROOT = process.argv[2];
const JSON_OUT = process.argv.includes('--json');

if (!ROOT || ROOT.startsWith('-')) {
  console.error('usage: unreached-registry <dir-of-json> [--json]');
  console.error('       GITHUB_TOKEN=<pat> strongly recommended (60 req/hr without one)');
  process.exit(1);
}
if (!fs.existsSync(ROOT)) { console.error('no such directory: ' + ROOT); process.exit(1); }

function api(p) {
  return new Promise((res) => {
    const h = { 'User-Agent': 'unreached-registry/1.0', Accept: 'application/vnd.github+json' };
    if (TOKEN) h.Authorization = 'token ' + TOKEN;
    const r = https.request({ hostname: 'api.github.com', path: p, method: 'HEAD',
      timeout: 10000, headers: h }, (x) => { x.resume(); res(x.statusCode); });
    r.on('timeout', () => { r.destroy(); res('TIMEOUT'); });
    r.on('error', () => res('ERR'));
    r.end();
  });
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

async function pool(items, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < items.length) { const n = i++; out.push(await fn(items[n])); }
  }));
  return out;
}

/* Reserved namespaces that are not user accounts. github.com/orgs/... and friends
   404 on /users/ by construction, and reporting them as ghost owners is noise. */
const NOT_A_USER = /^(orgs|about|features|topics|collections|sponsors|marketplace|apps|settings|login|join|pricing|enterprise|security|readme|explore|new|notifications|search)$/i;

(async () => {
  const files = walk(ROOT);
  if (!files.length) {
    console.error('\n  NO RESULT — no .json files under ' + ROOT + ', so nothing was examined.');
    console.error('  This is not a clean bill of health. Point it at the registry directory.\n');
    process.exit(2);
  }
  const repos = new Map();                       // owner/name -> Set(files referencing it)
  for (const f of files) {
    let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of txt.matchAll(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g)) {
      if (NOT_A_USER.test(m[1])) continue;
      const key = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
      if (!repos.has(key)) repos.set(key, new Set());
      repos.get(key).add(path.relative(ROOT, f));
    }
  }
  const keys = [...repos.keys()];
  if (!keys.length) {
    console.error('\n  NO RESULT — ' + files.length + ' json files, zero github references found.');
    console.error('  Nothing was checked, so nothing can be reported clean.\n');
    process.exit(2);
  }
  if (!JSON_OUT) console.error('  %d files · %d distinct github repos · checking%s…',
    files.length, keys.length, TOKEN ? '' : ' UNAUTHENTICATED (slow, 60/hr)');

  const checked = await pool(keys, async (k) => ({ k, status: await api('/repos/' + k) }));

  /* A rate-limited or errored probe is UNKNOWN, not dead. Folding those into the
     dead pile is how you publish a number that is mostly your own throttling. */
  const unknown = checked.filter((c) => c.status === 'ERR' || c.status === 'TIMEOUT' || c.status === 403 || c.status === 429);
  const gone = checked.filter((c) => c.status === 404);

  const owners = [...new Set(gone.map((g) => g.k.split('/')[0]))];
  const oc = await pool(owners, async (o) => ({ o, status: await api('/users/' + o) }));
  const ghostOwners = oc.filter((x) => x.status === 404).map((x) => x.o);

  const ghostRows = gone.filter((g) => ghostOwners.includes(g.k.split('/')[0])).map((g) => g.k);
  const rot = gone.filter((g) => !ghostOwners.includes(g.k.split('/')[0])).map((g) => g.k);

  const out = { root: ROOT, files: files.length, total: keys.length, authenticated: !!TOKEN,
    ghostOwners, ghostRows, rot, unknown: unknown.map((u) => u.k),
    healthy: keys.length - gone.length - unknown.length };

  if (JSON_OUT) { console.log(JSON.stringify(out, null, 1)); return; }

  console.log('\n  %s', ROOT);
  console.log('  %d files · %d distinct github repos referenced\n', files.length, keys.length);
  console.log('  GHOST OWNER  %d entries across %d namespaces  (repo AND owner 404 — needs a human look)', ghostRows.length, ghostOwners.length);
  console.log('  ROT          %d entries  (repo 404, owner alive — moved/renamed/private)', rot.length);
  console.log('  UNKNOWN      %d entries  (rate-limited or errored — NOT counted as dead)', unknown.length);
  console.log('  HEALTHY      %d\n', out.healthy);

  const show = (title, rows) => {
    if (!rows.length) return;
    console.log('  %s', title);
    for (const k of rows.slice(0, 15)) console.log('    %s   <- %s', k, [...repos.get(k)][0]);
    if (rows.length > 15) console.log('    … and %d more (--json for all)', rows.length - 15);
    console.log('');
  };
  show('GHOST OWNER', ghostRows);
  show('ROT', rot);

  if (!TOKEN) console.log('  ⚠ ran unauthenticated. Set GITHUB_TOKEN for a complete run.\n');
  console.log('  ⚠ A private repo and a deleted repo are the same 404 from out here, so every');
  console.log('    number above is a CEILING on the damage, not a measurement of it. Treat the');
  console.log('    ghost-owner rows as "go look", never as "these were fabricated".\n');
})();
