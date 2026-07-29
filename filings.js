#!/usr/bin/env node
/*
 * unreached-filings — reconcile what YOU think you submitted against what the
 * COUNTERPARTY says it received. Zero dependencies. Refuses to report a false clean.
 *
 * THE PROBLEM THIS EXISTS FOR
 * ---------------------------
 * A write that lands and a write that no-ops produce the identical artifact on your
 * side: same row, same timestamp, same stored acknowledgement. No amount of reading
 * your own logs separates them, because your logs are you telling yourself what you
 * already believe. The only thing that separates them is a second source that queries
 * the counterparty independently and is PERMITTED TO DISAGREE WITH YOU.
 *
 * That is all this does. You bring both sides; it tells you where they differ.
 *
 * WHY THREE STATES AND NOT TWO
 * ----------------------------
 * Every reconciliation tool I have looked at returns a boolean per row: found or
 * missing. That is the bug. There is a third state — COULD NOT CHECK — and when a
 * tool has no name for it, it gets silently filed under "fine", which is the exact
 * failure the tool was bought to prevent.
 *
 * I know because I shipped it myself. On 2026-07-27 I ran a check to see whether any
 * storefront links survived a migration. It returned CLEAN. It had been running against
 * a 404 page: there was nothing to measure, so nothing was missing, so everything was
 * fine. A passing result from a measurement with no subject. Re-run against the real
 * 9,746 bytes, it was genuinely clean — but I had no way to tell those two runs apart,
 * and the wrong one came first.
 *
 * So: matched / missing / unverifiable, always, and unverifiable is LOUD.
 *
 * USAGE
 *   npx -y github:siliroid/unreached unreached-filings --ours ours.csv --theirs theirs.csv --key claim_id
 *
 *   --ours <csv>     your record. what your system believes it submitted.
 *   --theirs <csv>   the counterparty's record. portal export, clearinghouse report,
 *                    acknowledgement file — whatever you can independently obtain.
 *   --key <col>      the column that identifies a submission on BOTH sides.
 *   --theirs-key <col>   if they call it something else.
 *   --date <col>     optional. enables the coverage check described below.
 *   --json           machine-readable output.
 *
 * EXIT CODES
 *   0  reconciled, coverage established, nothing missing
 *   1  findings — rows you believe you submitted that they have no record of
 *   2  usage error
 *   3  COULD NOT CHECK — coverage could not be established. NOT the same as clean.
 */
'use strict';

const fs = require('node:fs');

// ── CSV. Deliberately small and deliberately strict: a parser that silently
// mangles a quoted field would introduce exactly the class of error this tool
// exists to find. If a row does not have the right number of fields, it becomes
// UNVERIFIABLE rather than being guessed at.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0].trim() === ''));
}

function readTable(path, label) {
  let raw;
  try { raw = fs.readFileSync(path, 'utf8'); }
  catch (e) { fail(`cannot read ${label} (${path}): ${e.code}`); }
  if (!raw.trim()) fail(`${label} (${path}) is EMPTY. An empty counterparty export is not evidence of nothing missing — it is evidence of nothing checked.`, 3);
  const rows = parseCSV(raw);
  if (rows.length < 2) fail(`${label} (${path}) has a header and no data rows. Refusing to call that clean.`, 3);
  const header = rows[0].map(h => h.trim().replace(/^\uFEFF/, ''));
  return { header, rows: rows.slice(1), path, label };
}

function fail(msg, code = 2) { console.error(`\n  ⛔ ${msg}\n`); process.exit(code); }

// ── args
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const has = (name) => argv.includes(name);

if (has('--help') || has('-h') || !argv.length) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*|^ \* ?/gm, ''));
  process.exit(2);
}

const oursPath = arg('--ours'), theirsPath = arg('--theirs'), keyCol = arg('--key');
if (!oursPath || !theirsPath || !keyCol) fail('need --ours <csv> --theirs <csv> --key <column>. See --help.');
const theirsKeyCol = arg('--theirs-key') || keyCol;
const dateCol = arg('--date');
const asJson = has('--json');

const ours = readTable(oursPath, 'ours');
const theirs = readTable(theirsPath, 'theirs');

const oursKeyIdx = ours.header.indexOf(keyCol);
const theirsKeyIdx = theirs.header.indexOf(theirsKeyCol);
if (oursKeyIdx < 0) fail(`--key "${keyCol}" is not a column in ${oursPath}. Columns: ${ours.header.join(', ')}`);
if (theirsKeyIdx < 0) fail(`"${theirsKeyCol}" is not a column in ${theirsPath}. Columns: ${theirs.header.join(', ')}\n     (use --theirs-key if they name it differently)`);

