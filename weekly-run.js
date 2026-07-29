#!/usr/bin/env node
/*
 * weekly-run.js — re-probe the registry, snapshot it, and diff against the last run.
 *
 * THIS IS THE PRODUCT, not the census. The snapshot is free and always will be; what I sell is
 * the DELTA, and a delta needs two points. Until this has run twice there is nothing to sell —
 * which is why it is on a timer rather than in my hands. A weekly artifact that depends on me
 * remembering is not a weekly artifact.
 *
 * Sequence:
 *   1. re-collect the endpoint list (entries publish and vanish continuously)
 *   2. probe with the corrected classifier — per-host serialization, body-before-status,
 *      SSE-aware, 429 as unmeasurable
 *   3. snapshot to snapshots/official-YYYY-MM-DD.json
 *   4. diff against the previous snapshot, write the report
 *
 * ⛔ The diff quarantines transitions to/from `unmeasured`. A row that moves because MY
 * instrument changed is not a change in anyone's infrastructure, and reporting it as "newly
 * broken" would be billing a customer for my own bugs. I corrected my published rate four times
 * on the day I built this; an unquarantined delta would have invoiced for every one.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SNAP = path.join(DIR, 'snapshots');
const REPORTS = path.join(DIR, 'reports');
/* ⛔ LOCAL date, not UTC. toISOString() at 19:25 PDT on the 28th returns 2026-07-29, so every
   evening run named its snapshot and report a day into the future. Cosmetic until it is public —
   and this report IS the public artifact, where a file dated tomorrow makes the whole measurement
   look careless. The numbers were never wrong; the packaging was, which is the half strangers
   judge first. */
const stamp = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
const log = m => {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  fs.appendFileSync(path.join(DIR, 'weekly.log'), line + '\n');
};

const run = (script, args) => execFileSync('node', [path.join(DIR, script), ...args],
  { encoding: 'utf8', timeout: 60 * 60 * 1000, maxBuffer: 1 << 26 });

(async () => {
  fs.mkdirSync(SNAP, { recursive: true });
  const prior = fs.readdirSync(SNAP).filter(f => f.endsWith('.json')).sort();
  log(`weekly run starting — ${prior.length} prior snapshot(s)`);

  try {
    // 1+2. collect and probe. probe-official writes OFFICIAL-REMOTES.json; probe-full fills it in.
    log('collecting endpoint list…');
    run('probe-official.js', ['--pages', '700']);

    log('probing with corrected classifier…');
    // fresh file so a stale state does not suppress re-probing
    const src = JSON.parse(fs.readFileSync(path.join(DIR, 'OFFICIAL-REMOTES.json'), 'utf8'));
    fs.writeFileSync(path.join(DIR, 'OFFICIAL-FULL.json'), JSON.stringify(src, null, 2));
    run('probe-full.js', ['--conc', '24', '--gap', '600', '--checkpoint', '500']);
    // second pass picks up anything the first run could not reach
    run('probe-full.js', ['--retry-unknown', '--conc', '16', '--checkpoint', '200']);

    // 3. snapshot
    const snapFile = path.join(SNAP, `official-${stamp}.json`);
    fs.copyFileSync(path.join(DIR, 'OFFICIAL-FULL.json'), snapFile);
    const d = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
    const probed = d.endpoints.filter(e => e.state).length;
    log(`snapshot written: ${path.basename(snapFile)} (${probed} probed)`);

    // 4. diff — only meaningful from the second run onward
    if (prior.length) {
      const report = run('diff-census.js', ['--latest']);
      fs.mkdirSync(REPORTS, { recursive: true });
      const out = path.join(REPORTS, `delta-${stamp}.md`);
      fs.writeFileSync(out, report);
      log(`delta written: ${path.basename(out)}`);
      const m = /\*\*newly broken\*\* \| (\d+)/.exec(report);
      /* Take the span from the REPORT, never from the schedule this job is named after. It ran
         "weekly" and produced a 3.6-hour delta the first time I watched it, and this line called
         that a week. A log I write is a log I will later read back and believe. */
      const span = /\*\*Measured over ([^*]+)\*\*/.exec(report);
      if (m) log(`newly broken over ${span ? span[1].trim() : 'an UNKNOWN span'}: ${m[1]}`);
    } else {
      log('first run — no prior snapshot, so no delta. The product starts next week.');
    }

    run('report.js', []);
    log('weekly run complete');
  } catch (e) {
    log(`FAILED: ${String(e.message).slice(0, 300)}`);
    process.exit(1);
  }
})();
