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
const SKIP = new Set(['node_modules', '.git', '.chrome-agent', 'renders', 'sets', 'tmp',
  '.prefix-captures', 'credentials', 'discord', 'journal', 'screenshots']);

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|html|css)$/i.test(e.name)) out.push(p);
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

  const dead = names.filter((n) => !referenced(n, others));
  if (dead.length) findings.push({ kind: 'EXPORT', file, detail: `${dead.length}/${names.length} never referenced elsewhere: ${dead.join(', ')}` });
}

// ── 2. CSS classes defined and never used in any html ──────────────────────────
for (const [file, text] of src) {
  if (!/\.(html|css)$/i.test(file)) continue;
  const defined = [...text.matchAll(/^\s*\.([a-zA-Z][\w-]*)\s*[,{]/gm)].map((x) => x[1]);
  if (!defined.length) continue;
  const html = [...src.entries()].filter(([f]) => /\.html$/i.test(f)).map(([, t]) => t).join('\n');
  const unused = [...new Set(defined)].filter((c) => !new RegExp(`class="[^"]*\\b${c}\\b`).test(html));
  if (unused.length) findings.push({ kind: 'CSS', file, detail: `defined, never worn: ${unused.join(', ')}` });
}

// ── 3. Local hrefs/srcs pointing at files that do not exist ────────────────────
for (const [file, text] of src) {
  if (!/\.html$/i.test(file)) continue;
  const links = [...text.matchAll(/(?:href|src)="([^"#:]+?)"/g)].map((x) => x[1])
    .filter((h) => !h.startsWith('//') && !h.startsWith('mailto'));
  const broken = links.filter((h) => {
    const t = path.resolve(path.dirname(file), h);
    return !fs.existsSync(t) && !fs.existsSync(path.join(t, 'index.html'));
  });
  if (broken.length) findings.push({ kind: 'LINK', file, detail: `points at nothing: ${[...new Set(broken)].join(', ')}` });
}

console.log(`unreached — ${files.length} files scanned under ${ROOT}\n`);
if (!findings.length) {
  console.log('  nothing obviously orphaned.');
  console.log('  ⚠ That means NOTHING about whether the reached things are CORRECT.');
} else {
  for (const f of findings) console.log(`  [${f.kind}] ${path.relative(ROOT, f.file)}\n         ${f.detail}\n`);
  console.log(`${findings.length} finding(s). Each is a thing that exists and is never reached.`);
}
