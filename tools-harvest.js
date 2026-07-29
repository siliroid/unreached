#!/usr/bin/env node
/*
 * tools-harvest — ask every live MCP endpoint what tools it declares, and KEEP THE BODY.
 *
 * ⛔ SEPARATE FILE ON PURPOSE. mcp-probe.js is load-bearing for the weekly census, and I have
 * publicly promised a delta on 2026-08-04 off that instrument. You do not modify the thing
 * with a public commitment riding on it to add a feature to a different question.
 *
 * ⛔ HARVEST ONLY. This does not classify anything. It records raw tools/list responses so the
 * verdict can be derived in ONE place, later, by tools-classify.js. I already shipped the other
 * way round: my registry differ stored a state and discarded the evidence, so when 158 rows were
 * disputed they were unadjudicable and I nearly restored the buggy dataset over the corrected one
 * because the buggy run had the bigger number. Store the body. Derive the verdict downstream.
 *
 * ⛔ IT CALLS tools/list AND NOTHING ELSE. It never invokes a tool. Asking a server to describe
 * itself is not touching anybody's data, and the line between those two is the whole reason this
 * census is ethical to run at all.
 *
 *   node tools-harvest.js [--in OFFICIAL-FULL.json] [--out TOOLS-RAW.json] [--limit N] [--conc 12]
 */
'use strict';
const fs = require('node:fs');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const IN = arg('--in', 'OFFICIAL-FULL.json');
const OUT = arg('--out', 'TOOLS-RAW.json');
const LIMIT = Number(arg('--limit', '0'));
const CONC = Number(arg('--conc', '12'));
const TIMEOUT = Number(arg('--timeout', '12000'));

const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'unreached-probe', version: '1.0.0' } },
};
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

async function post(url, payload, sessionHeaders) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(sessionHeaders || {}) },
      body: JSON.stringify(payload), signal: ac.signal, redirect: 'follow',
    });
    // NEVER truncate before matching. Truncation is what stamped 158 healthy servers not-mcp:
    // servers emit {"result":{...large...},"jsonrpc":"2.0","id":1} and the marker lands last.
    const body = await r.text();
    return { status: r.status, body, headers: Object.fromEntries(r.headers) };
  } catch (e) {
    return { status: 0, body: '', error: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

async function harvest(url) {
  const init = await post(url, INIT);
  if (init.status === 0) return { url, phase: 'init', outcome: 'transport-error', error: init.error };
  if ([401, 402, 403, 407].includes(init.status)) return { url, phase: 'init', outcome: 'gated', status: init.status };
  if (!/"jsonrpc"\s*:\s*"2\.0"/.test(init.body)) {
    return { url, phase: 'init', outcome: 'no-mcp-marker', status: init.status, init_body: init.body.slice(0, 4000) };
  }
  // Streamable-HTTP servers hand back a session id that tools/list must carry.
  const sid = init.headers && (init.headers['mcp-session-id'] || init.headers['Mcp-Session-Id']);
  const list = await post(url, LIST, sid ? { 'mcp-session-id': sid } : undefined);
  return {
    url, phase: 'list',
    // ⛔ THIS USED TO BE ONE BUCKET CALLED list-answered, AND IT WAS WRONG IN THE EXACT WAY I
    // SELL AUDITS FOR. It tested only for a jsonrpc marker, so {"result":{"tools":[…]}} and
    // {"error":{"code":-32601}} landed in the same bin — "it replied" standing in for "it told
    // me its tools." The pilot was 20/20 uniform on it; opening the bodies showed 17 real lists
    // and 3 errors. A tally that cannot separate those is not a measurement.
    outcome: list.status === 0 ? 'list-transport-error'
      : !/"jsonrpc"\s*:\s*"2\.0"/.test(list.body) ? 'list-unrecognised'
      : /"error"/.test(list.body) ? 'list-error'
      : /"tools"\s*:\s*\[\s*\]/.test(list.body) ? 'tools-empty'
      : /"tools"\s*:\s*\[/.test(list.body) ? 'tools-listed'
      : 'list-shape-unknown',
    status: list.status,
    error: list.error,
    proto: (init.body.match(/"protocolVersion"\s*:\s*"([^"]+)"/) || [])[1] || null,
    server_name: (init.body.match(/"serverInfo"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/) || [])[1] || null,
    // THE EVIDENCE. Whole body, not a sample. This is the entire point of the file.
    list_body: list.body,
  };
}

(async () => {
  const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const eps = (src.endpoints || []).filter(e => e.state === 'alive-open');
  const targets = LIMIT ? eps.slice(0, LIMIT) : eps;
  console.log(`live endpoints in ${IN}: ${eps.length}${LIMIT ? ` (limited to ${targets.length})` : ''}`);
  console.log(`harvesting tools/list at concurrency ${CONC}…\n`);

  const results = [];
  let done = 0, i = 0;
  const started = Date.now();
  async function worker() {
    while (i < targets.length) {
      const me = i++;
      const r = await harvest(targets[me].url);
      results.push(r); done++;
      if (done % 25 === 0 || done === targets.length) {
        const el = (Date.now() - started) / 1000;
        process.stdout.write(`  ${done}/${targets.length}  ${el.toFixed(0)}s\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, worker));

  const tally = {};
  for (const r of results) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
  const out = {
    harvested_at: new Date().toISOString(),
    source: IN,
    live_endpoints_in_source: eps.length,
    attempted: targets.length,
    elapsed_seconds: Math.round((Date.now() - started) / 1000),
    outcomes: tally,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\n\nwrote ${OUT}`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log(`\n  ⚠ NOTHING IS CLASSIFIED YET. These are transport outcomes, not findings.`);
  console.log(`     A uniform result here means the harvester is broken, not the ecosystem.`);
})();
