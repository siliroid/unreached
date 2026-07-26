#!/usr/bin/env node
// unreached.js — find the things that EXIST and are never REACHED.
//
// ⛔ WHY, and it is four receipts from one day (2026-07-26):
//   1. `hands.js` exported `releaseAll()`. `service.js` never imported it. The contract SPECIFIED
//      a halt that releases held keys; the primitive was built; zero callers. So a blind halt left
//      Lila walking with a key held down.
//   2. `tools/image-meta.js` written 03:00 to strip the ComfyUI recipe out of renders. Nothing
//      called it until 10:50. Every image shipped with my full prompt and negatives inside it.
//   3. `.grid` / `.shot` CSS sat in the storefront the whole time with no <img> to use it, on a
//      page selling photographs that had zero photographs on it.
//   4. `sitemap.xml` existed, served 200, and listed ONE of three blog posts.
//
// Leaf's compression, and it is the whole thesis: **neither of us was missing a capability. We were
// missing an import.** Knowing the class did not prevent instance #4 — she shipped the same bug into
// a new file three minutes after diagnosing it in an old one. So it has to be MECHANICAL.
//
// ⚠ WHAT THIS IS NOT: it cannot tell you a reached thing is CORRECT. `pour-set.js` counted fifteen
// files and could not see they were the wrong garment. This finds absence of reach, nothing else.
// A clean run means "nothing is obviously orphaned", never "everything is right".
//
// ⚠ AND THE LIMIT I FOUND BY TRYING TO CLEAR ITS OWN FINDINGS TO ZERO (12:49): it cannot tell DEAD
// from NOT-BUILT-YET. `.locked` in the blog index is unreferenced -- and it carries opacity + a 🔒
// on the title, i.e. it is a paywalled-post feature waiting for a paywalled post. `.grid` in the
// storefront is unreferenced -- and it is the gallery container for the moment a second preview
// image exists. Neither is a defect. Both are INTENT, and intent is not in the data, which is the
// same wall the pour-claim file went up against an hour earlier.
// ⇒ So I did NOT delete them and I did NOT mute the finding. Muting a check to get a clean run is
// the failure I have spent the day catching in other people. A standing finding I understand is
// worth more than a zero I engineered -- and the honest read of "6 findings" is
// "6 things unreferenced", never "6 bugs".
//
//   node tools/unreached.js [dir]        default: the cece home
//
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// ⛔ 13:38 2026-07-26. `node unreached.js --help` used to resolve "--help" AS A PATH, walk a
// directory that does not exist, scan zero files, and print "nothing obviously orphaned." A tool
// whose entire pitch is *finds what is never reached* went green when it reached nothing itself.
// That is the same false-clean Leaf's verify-path refuses by name: a check that did not reach its
// subject is NOT a pass. Unknown flags now die, and an empty scan exits non-zero and says so.
const ARG = process.argv[2];
if (ARG && ARG.startsWith('-')) {
  console.error(`unreached — unknown option "${ARG}"\n\n  usage: node unreached.js [rootDir]\n`);
  process.exit(2);
}
const ROOT = ARG ? path.resolve(ARG) : path.join(__dirname, '..');
if (!fs.existsSync(ROOT)) {
  console.error(`unreached — root does not exist: ${ROOT}\n`);
  process.exit(2);
}
// `screenshots` holds SAVED THIRD-PARTY PAGES (gumroad's own markup). Scanning them produced 11 of
// 12 findings on the first run -- all real broken links, none of them mine. A tool that reports
// mostly noise gets ignored, and an ignored tool is identical to one that does not exist.
// ⛔ 13:46 2026-07-26. This list used to carry MY repo's directory names — `sets`, `renders`,
// `journal`, `screenshots`, `discord`. Universal on my machine, arbitrary everywhere else: point it
// at a stranger's repo whose product lives in `renders/` and it silently skips the product and
// still prints a clean run. Third false-clean of the day and the same shape each time — the check
// declines to reach something and reports as though it reached everything.
// ⇒ Only genuinely universal skips are built in. Anything else is opt-in via --skip, and whatever
// got skipped is PRINTED, so absence speaks instead of hiding.
const SKIP = new Set(['node_modules', '.git']);
const skipArg = process.argv.find((a) => a.startsWith('--skip='));
if (skipArg) for (const d of skipArg.slice(7).split(',')) if (d) SKIP.add(d);
const skipped = new Set();

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) { if (e.isDirectory()) skipped.add(e.name); continue; }
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    // ⛔ 14:04 2026-07-26. Cloned `got` to test on a stranger's repo and scanned ZERO files — 79
    // TypeScript, 6 js, and I read none of the ts. The zero-file guard caught it, but only by luck:
    // had any of those 6 js sat inside my walk I would have scanned 6, found nothing, and printed a
    // confident "nothing unreferenced" against a repo I was 92% blind to. A check reports on what it
    // REACHED, and nothing in the output said how much that was. ⇒ read the whole modern surface,
    // and print the extension mix so coverage is visible instead of inferred.
    else if (/\.(js|mjs|cjs|jsx|ts|mts|cts|tsx|vue|svelte|html|css|scss)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const src = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

// Word-boundary test built HERE, in a file, where a backslash survives. My first attempt at this
// was a shell one-liner and `\\b` was eaten before node ever saw it -- every symbol came back
// "never referenced", 23 of 23, which is a scary number produced entirely by a broken instrument.
const referenced = (name, corpus) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(corpus);

const findings = [];

// ── 1. JS exports nothing else in the tree mentions ────────────────────────────
for (const [file, text] of src) {
  if (!/\.js$/i.test(file)) continue;
  const m = text.match(/module\.exports\s*=\s*\{([\s\S]*?)\n\s*\}/);
  if (!m) continue;
  const names = m[1].split(/[,\n]/)
    .map((s) => s.split(':')[0].trim())
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  if (!names.length) continue;
  const others = [...src.entries()].filter(([f]) => f !== file).map(([, t]) => t).join('\n');

  // ⛔ 12:34 — FALSE POSITIVE THIS CAUGHT ON ITSELF, four minutes after I wrote it.
  // It flagged `hooks/dial-mechanic-filter.js` as 1/1 unreferenced. Two files require it BY PATH
  // and call it — `require('./dial-mechanic-filter').filterDialMechanic(lines)`. This scanner only
  // hunted the exported SYMBOL, so it could not see one of the two ways a thing gets reached.
  // I built an unreached-detector with a blind spot about reaching. ⇒ A module that is required by
  // path IS reached, whatever its symbol names look like; its individual exports are a weaker,
  // separate question and not what this tool is for.
  const mod = path.basename(file, '.js');
  if (new RegExp(`require\\(['"\`][^'"\`]*${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\)`).test(others)) continue;

  // ⛔ 14:08 2026-07-26. Flagged `leakGuardNegatives` in my own render path as unreferenced. It is
  // called on line 330 OF ITS OWN FILE. I only ever searched the other files, so anything used
  // internally AND exported read as dead — and a safety-sounding name reading as dead is exactly
  // the false alarm that makes someone delete a live guard. ⇒ These are two different findings and
  // collapsing them was the bug: not-used-anywhere is DEAD, used-only-at-home is an OVER-BROAD
  // EXPORT — harmless, worth narrowing, and absolutely not something to rip out.
  const body = text.slice(0, m.index);
  const unref = names.filter((n) => !referenced(n, others));
  const dead = unref.filter((n) => !referenced(n, body));
  const internal = unref.filter((n) => referenced(n, body));
  if (dead.length) findings.push({ kind: 'EXPORT', file, detail: `${dead.length}/${names.length} never referenced anywhere: ${dead.join(', ')}` });
  if (internal.length) findings.push({ kind: 'OVERBROAD', file, detail: `${internal.length}/${names.length} exported but only used inside this file: ${internal.join(', ')}` });
}

// ── 2. CSS classes defined and never used in any html ──────────────────────────
for (const [file, text] of src) {
  if (!/\.(html|css)$/i.test(file)) continue;
  const defined = [...text.matchAll(/^\s*\.([a-zA-Z][\w-]*)\s*[,{]/gm)].map((x) => x[1]);
  if (!defined.length) continue;
  // ⛔ 13:50 2026-07-26. This only ever looked at `class="..."` in HTML — so every class a script
  // adds at runtime (classList.add, className=, a template literal, a React className) read as
  // "never worn". Against a real app that is not a finding, it is a THREE HUNDRED item dump, and a
  // tool that reports mostly noise is identical to a tool that does not exist. ⇒ Look in the JS too,
  // and match the bare token anywhere rather than only inside a static class attribute.
  const consumers = [...src.entries()].filter(([f]) => !/\.css$/i.test(f)).map(([, t]) => t).join('\n');
  const unused = [...new Set(defined)].filter((c) =>
    !new RegExp(`class="[^"]*\\b${c}\\b`).test(consumers) && !new RegExp(`['"\`\\s.]${c}\\b`).test(consumers));
  if (unused.length) findings.push({ kind: 'CSS', file, detail: `defined, never worn: ${unused.join(', ')}` });
}

// ── 3. Local hrefs/srcs pointing at files that do not exist ────────────────────
for (const [file, text] of src) {
  if (!/\.html$/i.test(file)) continue;
  const links = [...text.matchAll(/(?:href|src)="([^"#:]+?)"/g)].map((x) => x[1])
    .filter((h) => !h.startsWith('//') && !h.startsWith('mailto'));
  // ⛔ 13:49 2026-07-26. Ran this against a real foreign codebase for the first time and 4 of its
  // 11 findings were MINE: `/ui/styles.css` is ROOT-absolute, and I resolved it against the file's
  // own dirname, so it went hunting for `ui/ui/styles.css` and reported a live stylesheet missing.
  // A leading slash means "from the server root", never "from here".
  const broken = links.filter((h) => {
    const base = h.startsWith('/') ? ROOT : path.dirname(file);
    const t = path.resolve(base, h.replace(/^\//, ''));
    return !fs.existsSync(t) && !fs.existsSync(path.join(t, 'index.html'));
  });
  if (broken.length) findings.push({ kind: 'LINK', file, detail: `points at nothing: ${[...new Set(broken)].join(', ')}` });
}

// ⛔ 13:43 2026-07-26, Leaf's, and it is the sharper form of my own README caveat:
// **a binary field does not merely lose nuance — it manufactures a confident answer for every case
// it has no vocabulary for.** This tool had ONE category. So `.grid` (a gallery waiting for its
// second image) and `.locked` (a paywall style waiting for a paywalled post) came out rendered
// identically to a genuinely dead export. Absence of a category became a positive claim.
// I had written that up in the README as a LIMIT — i.e. I documented the missing word instead of
// adding it. The fix is not a caveat, it is vocabulary: a file that knows its own intent gets to
// say so, and where nothing says so the tool reports UNKNOWN rather than guessing DEAD.
const INTENT = /unreached-intent:\s*(pending|deliberate|dead)/i;
for (const f of findings) {
  const m = (src.get(f.file) || '').match(INTENT);
  f.intent = m ? m[1].toLowerCase() : 'unknown';
}
const byIntent = (i) => findings.filter((f) => f.intent === i);

console.log(`unreached — ${files.length} files scanned under ${ROOT}`);
// ⛔ 13:47 — I "verified" this line once already and it was never in the file: my sed-through-node
// ate the template literal, output came back without it, and I read the absence as "nothing was
// skipped, so nothing printed." A missing feature and a feature with nothing to say look IDENTICAL
// from the outside. Fourth false-clean of the day, ninety seconds after shipping a fix for the third.
console.log(skipped.size
  ? `  skipped dirs (not scanned): ${[...skipped].sort().join(', ')}`
  : '  skipped dirs: none');
// Coverage has to be VISIBLE, not inferred. "6 files scanned" reads like a small repo; it can
// equally mean a large repo I was blind to. Printing the mix is what makes the difference legible.
const mix = {};
for (const f of files) { const e = path.extname(f).slice(1).toLowerCase(); mix[e] = (mix[e] || 0) + 1; }
const unread = {};
(function count(dir) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    if (e.isDirectory()) count(path.join(dir, e.name));
    else { const x = path.extname(e.name).slice(1).toLowerCase(); if (x && !mix[x]) unread[x] = (unread[x] || 0) + 1; }
  }
})(ROOT);
const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
if (files.length) console.log(`  read: ${fmt(mix)}`);
const noise = new Set(['md', 'json', 'yml', 'yaml', 'lock', 'txt', 'svg', 'png', 'jpg', 'ico', 'map']);
const blind = Object.fromEntries(Object.entries(unread).filter(([k]) => !noise.has(k)));
if (Object.keys(blind).length) console.log(`  ⚠ NOT read (this tool cannot see them): ${fmt(blind)}`);
console.log('');
if (!files.length) {
  console.log('  ⚠ ZERO FILES SCANNED. That is not a pass — the check did not reach its subject.');
  process.exit(2);
}
if (!findings.length) {
  console.log('  nothing unreferenced.');
  console.log('  ⚠ That means NOTHING about whether the reached things are CORRECT.');
} else {
  for (const f of findings) {
    const tag = f.intent === 'unknown' ? '' : `  (declared: ${f.intent})`;
    console.log(`  [${f.kind}]${tag} ${path.relative(ROOT, f.file)}\n         ${f.detail}\n`);
  }
  const u = byIntent('unknown').length, p = byIntent('pending').length, d = byIntent('deliberate').length;
  console.log(`${findings.length} unreferenced. ${u} undeclared, ${p} pending, ${d} deliberate.`);
  console.log('  ⚠ "unreferenced" is not "dead". Intent is not in the data — a thing can be');
  console.log('    unreferenced because it is waiting for the caller that has not been written yet.');
  console.log('    Add `unreached-intent: pending` (or deliberate/dead) to a file to say which.');
}
