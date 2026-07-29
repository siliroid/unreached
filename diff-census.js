#!/usr/bin/env node
/*
 * diff-census.js — what CHANGED between two census runs.
 *
 * The snapshot is free and always will be. What decays is its accuracy: entries publish,
 * deployments vanish, things come back. A maintainer does not want the same 1,154-row CSV
 * every month — they want the twenty rows that moved. That delta is the product, and it is
 * the thing I told a company in writing that I sell, which is why it exists.
 *
 * FIVE CATEGORIES, and the last two are the ones nobody else reports:
 *   newly-broken     answered last time, does not now        <- the alert
 *   newly-recovered  broken last time, answers now           <- proof the check is worth having
 *   still-broken     broken in both runs                     <- the backlog, with an age
 *   new-endpoint     absent from the previous run entirely   <- someone published
 *   delisted         present before, gone from the registry  <- someone removed it
 *
 * ⛔ A ROW MOVING FROM `unknown` IS NOT A CHANGE IN THE WORLD. If I could not measure an
 * endpoint last run and can this one, that is a change in MY instrument, not in their
 * infrastructure, and reporting it as "newly broken" would be exactly the error I corrected
 * publicly today — my own load recorded as someone else's rot. Transitions involving
 * `unknown` on either side are counted separately and never alerted on.
 *
 * usage:
 *   node diff-census.js <old.json> <new.json> [--org smithery.ai] [--json]
 *   node diff-census.js --latest                # newest two in snapshots/
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SNAP = path.join(__dirname, 'snapshots');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const ORG = arg('org', null);
const AS_JSON = process.argv.includes('--json');

const BROKEN = new Set(['dead', 'not-mcp', 'alive-wrong-transport', 'flaky']);
const ALIVE = new Set(['alive-open', 'alive-gated']);
const cls = s => (BROKEN.has(s) ? 'broken' : ALIVE.has(s) ? 'alive' : 'unmeasured');

/* Human-readable span between two snapshots, derived from their own timestamps.
   Returns an explicit "unknown" rather than guessing — a fabricated interval is worse
   than an absent one, because a reader will trust it. */
function interval(a, b) {
  const ta = Date.parse(a), tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) {
    return '**Interval: unknown** — one or both snapshots carry no usable timestamp, '
      + 'so these counts have no denominator. Treat as a list, not a rate.';
  }
  const hours = Math.abs(tb - ta) / 36e5;
  const span = hours < 48
    ? `${hours.toFixed(1)} hours`
    : `${(hours / 24).toFixed(1)} days`;
  return `**Measured over ${span}** (${a} → ${b}). All counts below are for this span only, `
    + 'not annualised and not extrapolated.';
}

function loadPair() {
  if (process.argv.includes('--latest')) {
    const files = fs.readdirSync(SNAP).filter(f => f.endsWith('.json')).sort();
    if (files.length < 2) {
      console.error(`need two snapshots in ${SNAP}; found ${files.length}.`);
      console.error('a diff needs a previous run — take a baseline, probe again later, then diff.');
      process.exit(1);
    }
    return files.slice(-2).map(f => path.join(SNAP, f));
  }
  const [a, b] = process.argv.slice(2).filter(x => !x.startsWith('--'));
  if (!a || !b) { console.error('usage: diff-census.js <old.json> <new.json> | --latest'); process.exit(1); }
  return [a, b];
}

/* ⛔ `rows` USED TO DROP EVERY STATELESS ROW (`if (e.state) m.set(...)`), AND THE
   DELISTED LOOP THEN READ ITS ABSENCE AS A DELETION. An endpoint the crawler never
   got round to probing and an endpoint someone removed from the registry produced
   the IDENTICAL artifact — missing from the Map — and nothing downstream could tell
   them apart. On 2026-07-29 that reported 58 delisted endpoints. The true number was
   zero: all 58 were sitting in the very file being read, unprobed, and I published
   the count on a sales page whose pitch is that I separate instrument changes from
   world changes. I did that in one branch and not the other.
   `seen` is every url the file contains. `rows` is only the ones carrying a verdict.
   Delisting is now decided against `seen` — presence in the file — never against a
   Map that quietly excludes rows for a reason unrelated to the question. */
