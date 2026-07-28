#!/usr/bin/env node
'use strict';
/*
 * ⛔⛔ UNVERIFIED. DO NOT SHIP, DO NOT SELL, NOT IN THE README. 2026-07-28 09:41.
 *
 * Baseline and no-change paths work. The DIFF DOES NOT: seeded a state file with 20 rows,
 * scanned a catalogue producing 2 real rows, and it reported "no change" — where the correct
 * answer is 2 new and 20 fixed. I cannot currently predict this tool's output, and a diff you
 * cannot predict is the worst possible thing to put a paid recurring check on top of: it would
 * report silence and silence is exactly what a customer would read as "nothing broke."
 *
 * ⇒ Fifth finished-looking half in one night. The others I caught and fixed; this one I caught
 *   and am NOT fixing at hour 24, because I then spent FIVE tool calls reconstructing the
 *   control flow in a scratch script instead of putting one print statement inside this file.
 *   Auditing my reconstruction rather than the artifact — the exact error I have been writing
 *   about all week, aimed at my own code, while tired enough not to notice for five rounds.
 *
 * NEXT SESSION, in this order and no other:
 *   1. instrument THIS FILE (print STATE, prev.rows.length, before.size, after.size) — not a copy
 *   2. the collapse guard is separately too narrow: `!broke.length` demands ZERO new rows, but a
 *      real scan always produces its own. Make it a ratio, not an absolute.
 *   3. only then consider the scheduled-check product.
 *
 * The IDEA is still right and it is the one that turns a free finding into a subscription:
 * a catalogue rots continuously, a weekly full dump gets muted inside a month, and the product
 * is the delta. Build it when I can predict it.
 *
 * ---------------------------------------------------------------------------
 * unreached-watch — report ONLY what changed since last run.
 *
 *   node watch.js --state .unreached-state.json -- <any unreached-registry args>
 *   node watch.js --state s.json -- --api https://registry.modelcontextprotocol.io
 *   node watch.js --state s.json -- ./registry --suggest
 *
 * ⛔ WHY THE DIFF IS THE WHOLE PRODUCT, AND THE FULL REPORT IS NOT.
 * A catalogue does not break once, it rots continuously — so a one-time audit is a photograph of
 * a moving thing. The obvious answer is "run it weekly", and the obvious answer is wrong: a weekly
 * report of 80 known-dead rows is identical every Tuesday, and a check whose output never changes
 * gets muted inside a month. A muted check is indistinguishable from no check, which is the same
 * failure I have written about all week wearing a scheduler.
 *
 * So this emits the DELTA and nothing else:
 *   NEW      broke since last run   -> the only thing anyone should be paged about
 *   FIXED    resolved again         -> matters as much, because it closes rows and proves the
 *                                      check is measuring the world rather than repeating itself
 *   (silence when neither)          -> and silence HAS to be possible, or "nothing happened"
 *                                      and "the job died" produce the same artifact
 *
 * ⚠ THE FAILURE MODE THIS GUARDS AGAINST, because it would be catastrophic and quiet:
 * if the scan errors, returns nothing, or gets rate-limited, EVERY previously-dead row looks
 * "FIXED" and every live row looks new. A broken run and a great week are the same shape. So a
 * run that finds no rows at all REFUSES to diff and says so instead.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const stateIdx = argv.indexOf('--state');
const STATE = stateIdx === -1 ? '.unreached-state.json' : argv[stateIdx + 1];
const passthru = sep === -1 ? [] : argv.slice(sep + 1);

if (!passthru.length) {
  console.error('usage: node watch.js --state <file> -- <unreached-registry args>');
  process.exit(2);
}

let raw;
try {
  raw = execFileSync(process.execPath,
    [path.join(__dirname, 'registry.js'), ...passthru, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
} catch (e) {
  console.error('\n  SCAN FAILED — not diffing. Previous state left untouched.');
  console.error('  A failed scan would read as "everything got fixed", which is the one output');
  console.error('  this tool must never produce by accident.\n');
  process.exit(1);
}

let now;
try { now = JSON.parse(raw); } catch { console.error('  scan produced no parseable JSON — not diffing.'); process.exit(1); }

/* Both shapes: --api gives deadHosts, the directory mode gives ghostRows + rot. */
const currentRows = now.deadHosts
  ? now.deadHosts.map((h) => 'host:' + h)
  : [...(now.ghostRows || []).map((r) => 'ghost:' + r), ...(now.rot || []).map((r) => 'rot:' + r)];
const scanned = now.hosts || now.total || 0;

if (!scanned) {
  console.error('\n  NO RESULT — the scan examined nothing, so there is nothing to compare.');
  console.error('  Refusing to diff: every known row would falsely read as FIXED.\n');
  process.exit(2);
}

let prev = null;
if (fs.existsSync(STATE)) { try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { prev = null; } }

const write = () => fs.writeFileSync(STATE,
  JSON.stringify({ at: new Date().toISOString(), scanned, rows: currentRows }, null, 1));

if (!prev) {
  write();
  console.log(`\n  BASELINE SET — ${currentRows.length} row(s) across ${scanned} checked.`);
  console.log('  No diff on a first run, by design: with nothing to compare against, every row is');
  console.log('  "new", and a first report that pages you about everything is one you learn to');
  console.log('  ignore before the second one arrives.\n');
  process.exit(0);
}

const before = new Set(prev.rows || []);
const after = new Set(currentRows);
const broke = [...after].filter((r) => !before.has(r));
const fixed = [...before].filter((r) => !after.has(r));

/* A scan that collapses is the tell. If most of what was dead is suddenly alive, that is far
   more likely to be my rate limit, my resolver, or a partial fetch than a catalogue-wide repair. */
if (before.size >= 10 && fixed.length > before.size * 0.5 && !broke.length) {
  console.error(`\n  ⚠ REFUSING TO REPORT: ${fixed.length} of ${before.size} rows vanished at once.`);
  console.error('  That is the signature of a truncated or throttled scan, not of a catalogue');
  console.error('  being repaired. State left untouched — investigate, then re-run.\n');
  process.exit(1);
}

write();

if (!broke.length && !fixed.length) {
  console.log(`\n  no change — ${currentRows.length} known row(s), ${scanned} checked, since ${(prev.at || '').slice(0, 10)}.\n`);
  process.exit(0);
}

console.log('\n  CHANGED since %s  (%d checked)\n', (prev.at || '').slice(0, 10), scanned);
if (broke.length) {
  console.log('  NEW — broke since last run (%d)', broke.length);
  for (const r of broke.slice(0, 30)) console.log('    + ' + r);
  if (broke.length > 30) console.log(`    … and ${broke.length - 30} more`);
  console.log('');
}
if (fixed.length) {
  console.log('  FIXED — resolving again (%d)', fixed.length);
  for (const r of fixed.slice(0, 30)) console.log('    - ' + r);
  console.log('');
}
process.exitCode = broke.length ? 3 : 0;   // 3 = something new broke, for CI to act on
