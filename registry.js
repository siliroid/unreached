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
const JSON_OUT = process.argv.includes('--json');
const apiIdx = process.argv.indexOf('--api');
const API_BASE = apiIdx === -1 ? null : process.argv[apiIdx + 1];
const ROOT = API_BASE ? null : process.argv[2];

/* ⛔ --api EXISTS BECAUSE THE FILE MODE MEASURES THE SMALL HALF OF THE ECOSYSTEM.
   Pointed at modelcontextprotocol/registry as a directory, this returned 27 repos and zero
   findings, and I was one keystroke from recording "the official registry is clean." It is a
   Go SERVICE. Its catalogue is an endpoint holding SIX THOUSAND servers, of which 5,120 carry
   live `remotes[]` across 1,885 distinct hosts — none of which any file-based tool can see.

   And the API asks a better question than the file mode does. A file registry links to SOURCE,
   so the question is "does this repo exist" — which is permanently ambiguous, because a private
   repo and a deleted one are the same 404 from outside. An API registry lists RUNNING SERVICES,
   so the question is "does the thing a user would install still exist," and for the DNS half of
   that there is no ambiguity at all. */
if (!API_BASE) {
  if (!ROOT || ROOT.startsWith('-')) {
    console.error('usage: unreached-registry <dir-of-json> [--json]');
    console.error('       unreached-registry --api https://registry.modelcontextprotocol.io [--json]');
    console.error('       GITHUB_TOKEN=<pat> strongly recommended (60 req/hr without one)');
    process.exit(1);
  }
  if (!fs.existsSync(ROOT)) { console.error('no such directory: ' + ROOT); process.exit(1); }
}

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

/* ⛔ NOT .json ONLY. The first registry I pointed this at after mcpbar was Docker's,
   whose catalogue is 336 YAML files and 82 JSON. A json-only walker would have audited
   the 82, silently ignored the 336, and printed a number that looks exactly like a
   result. The github.com URL regex does not care what format the file is in — only my
   extension filter did. Same failure as everything else this week: the tool measures
   what it can see and says nothing at all about what it cannot. */
const TEXTY = /\.(json|ya?ml|toml|md|txt|jsonc|json5|csv|tsv|ini|cfg|xml)$/i;
const SKIP_DIR = /^(\.git|node_modules|vendor|dist|build|\.next|target)$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(path.join(dir, e.name), out); }
    else if (TEXTY.test(e.name)) out.push(path.join(dir, e.name));
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
const NOT_A_USER = /^(orgs|about|features|topics|collections|sponsors|marketplace|apps|settings|login|join|pricing|enterprise|security|readme|explore|new|notifications|search|user-attachments|assets|raw|gist|blog|contact|site|customer-stories|trending)$/i;

/* ⛔ PLACEHOLDER NAMESPACES. Docker's registry produced `myorg/my-orgdb-mcp` from
   CONTRIBUTING.md and `my-org/my-mcp-server` from docs/configuration.md. Those are
   EXAMPLES IN PROSE, not catalogue entries, and reporting them to a maintainer as rot
   in their registry is a category error that makes every other row look automated. */
const PLACEHOLDER = /^(my-?org|my-?company|your-?org|your-?company|example|examples|username|your-?username|owner|user|org|acme|foo|bar|test|placeholder|company|yourname|<[^>]*>)$/i;

/* A registry's CATALOGUE is its data files. Its DOCS are prose full of illustrative
   URLs. An entry seen ONLY in prose is documentation, not inventory — split it out
   rather than folding it into the number a maintainer is asked to act on. */
const PROSE = /\.(md|txt)$/i;

/* Paginate an MCP-registry-shaped API. Cursor-based, 100/page. Extracts BOTH halves:
   github repos (same ambiguity as file mode) and remote hosts (no ambiguity at all). */
async function readApi(base) {
  const servers = [];
  let cursor = '', pages = 0;
  while (pages < 500) {
    const u = base.replace(/\/$/, '') + '/v0/servers?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const r = await fetch(u, { headers: { 'user-agent': 'unreached-registry/1.0' } });
    if (!r.ok) { if (!pages) { console.error(`\n  NO RESULT — ${u} returned ${r.status}. Nothing examined.\n`); process.exit(2); } break; }
    const j = await r.json();
    for (const row of (j.servers || j.data || [])) servers.push(row.server || row);
    pages++;
    cursor = (j.metadata || j.meta || {}).nextCursor || '';
    if (!cursor) break;
  }
  return servers;
}

/* ⛔ DNS ONLY, AND THE EXCLUSIONS COST ME FINDINGS ON PURPOSE.
   DEAD = the hostname does not resolve, v4 and v6. NOT counted: 4xx/5xx (could be auth or a
   bot wall), timeouts (could be slow or blocking my UA), Cloudflare refusing a non-browser
   agent — I published a 56% false-positive rate for exactly that class on my own crawler this
   week. A domain that does not resolve is the one signal with no error bar: no private-vs-
   deleted ambiguity, no UA dependence, and it is gone for every user too.
   ⇒ Which makes the result a FLOOR. Real breakage is certainly higher; this measures only
     the part that cannot be argued with. */
async function deadHosts(hosts) {
  const dns = require('node:dns').promises;
  const list = [...hosts], dead = [];
  let i = 0;
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (i < list.length) {
      const h = list[i++];
      try { await dns.resolve4(h); }
      catch (e) {
        if (e.code === 'ENOTFOUND' || e.code === 'NXDOMAIN') {
          try { await dns.resolve6(h); } catch { dead.push(h); }
        }
      }
    }
  }));
  return dead;
}

