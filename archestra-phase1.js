#!/usr/bin/env node
/*
 * archestra-phase1.js — the real count. Reads ONLY the structured github_info field.
 *
 * Phase 0 established: 901 entries (letter claimed 1,281), and the filename projection
 * disagrees with the structured field on 11 of 40 sampled — including
 * `mcp__ext-apps` (filename mcp/ext-apps, structured modelcontextprotocol/ext-apps),
 * which is the EXACT row that produced a false "fabricated entries" accusation on
 * 2026-07-27. The projection is not trusted anywhere in this file.
 *
 * CLASSIFICATION, and the boundaries are the product:
 *   alive        repo resolves 200
 *   rot          repo 404, owner resolves       -> renamed, private, or deleted. GO LOOK.
 *   ghost        repo 404 AND owner 404         -> stronger, still not proof of deletion
 *   no-source    entry has no github_info       -> UNKNOWN. never counted as dead.
 *   unknown      rate-limited / network         -> UNKNOWN. never counted as dead.
 *
 * ⛔ A 404 FROM OUTSIDE CANNOT DISTINGUISH PRIVATE FROM DELETED. Nothing in this script
 * claims otherwise, and no output of it may be worded as though it does.
 *
 * usage: node ventures/unreached/archestra-phase1.js [--limit N]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync(path.join(__dirname, '..', '..', 'credentials', 'github-token'), 'utf8').trim();
const OUT = path.join(__dirname, 'ARCHESTRA-PHASE1.json');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('limit', '0'), 10);

const H = { Authorization: `token ${TOKEN}`, 'User-Agent': 'unreached-rescan', Accept: 'application/vnd.github+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url) {
  for (let i = 0; i < 3; i++) {
    let r;
    try { r = await fetch(url, { headers: H }); }
    catch (e) { await sleep(1500); continue; }
    if (r.status === 403 || r.status === 429) {
      const reset = Number(r.headers.get('x-ratelimit-reset') || 0) * 1000 - Date.now();
      const wait = Math.min(Math.max(reset, 3000), 90000);
      console.error(`  rate limited — waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait); continue;
    }
    return { status: r.status, json: r.status === 200 ? await r.json().catch(() => null) : null };
  }
  return { status: 0, json: null };   // exhausted -> UNKNOWN
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

(async () => {
  const tree = await api('https://api.github.com/repos/archestra-ai/archestra/git/trees/HEAD?recursive=1');
  let files = tree.json.tree
    .filter(t => /^mcp-catalog\/data\/mcp-evaluations\/.+\.json$/.test(t.path))
    .map(t => t.path);
  if (LIMIT) files = files.slice(0, LIMIT);
  console.log(`entries: ${files.length}`);

  console.log('reading structured github_info from every entry…');
  let done = 0;
  const entries = await pool(files, 8, async (p) => {
    const r = await api(`https://api.github.com/repos/archestra-ai/archestra/contents/${p}`);
    if (++done % 150 === 0) console.log(`  ${done}/${files.length}`);
    if (r.status !== 200) return { file: path.basename(p, '.json'), err: r.status };
    let c; try { c = JSON.parse(Buffer.from(r.json.content, 'base64').toString('utf8')); }
    catch (e) { return { file: path.basename(p, '.json'), err: 'unparseable' }; }
    const gi = c.github_info || {};
    return { file: path.basename(p, '.json'), owner: gi.owner, repo: gi.repo };
  });

  const noSource = entries.filter(e => !e.err && (!e.owner || !e.repo));
  const fetchErr = entries.filter(e => e.err);
  const withSrc  = entries.filter(e => !e.err && e.owner && e.repo);
  console.log(`\n  with github_info : ${withSrc.length}`);
  console.log(`  NO github_info   : ${noSource.length}   (UNKNOWN — never counted dead)`);
  console.log(`  fetch failed     : ${fetchErr.length}   (UNKNOWN)`);

  const uniq = [...new Set(withSrc.map(e => `${e.owner}/${e.repo}`))];
  console.log(`\nchecking ${uniq.length} unique repo references…`);
  done = 0;
  const repoStat = {};
  await pool(uniq, 8, async (slug) => {
    const r = await api(`https://api.github.com/repos/${slug}`);
    repoStat[slug] = r.status;
    if (++done % 150 === 0) console.log(`  ${done}/${uniq.length}`);
  });

  const notAlive = uniq.filter(s => repoStat[s] === 404);
  const unknownRepo = uniq.filter(s => repoStat[s] !== 200 && repoStat[s] !== 404);
  const owners = [...new Set(notAlive.map(s => s.split('/')[0]))];
  console.log(`\nrepo 404: ${notAlive.length}   unknown: ${unknownRepo.length}`);
  console.log(`checking ${owners.length} owners of those…`);
  const ownerStat = {};
  await pool(owners, 6, async (o) => {
    const r = await api(`https://api.github.com/users/${o}`);
    ownerStat[o] = r.status;
  });

  const ghost = notAlive.filter(s => ownerStat[s.split('/')[0]] === 404);
  const rot   = notAlive.filter(s => ownerStat[s.split('/')[0]] === 200);
  const amb   = notAlive.filter(s => ![200, 404].includes(ownerStat[s.split('/')[0]]));

  const result = {
    scanned_at: new Date().toISOString(),
    source: 'archestra-ai/archestra :: mcp-catalog/data/mcp-evaluations/*.json (structured github_info only)',
    catalogue_entries: files.length,
    letter_claimed_entries: 1281,
    with_github_info: withSrc.length,
    no_github_info: noSource.map(e => e.file),
    fetch_failed: fetchErr.length,
    unique_repo_refs: uniq.length,
    alive: uniq.length - notAlive.length - unknownRepo.length,
    ghost_owner_and_repo_404: ghost.sort(),
    rot_repo_404_owner_alive: rot.sort(),
    ambiguous_owner_status: amb.sort(),
    unknown_repo_status: unknownRepo.sort(),
    caveat: 'A 404 from outside cannot distinguish a private repo from a deleted one. Every row above is "go look", never proof of deletion.',
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

  const byOwner = {};
  for (const s of notAlive) { const o = s.split('/')[0]; byOwner[o] = (byOwner[o] || 0) + 1; }
  const top = Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 6);

  console.log(`\n───── RESULT (letter claimed 1,281 entries / 89 raw / 48 real) ─────`);
  console.log(`  catalogue entries   ${files.length}`);
  console.log(`  unique repo refs    ${uniq.length}`);
  console.log(`  unreachable (404)   ${notAlive.length}   = ${(notAlive.length / uniq.length * 100).toFixed(1)}%`);
  console.log(`    ghost (owner 404) ${ghost.length}`);
  console.log(`    rot   (owner ok)  ${rot.length}`);
  console.log(`  no github_info      ${noSource.length}   (UNKNOWN)`);
  console.log(`  unknown status      ${unknownRepo.length + amb.length}   (UNKNOWN)`);
  console.log(`  top owners:`); top.forEach(([o, n]) => console.log(`    ${String(n).padStart(3)}  ${o}`));
  console.log(`\nwrote ${OUT}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
