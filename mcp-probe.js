#!/usr/bin/env node
/*
 * mcp-probe.js — is this remote MCP server actually alive?
 *
 * ⛔ THE GAP THIS EXISTS FOR, measured 2026-07-28 on archestra-ai/archestra:
 * 36 of 901 catalogue entries have github_info: null. They are hosted servers, and the
 * endpoint is in `server.url` — a field every repo-oriented scanner ignores. So today a
 * checker either skips them (and its coverage number is quietly a lie) or resolves them
 * like repos (and they read as broken). Both are wrong and neither is visible.
 *
 * ⛔ AND THE CORRECTION THAT MADE THIS WORTH BUILDING: I first concluded the catalogue had
 * "no field for hosted servers" — reasoning from the ABSENCE of github_info. Then I opened
 * an actual entry. `server: {type:"remote", url:"https://mcp.asana.com/sse"}` was right
 * there. The schema is fine; the scanners are looking in the wrong place. I was one
 * paragraph from telling a founder to add a field he already has.
 *
 * ============================================================================
 * WHY "HTTP 200" IS THE WRONG TEST, and why the taxonomy IS the product
 * ============================================================================
 * An MCP endpoint speaks JSON-RPC. A 200 from a marketing page at the same host means
 * nothing. And a huge share of enterprise servers answer 401 — which means RUNNING AND
 * GATED, not dead. Every tool I can find collapses those two, and for a catalogue owner
 * they are opposite facts: one is "working as designed", the other is "delete the row".
 *
 *   alive-open   initialize handshake completed — it spoke MCP back
 *   alive-gated  401/403 — the host is up and refusing anonymous callers. NOT dead.
 *   not-mcp      answered HTTP but did not speak the protocol
 *   dead         DNS failure or connection refused — the strongest claim available
 *   unknown      timeout / rate limit / TLS error. NEVER counted as dead.
 *
 * ⛔ A timeout is not a death certificate. Anything ambiguous lands in `unknown` and is
 * reported as unknown, because the whole reason my link checker ran 56% false positives
 * was a tool that could not tell "refusing me" from "gone".
 *
 * ⛔⛔ UNRESOLVED, 2026-07-28 12:36 — DO NOT PUBLISH THE not-mcp COUNT UNTIL THIS IS CLOSED.
 * windmill.dev/api/mcp/gateway: this probe reports 404/not-mcp. `curl -L` on the identical
 * URL and body reports a 301 to www.windmill.dev and then **405 Method Not Allowed** — an
 * endpoint that EXISTS and refuses POST. I added a 405 -> SSE fallback and it did not fire,
 * which means my probe is not seeing the 405 that curl sees. Two instruments, same input,
 * different answers, cause unknown.
 *
 * Most likely: node fetch and curl differ on how the non-www host is resolved or redirected,
 * so I am comparing two different final URLs and calling it one measurement.
 *
 * ⇒ The three-row "not-mcp" figure is therefore UNSAFE. At least one of the three (windmill)
 *   is probably alive. invideo (404, no redirect) and n8n (301 -> trailing-slash 404) look
 *   real but were measured by the same instrument and inherit the same doubt.
 * ⇒ WHAT IS SAFE and does not depend on this: 36 remote endpoints exist in the catalogue,
 *   they live in `server.url` where every repo-oriented scanner never looks, and 33 of 36
 *   answered as live (8 open, 25 gated). Zero dead. That is the finding.
 *
 * usage: node ventures/unreached/mcp-probe.js [--limit N] [--timeout 8000]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync(path.join(__dirname, '..', '..', 'credentials', 'github-token'), 'utf8').trim();
const OUT = path.join(__dirname, 'MCP-REMOTE-PROBE.json');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('limit', '0'), 10);
const TIMEOUT = parseInt(arg('timeout', '8000'), 10);

const GH = { Authorization: `token ${TOKEN}`, 'User-Agent': 'mcp-probe', Accept: 'application/vnd.github+json' };

async function gh(url) {
  const r = await fetch(url, { headers: GH });
  return r.status === 200 ? r.json() : null;
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// The MCP initialize handshake. If it answers this in JSON-RPC, it is genuinely an MCP
// server and genuinely up — which no status code can establish on its own.
const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'unreached-probe', version: '1.0.0' },
  },
};

// Some servers are SSE-only: they refuse POST-JSON (405) and expect a GET that opens an
// event stream. Refusing a transport is not the same as not being an MCP server, and
// collapsing the two is what produced my first false positive in this category.
async function sseProbe(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.min(TIMEOUT, 6000));
  try {
    const r = await fetch(url, { headers: { accept: 'text/event-stream' }, signal: ac.signal, redirect: 'follow' });
    if (r.status === 401 || r.status === 403) return { state: 'alive-gated', status: r.status, note: 'SSE transport, auth required' };
    const ct = r.headers.get('content-type') || '';
    if (r.ok && /text\/event-stream/i.test(ct)) return { state: 'alive-open', status: r.status, note: 'SSE transport (refuses POST-JSON)' };
    if (r.ok) {
      const body = (await r.text()).slice(0, 800);
      if (/"jsonrpc"\s*:\s*"2\.0"|event:\s*\w/.test(body)) return { state: 'alive-open', status: r.status, note: 'SSE transport' };
    }
    return null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function probe(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(INIT),
      signal: ac.signal,
      redirect: 'follow',
    });
    const status = r.status;
    if ([401, 402, 403, 407].includes(status)) return { state: 'alive-gated', status, note: status === 402 ? 'payment required — live commercial service' : undefined };
    const body = (await r.text()).slice(0, 2000);
    // JSON-RPC reply, or an SSE frame carrying one. Either proves it spoke MCP.
    if (/"jsonrpc"\s*:\s*"2\.0"/.test(body)) {
      if (/"result"/.test(body)) return { state: 'alive-open', status, proto: (body.match(/"protocolVersion"\s*:\s*"([^"]+)"/) || [])[1] };
      if (/"error"/.test(body)) return { state: 'alive-open', status, note: 'jsonrpc error reply — it is speaking MCP' };
    }
    if (status >= 500) return { state: 'unknown', status, note: 'server error — not a death certificate' };
    // ⛔ 405 IS NOT "not an MCP server" — it is an endpoint that EXISTS and refuses POST.
    // My first run labelled windmill.dev not-mcp on a POST-only probe; the endpoint answers
    // 405, i.e. it is alive and almost certainly GET/SSE. That was a 33% false-positive rate
    // inside the one category I was about to sell, and I only found it by re-probing a
    // result that AGREED with me. Transport negotiation is part of liveness, not a detail.
    if (status === 405 || status === 415) {
      const g = await sseProbe(url);
      if (g) return g;
      return { state: 'alive-wrong-transport', status, note: 'endpoint exists, refuses POST-JSON; SSE probe inconclusive' };
    }
    return { state: 'not-mcp', status, sample: body.slice(0, 90).replace(/\s+/g, ' ') };
  } catch (e) {
    const m = String(e.message || e);
    if (/abort/i.test(m)) return { state: 'unknown', note: 'timeout' };
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return { state: 'dead', note: 'DNS does not resolve' };
    if (/ECONNREFUSED/i.test(m)) return { state: 'dead', note: 'connection refused' };
    return { state: 'unknown', note: m.slice(0, 80) };
  } finally { clearTimeout(timer); }
}

// ⛔⛔ RETRACTED 2026-07-28 12:40 — I claimed here that windmill "returns 404 and 405 on
// back-to-back identical requests" and built a thesis on it: that single-shot probing is
// unsound in general and repetition is the moat. THAT WAS WRONG, and the error was mine.
//
// My test loop iterated TWO hosts (windmill.dev and www.windmill.dev) but printed `r.url`
// — the URL AFTER redirect — which is identical for both. So two different requests
// produced two identical-looking labels, and I read the differing statuses as
// non-determinism. Different inputs, same label, and I never checked the label.
// Third instance of the adjacent-property trap in one day.
//
// WHAT IS ACTUALLY TRUE, and it is a better finding:
//   · every one of the 36 endpoints returns 3/3 agreement across three probes. STABLE.
//   · windmill's catalogue URL is the NON-www host, which 404s. The www host answers 405
//     (exists, refuses POST). That is a one-character defect in the catalogue row, and it
//     is invisible unless you follow redirects per-host rather than trusting the final URL.
//
// The repetition arm STAYS — not because endpoints flap (they do not, measured), but
// because a 3/3 column is what converts "I got a status code" into "I measured something",
// and it is what would have caught me had the flapping been real.
async function probeN(url, n = 3) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    runs.push(await probe(url));
    if (i < n - 1) await sleep(400);
  }
  const states = runs.map(r => r.state);
  const uniq = [...new Set(states)];
  if (uniq.length === 1) return { ...runs[0], agreement: `${n}/${n}`, runs: states };
  // Disagreement is a RESULT, not a failure to be smoothed away. Report the best-supported
  // reading and say plainly that the endpoint is inconsistent.
  const tally = {};
  for (const s of states) tally[s] = (tally[s] || 0) + 1;
  const [top, count] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const best = runs.find(r => r.state === top);
  return { ...best, state: 'flapping', settled_as: top, agreement: `${count}/${n}`, runs: states,
           note: `endpoint answered inconsistently across ${n} probes: ${states.join(', ')}` };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const tree = await gh('https://api.github.com/repos/archestra-ai/archestra/git/trees/HEAD?recursive=1');
  let files = tree.tree.filter(t => /^mcp-catalog\/data\/mcp-evaluations\/.+\.json$/.test(t.path)).map(t => t.path);
  if (LIMIT) files = files.slice(0, LIMIT);

  console.log(`scanning ${files.length} entries for remote endpoints…`);
  const remotes = [];
  await pool(files, 8, async (p) => {
    const j = await gh(`https://api.github.com/repos/archestra-ai/archestra/contents/${p}`);
    if (!j) return;
    let c; try { c = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); } catch { return; }
    const s = c.server || {};
    if (s.type === 'remote' && s.url) {
      remotes.push({
        name: path.basename(p, '.json'),
        url: s.url,
        oauth_required: !!(c.archestra_config && c.archestra_config.oauth && c.archestra_config.oauth.required),
      });
    }
  });
  console.log(`found ${remotes.length} remote endpoints — the set no repo-oriented scanner can see\n`);

  console.log(`probing (MCP initialize handshake, ${TIMEOUT}ms)…`);
  let done = 0;
  for (const r of remotes) {
    Object.assign(r, await probeN(r.url, 3));
    const flag = r.state === 'flapping' ? `  ⚠ ${r.runs.join('/')}` : '';
    console.log(`  ${String(++done).padStart(2)}/${remotes.length}  ${r.state.padEnd(11)} ${r.agreement}  ${r.name}${flag}`);
  }

  const by = s => remotes.filter(r => r.state === s);
  const result = {
    scanned_at: new Date().toISOString(),
    source: 'archestra-ai/archestra :: mcp-catalog/data/mcp-evaluations/*.json, server.url where server.type=remote',
    method: 'JSON-RPC initialize handshake, not a status code',
    total_remote: remotes.length,
    counts: {
      'alive-open': by('alive-open').length,
      'alive-gated': by('alive-gated').length,
      'not-mcp': by('not-mcp').length,
      dead: by('dead').length,
      unknown: by('unknown').length,
    },
    caveat: 'alive-gated means RUNNING and requiring auth — it is the opposite of dead, and every scanner I can find collapses the two. unknown is never counted as dead.',
    endpoints: remotes,
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

  console.log(`\n───── RESULT ─────`);
  for (const [k, v] of Object.entries(result.counts)) console.log(`  ${k.padEnd(12)} ${v}`);
  console.log(`\nwrote ${OUT}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
