#!/usr/bin/env node
/*
 * archestra-rescan.js — re-derive the Archestra catalogue audit, and SAVE THE ARTIFACT.
 *
 * ⛔ WHY THIS EXISTS: a letter to Joey Orlando claimed "1,281 repos, 89 raw dead, 48 real,
 * OctagonAI is 8 of them" and there is NO SCAN OUTPUT ON DISK anywhere. The live catalogue
 * holds 901 evaluation files, not 1,281. I could not tell whether the catalogue shrank,
 * whether I scanned a different surface, or whether the number was wrong when written —
 * and being unable to tell is itself disqualifying, because the recipient is the same
 * founder I already sent a retraction to for a false accusation on 2026-07-27.
 *
 * ⇒ Every number this prints goes to a file. The root failure was never the arithmetic,
 *   it was publishing figures with no reproducible source.
 *
 * PHASE 0 IS A CONTROL, and it is the point of the whole script:
 * the filenames look like `owner__repo.json`, which would let me skip 900 fetches. But a
 * filename is a PROJECTION of the structured `github_info` field, and auditing a rendering
 * while reporting on the source is precisely the error that cost me the retraction. So the
 * projection gets validated against the structured field on a sample before it is trusted,
 * and if it disagrees even once, every file gets fetched.
 *
 * usage: node ventures/unreached/archestra-rescan.js [--sample 40] [--full]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync(path.join(__dirname, '..', '..', 'credentials', 'github-token'), 'utf8').trim();
const OUT = path.join(__dirname, 'ARCHESTRA-RESCAN.json');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const SAMPLE = parseInt(arg('sample', '40'), 10);

const H = { Authorization: `token ${TOKEN}`, 'User-Agent': 'unreached-rescan', Accept: 'application/vnd.github+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: H });
    if (r.status === 403 || r.status === 429) {                    // rate limited
      const reset = Number(r.headers.get('x-ratelimit-reset') || 0) * 1000 - Date.now();
      const wait = Math.min(Math.max(reset, 2000), 60000);
      console.error(`  rate limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait); continue;
    }
    return { status: r.status, json: r.status === 200 ? await r.json() : null };
  }
  return { status: 0, json: null };                                 // exhausted => UNKNOWN, never "dead"
}

(async () => {
  console.log('fetching catalogue tree…');
  const tree = await api('https://api.github.com/repos/archestra-ai/archestra/git/trees/HEAD?recursive=1');
  const files = tree.json.tree
    .filter(t => /^mcp-catalog\/data\/mcp-evaluations\/.+\.json$/.test(t.path))
    .map(t => t.path);
  console.log(`catalogue holds ${files.length} evaluation files`);

  // ── PHASE 0: validate the filename projection against the structured field ──
  const pick = [];
  for (let i = 0; i < Math.min(SAMPLE, files.length); i++) pick.push(files[Math.floor(i * files.length / Math.min(SAMPLE, files.length))]);
  let agree = 0, disagree = [];
  console.log(`\nPHASE 0 — validating filename projection on ${pick.length} files`);
  for (const p of pick) {
    const r = await api(`https://api.github.com/repos/archestra-ai/archestra/contents/${p}`);
    if (r.status !== 200) continue;
    const c = JSON.parse(Buffer.from(r.json.content, 'base64').toString('utf8'));
    const base = path.basename(p, '.json');
    const [fOwner, fRepo] = base.split('__');
    const gi = c.github_info || {};
    if (gi.owner === fOwner && gi.repo === fRepo) agree++;
    else disagree.push({ file: base, filename: `${fOwner}/${fRepo}`, structured: `${gi.owner}/${gi.repo}` });
  }
  console.log(`  agree ${agree}/${pick.length}   disagree ${disagree.length}`);
  disagree.slice(0, 5).forEach(d => console.log(`    ⛔ ${d.file}: filename=${d.filename} structured=${d.structured}`));

  const trustFilename = disagree.length === 0;
  console.log(trustFilename
    ? '  ⇒ projection validated; using filenames as the index'
    : '  ⇒ ⛔ PROJECTION UNSAFE — every file must be fetched for github_info');

  fs.writeFileSync(OUT, JSON.stringify({
    scanned_at: new Date().toISOString(),
    catalogue_entries: files.length,
    letter_claimed: 1281,
    phase0: { sampled: pick.length, agree, disagree },
    projection_trusted: trustFilename,
  }, null, 2));
  console.log(`\nwrote ${OUT}`);
  console.log('\n⛔ NOTHING IS CLAIMED YET. This run establishes the denominator and whether');
  console.log('   the cheap index is safe. Dead-reference counting is the next phase and it');
  console.log('   does not run until this one is on disk and read.');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