const index = (file) => {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = new Map(), seen = new Set(); let unprobed = 0;
  for (const e of d.endpoints) {
    seen.add(e.url);
    if (e.state) rows.set(e.url, e); else unprobed++;
  }
  return { when: d.updated_at || d.verified_at || 'unknown', rows, seen, unprobed };
};

(function main() {
  const [fOld, fNew] = loadPair();
  const A = index(fOld), B = index(fNew);

  const match = u => !ORG || u.toLowerCase().includes(ORG.toLowerCase());

  const out = { newlyBroken: [], newlyRecovered: [], stillBroken: [], newEndpoint: [], delisted: [], measurementOnly: 0 };

  for (const [url, now] of B.rows) {
    if (!match(url)) continue;
    const before = A.rows.get(url);
    const cNow = cls(now.state);

    /* ⛔ THE MIRROR OF THE DELISTED BUG, and I shipped the delisted fix an hour before
       finding this one. `A.rows` excludes rows the previous run never probed, so a row
       that WAS in the old file but carried no verdict looked like a brand-new arrival.
       22 of the 39 "newly published" on 2026-07-29 were phantoms of exactly that kind.
       Absent-from-the-file is a world change. Present-but-unprobed is an instrument
       change, in BOTH directions, and it has to be asked against `seen` either way. */
    if (!before) {
      if (A.seen.has(url)) { out.measurementOnly++; continue; }   // was there, we just never looked
      if (cNow !== 'unmeasured') out.newEndpoint.push({ url, state: now.state, servers: now.servers });
      continue;
    }
    const cWas = cls(before.state);

    // an instrument change is not a world change
    if (cWas === 'unmeasured' || cNow === 'unmeasured') { out.measurementOnly++; continue; }

    if (cWas === 'alive' && cNow === 'broken') {
      out.newlyBroken.push({ url, was: before.state, now: now.state, status: now.status, servers: now.servers });
    } else if (cWas === 'broken' && cNow === 'alive') {
      out.newlyRecovered.push({ url, was: before.state, now: now.state });
    } else if (cWas === 'broken' && cNow === 'broken') {
      out.stillBroken.push({ url, state: now.state, status: now.status });
    }
  }

  for (const [url, before] of A.rows) {
    if (!match(url)) continue;
    if (B.seen.has(url)) continue;                 // still listed — probed or not
    out.delisted.push({ url, lastState: before.state });
  }
  out.unprobedNow = B.unprobed;

  if (AS_JSON) { console.log(JSON.stringify({ from: A.when, to: B.when, org: ORG, ...out }, null, 2)); return; }

  const L = [];
  L.push(`# Endpoint delta${ORG ? ` — ${ORG}` : ''}`);
  L.push('');
  L.push(`${path.basename(fOld)} → ${path.basename(fNew)}`);
  L.push('');

  /* ⛔ THE DELTA MUST STATE ITS OWN INTERVAL. Without this line the report said
     "newly broken: 1" and nothing else, while weekly-run.js logged the same figure as
     "NEWLY BROKEN THIS WEEK" — over a gap that was actually 10.5 hours. An accrual rate
     whose denominator is implied is not a measurement, it is a number people will assume
     the denominator of, and they will assume the one in the filename. I have publicly
     promised a recurring delta; publishing a ten-hour count under a weekly heading is
     exactly the sloppiness that would undo two careful public corrections. Derived from
     the snapshot timestamps, never from the schedule it was supposed to run on. */
  L.push(interval(A.when, B.when));
  L.push('');
  L.push(`| change | count |`);
  L.push(`|---|---:|`);
  L.push(`| **newly broken** | ${out.newlyBroken.length} |`);
  L.push(`| newly recovered | ${out.newlyRecovered.length} |`);
  L.push(`| still broken | ${out.stillBroken.length} |`);
  L.push(`| newly published | ${out.newEndpoint.length} |`);
  L.push(`| delisted | ${out.delisted.length} |`);
  L.push('');
  L.push(`${out.measurementOnly} rows moved to or from unmeasurable and are excluded — that is a`);
  L.push(`change in the instrument, not in anyone's infrastructure.`);
  L.push('');

  /* ★ COVERAGE IS A PRODUCT SURFACE, NOT AN IMPLEMENTATION DETAIL — and it is the one line
     that separates this from every other monitor in the category.

     A vendor whose coverage silently drops is INDISTINGUISHABLE from a vendor whose customers
     are healthy: both send a quiet report. The buyer cannot tell "nothing broke" from "I
     stopped looking." That is the exact failure I sell against, and I committed it twice in
     one night — 59 unprobed rows manufactured 58 delistings, 23 unprobed rows manufactured
     22 arrivals. Both directions, both invisible, both flattering.

     So the delta states what it managed to look at, per run, on its face. A delta's
     trustworthiness is bounded by the WORSE of its two snapshots, so both get published and
     the customer holds me to the number. Same move as publishing my false-positive rate,
     except structural rather than confessional: it ships in every report, forever, without
     anyone deciding to be honest that day. */
  const cov = (s) => `${(s.seen.size - s.unprobed).toLocaleString()} of ${s.seen.size.toLocaleString()} (${(100 * (s.seen.size - s.unprobed) / s.seen.size).toFixed(1)}%)`;
  L.push(`## Coverage — what I actually managed to look at`);
  L.push('');
  L.push(`| run | endpoints reached |`);
  L.push(`|---|---:|`);
  L.push(`| ${path.basename(fOld)} | ${cov(A)} |`);
  L.push(`| ${path.basename(fNew)} | ${cov(B)} |`);
  L.push('');
  L.push(`A row I did not reach is not a row that changed. Unreached rows are excluded from every`);
  L.push(`count above rather than being read as an arrival or a removal, and the totals here are`);
  L.push(`what that exclusion is measured against. If this number falls, trust the delta less —`);
  L.push(`that is what it is published for.`);
  L.push('');

  if (out.newlyBroken.length) {
    L.push('## Newly broken');
    L.push('');
    for (const r of out.newlyBroken) {
      L.push(`- \`${r.url}\` — was \`${r.was}\`, now \`${r.now}\`${r.status ? ` (${r.status})` : ''}`);
      const n = [...new Set(r.servers || [])];
      if (n.length) L.push(`  claimed by ${n.map(x => `\`${x}\``).join(', ')}`);
    }
    L.push('');
  }
  if (out.newlyRecovered.length) {
    L.push('## Newly recovered');
    L.push('');
    for (const r of out.newlyRecovered) L.push(`- \`${r.url}\` — was \`${r.was}\`, now \`${r.now}\``);
    L.push('');
  }
  if (out.delisted.length) {
    L.push('## Delisted from the registry');
    L.push('');
    for (const r of out.delisted) L.push(`- \`${r.url}\` — last seen \`${r.lastState}\``);
    L.push('');
  }
  if (out.newEndpoint.length) {
    L.push(`## Newly published (${out.newEndpoint.length})`);
    L.push('');
    for (const r of out.newEndpoint.slice(0, 40)) L.push(`- \`${r.url}\` — \`${r.state}\``);
    if (out.newEndpoint.length > 40) L.push(`- …and ${out.newEndpoint.length - 40} more`);
    L.push('');
  }
  L.push(`Still broken: ${out.stillBroken.length}. Full rows in \`broken-rows.csv\`.`);

  console.log(L.join('\n'));
})();
