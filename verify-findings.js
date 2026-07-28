#!/usr/bin/env node
/* verify-findings — the second pass, and the one that makes findings safe to send.
 *
 *   node verify-findings.js <tabIdx> <findings.txt>
 *
 * ⛔ WHY THIS EXISTS. sitecheck.js reports HTTP status from a bare crawler. That is a
 * HYPOTHESIS, not evidence. Four false-positive classes in one batch of twelve local
 * businesses tonight, every one of which would have burned a real prospect:
 *
 *   bill.care/practice/s467   404 to the crawler, REDIRECTS TO A WORKING PAYMENT PAGE
 *                             in a browser. I published this exact claim on my own sales
 *                             page and had to correct it in public an hour earlier.
 *   avvo.com/...              403 — bot-wall, loads fine for a human
 *   fonts.googleapis.com/     404 on a bare root request — not a broken asset
 *   pixel.wp.com, stats.wp.com  no-response — Jetpack beacons, blocked by missing referrer
 *
 * The shared shape: a crawler being refused looks EXACTLY like a resource being dead.
 * Same artifact, two meanings. Which is the failure class I sell audits for — and my own
 * auditor had it.
 *
 * So: anything that is not a hard 404/410 on the site's OWN host gets loaded in a real
 * browser, and what a human would actually see decides it. Costs seconds. Saves the
 * referral graph, which is the only distribution a local audit business has.
 */
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const BD = path.join(__dirname, '..', '..', 'tools', 'browser-do.js');

const TAB = process.argv[2];
const FILE = process.argv[3];
if (!FILE) { console.error('usage: verify-findings.js <tabIdx> <findings.txt>'); process.exit(2); }

const ev = (js) => execFileSync(process.execPath, [BD, 'eval', TAB, js], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);

/* pull "  404   https://..." style rows out of a sitecheck report, tagged with their site */
const rows = [];
let site = null;
for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
  const h = line.match(/^#+\s*(https?:\/\/\S+)/);
  if (h) { site = h[1]; continue; }
  const m = line.match(/^\s+(\d{3}|no response)\s+(https?:\/\/\S+)/);
  if (m && site) rows.push({ site, status: m[1], url: m[2].replace(/&#0?38;/g, '&') });
}

console.log(`${rows.length} reported findings to verify\n`);

const out = [];
for (const r of rows) {
  let verdict, detail;
  try {
    ev(`location.href=${JSON.stringify(r.url)}`);
    sleep(7000);
    const raw = ev(`JSON.stringify({u:location.href,len:(document.body.innerText||'').length,t:document.title,txt:(document.body.innerText||'').slice(0,140)})`);
    const j = JSON.parse(JSON.parse(raw));
    const dead = /404|not found|page (does not|doesn't) exist|no longer available|error/i.test(j.t + ' ' + j.txt);
    if (j.len < 60) { verdict = 'DEAD'; detail = 'empty page'; }
    else if (dead) { verdict = 'DEAD'; detail = j.t.slice(0, 60); }
    else { verdict = 'ALIVE'; detail = `${j.len}c · ${j.t.slice(0, 50)}`; }
    if (j.u !== r.url) detail += ` (→ ${j.u.slice(0, 60)})`;
  } catch (e) { verdict = 'UNKNOWN'; detail = String(e.message).slice(0, 50); }

  const flag = verdict === 'ALIVE' ? '  ⛔ FALSE POSITIVE — DO NOT SEND' : '';
  console.log(`${verdict.padEnd(8)} ${r.status.padEnd(12)} ${r.url.slice(0, 72)}${flag}`);
  if (detail) console.log(`         ${detail}`);
  out.push(Object.assign({}, r, { verdict, detail }));
}

const dest = path.join(__dirname, '..', '..', 'tmp', 'verified-findings.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
const alive = out.filter((r) => r.verdict === 'ALIVE').length;
console.log(`\n${out.length} checked · ${out.length - alive} real · ${alive} FALSE POSITIVES caught before sending`);
console.log(`-> ${dest}`);