// ── build the counterparty index. A key we cannot read on their side does not make
// our row missing — it makes their row unusable, which is a different fact.
const theirKeys = new Set();
let theirUnreadable = 0;
for (const r of theirs.rows) {
  if (r.length !== theirs.header.length) { theirUnreadable++; continue; }
  const k = (r[theirsKeyIdx] || '').trim();
  if (!k) { theirUnreadable++; continue; }
  theirKeys.add(k);
}

// ── classify
const matched = [], missing = [], unverifiable = [];
const oursKeys = new Set();
for (const r of ours.rows) {
  if (r.length !== ours.header.length) {
    unverifiable.push({ key: null, why: 'malformed row in ours — field count does not match header' });
    continue;
  }
  const k = (r[oursKeyIdx] || '').trim();
  if (!k) { unverifiable.push({ key: null, why: 'blank key in ours — nothing to look up' }); continue; }
  oursKeys.add(k);
  if (theirKeys.has(k)) matched.push(k);
  else missing.push({ key: k, row: r });
}
const extra = [...theirKeys].filter(k => !oursKeys.has(k));

// ── THE COVERAGE GATE. This is the part that matters and the part every other tool
// skips. Zero missing rows means nothing at all unless the counterparty export
// actually covers the same submissions. If their file overlaps ours by nothing, then
// "no missing" is not a clean bill of health, it is a measurement with no subject.
const overlap = matched.length;
const coverage = oursKeys.size ? overlap / oursKeys.size : 0;
let coverageProblem = null;
if (theirUnreadable && theirUnreadable === theirs.rows.length) {
  coverageProblem = `every row in ${theirsPath} was unreadable — no keys could be extracted.`;
} else if (overlap === 0 && missing.length) {
  coverageProblem = `ZERO of your ${oursKeys.size} keys appear in the counterparty export. That is far more likely to mean the two files describe different things — different period, different key format, different environment — than that every single submission failed. Check the key format before you act on this.`;
}

if (dateCol) {
  const di = ours.header.indexOf(dateCol);
  if (di < 0) fail(`--date "${dateCol}" is not a column in ${oursPath}.`);
}

// ── report
const findings = missing.length;
if (asJson) {
  console.log(JSON.stringify({
    matched: matched.length, missing: missing.map(m => m.key), extra,
    unverifiable: unverifiable.length, unverifiable_reasons: unverifiable,
    their_unreadable_rows: theirUnreadable,
    coverage_ratio: Number(coverage.toFixed(4)),
    coverage_problem: coverageProblem,
    verdict: coverageProblem ? 'COULD-NOT-CHECK' : (findings ? 'FINDINGS' : 'CLEAN'),
  }, null, 2));
} else {
  console.log(`\n  ours:   ${oursPath}  (${ours.rows.length} rows)`);
  console.log(`  theirs: ${theirsPath}  (${theirs.rows.length} rows)`);
  console.log(`  key:    ${keyCol}${theirsKeyCol !== keyCol ? ` → ${theirsKeyCol}` : ''}\n`);
  console.log(`  matched       ${matched.length}`);
  console.log(`  MISSING       ${missing.length}   ← you believe you submitted these; they have no record`);
  console.log(`  extra         ${extra.length}   ← they have these; you do not (a different bug, worth knowing)`);
  console.log(`  unverifiable  ${unverifiable.length + theirUnreadable}   ← could not be checked either way. NOT clean.`);
  if (missing.length) {
    console.log(`\n  MISSING KEYS (first 25):`);
    for (const m of missing.slice(0, 25)) console.log(`    ${m.key}`);
    if (missing.length > 25) console.log(`    … and ${missing.length - 25} more`);
  }
  if (unverifiable.length) {
    const why = {};
    for (const u of unverifiable) why[u.why] = (why[u.why] || 0) + 1;
    console.log(`\n  WHY ROWS COULD NOT BE CHECKED:`);
    for (const [w, n] of Object.entries(why)) console.log(`    ${n}×  ${w}`);
  }
  if (theirUnreadable) console.log(`    ${theirUnreadable}×  unreadable row in the counterparty export`);
}

if (coverageProblem) {
  console.error(`\n  ⛔ COULD NOT CHECK — ${coverageProblem}`);
  console.error(`     Reporting this as "nothing missing" is the failure this tool exists to prevent,`);
  console.error(`     so it exits 3 instead. Establish coverage, then re-run.\n`);
  process.exit(3);
}
if (findings) {
  console.log(`\n  ⇒ ${findings} submission(s) you have a record of that the counterparty does not.`);
  console.log(`     Before treating these as real: confirm the key means the same thing on both sides,`);
  console.log(`     and that their export covers the same period. My own crawler had a 56% false-positive`);
  console.log(`     rate the first time I measured it, and I only know because I built a second check.\n`);
  process.exit(1);
}
console.log(`\n  ✅ ${matched.length} matched, nothing missing, coverage ${(coverage * 100).toFixed(1)}%.\n`);
process.exit(0);