(async () => {
  if (API_BASE) {
    const servers = await readApi(API_BASE);
    const hostMap = new Map();      // host -> [server names]
    const repoMap = new Map();      // owner/name -> Set(server names)
    for (const s of servers) {
      for (const rm of (s.remotes || [])) {
        try { const h = new URL(rm.url).host;
          if (!hostMap.has(h)) hostMap.set(h, []); hostMap.get(h).push(s.name); } catch { }
      }
      const ru = s.repository && s.repository.url;
      if (ru) for (const m of String(ru).matchAll(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g)) {
        if (NOT_A_USER.test(m[1]) || PLACEHOLDER.test(m[1])) continue;
        const k = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
        if (!repoMap.has(k)) repoMap.set(k, new Set());
        repoMap.get(k).add(s.name);
      }
    }
    if (!JSON_OUT) console.error('  %d servers · %d remote hosts · %d github repos · resolving…',
      servers.length, hostMap.size, repoMap.size);

    const dead = await deadHosts(hostMap.keys());
    const out = { api: API_BASE, servers: servers.length, hosts: hostMap.size,
      repos: repoMap.size, deadHosts: dead,
      affected: dead.reduce((n, h) => n + hostMap.get(h).length, 0),
      map: Object.fromEntries(dead.map((h) => [h, hostMap.get(h)])) };

    if (JSON_OUT) { console.log(JSON.stringify(out, null, 1)); return; }
    console.log('\n  %s', API_BASE);
    console.log('  %d servers · %d distinct remote hosts · %d github repos referenced\n',
      servers.length, hostMap.size, repoMap.size);
    console.log('  HOST DOES NOT RESOLVE   %d hosts, affecting %d registry entries\n', dead.length, out.affected);
    for (const h of dead.slice(0, 25))
      console.log('    %s   <- %s', h, hostMap.get(h).slice(0, 2).join(', ')
        + (hostMap.get(h).length > 2 ? ` (+${hostMap.get(h).length - 2})` : ''));
    if (dead.length > 25) console.log('    … and %d more (--json for all)', dead.length - 25);
    console.log('\n  ⚠ DNS ONLY. A host that resolves but errors, times out, or bot-walls this');
    console.log('    agent is NOT counted — those are indistinguishable from my own tooling being');
    console.log('    refused. So this is a FLOOR on the breakage, and the one number here with no');
    console.log('    error bar: an unresolvable domain is gone for every user, not just for me.\n');
    console.log('  ⚠ It also says nothing about whether the SERVICE is broken — only that the');
    console.log('    hostname is gone. A moved service with a stale entry is a one-line fix.\n');
    return;
  }

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
      if (NOT_A_USER.test(m[1]) || PLACEHOLDER.test(m[1]) || PLACEHOLDER.test(m[2])) continue;
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

  /* Split prose from inventory. A key seen ONLY in .md/.txt is an illustrative URL in
     documentation — real, often dead, and NOT a defect in the catalogue. Folding it in
     is what makes a report read as automated. */
  const proseOnly = (k) => [...repos.get(k)].every((f) => PROSE.test(f));
  const deadKeys = gone.map((g) => g.k);
  const docs = deadKeys.filter(proseOnly);
  const inventory = deadKeys.filter((k) => !proseOnly(k));

  const ghostRows = inventory.filter((k) => ghostOwners.includes(k.split('/')[0]));
  const rot = inventory.filter((k) => !ghostOwners.includes(k.split('/')[0]));

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

  /* ⛔ THE SCOPE LIMIT THAT ALMOST PRODUCED A FALSE CLEAN, 2026-07-28 08:09.
     Pointed at modelcontextprotocol/registry: 285 files in, 27 repos out, zero findings.
     I was one keystroke from writing down "the official MCP registry is clean." It is not
     a file catalogue — it is a Go SERVICE whose server list lives behind an API. I audited
     its source tree and nearly reported that as a fact about its contents, on the exact
     catalogue I already got publicly wrong once this week.
     A repo with many files and few references is the signature of an API-served registry,
     and for those this tool has measured almost nothing. Say so out loud, because a small
     clean number and an unexamined catalogue are the same output. */
  /* ⛔ I FIRST WROTE THIS AS A HEURISTIC AND IT WAS WRONG TWICE OVER.
     ① it tested files.length, which is the count AFTER filtering to text files — 64, not
        the 285 in the tree. A guard against a number I did not have, inside the fix for
        measuring the wrong variable.
     ② then I checked whether the ratio discriminates at all, and it does not:
        mcpbar 1717 files -> 1719 refs · docker 511 -> 214 · official 64 -> 27.
        Docker and the API-served official repo have the SAME ratio. There is no signal.
     A check that cannot tell the two cases apart is not a check, it is decoration — and
     shipping it would have been an instrument that cannot disagree with me, which is the
     one thing I have promised all week never to ship.
     ⇒ So state the scope unconditionally instead. Always true, always useful, claims
       nothing I cannot detect. */
  console.log('  ⚠ SCOPE: this audited %d text files in that tree. If the registry serves its', files.length);
  console.log('    catalogue from an API or a database, THAT CONTENT WAS NOT EXAMINED and none of');
  console.log('    the above is a statement about it. (modelcontextprotocol/registry is a Go');
  console.log('    service, not a file catalogue — 27 refs here, and its real list is an endpoint.)\n');
  if (!TOKEN) console.log('  ⚠ ran unauthenticated. Set GITHUB_TOKEN for a complete run.\n');
  console.log('  ⚠ A private repo and a deleted repo are the same 404 from out here, so every');
  console.log('    number above is a CEILING on the damage, not a measurement of it. Treat the');
  console.log('    ghost-owner rows as "go look", never as "these were fabricated".\n');
})();
