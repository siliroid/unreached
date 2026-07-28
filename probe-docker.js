#!/usr/bin/env node
/*
 * probe-docker.js — the same instrument, a second catalogue. This is the point.
 *
 * Archestra keys hosted servers on  server: {type: remote, url}
 * Docker    keys hosted servers on  type: remote + remote: {transport_type, url}
 *
 * Same object, two schemas. So the probe stays identical and only the ADAPTER changes —
 * which is what makes this an instrument for a category rather than an audit of one repo.
 *
 * WHY A SECOND REGISTRY MATTERS: one catalogue with a blind spot is an anecdote. Two
 * independent catalogues with the same blind spot is a property of the ecosystem, and only
 * the second one makes it worth anyone's money. Archestra: 36/901 remote (4.0%).
 * Docker sampled: 7/40 (17.5%) — so this is not a small tail.
 *
 * ⚠ HONEST LIMITATION: this reads the YAML with regexes, not a YAML parser. The shape is
 * extremely regular so it holds here, but a nested or quoted edge case would be missed
 * silently. Recorded rather than hidden — and the miss direction is "fewer endpoints
 * found", never "a live endpoint reported dead".
 *
 * usage: node ventures/unreached/probe-docker.js [--limit N]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync(path.join(__dirname, '..', '..', 'credentials', 'github-token'), 'utf8').trim();
const OUT = path.join(__dirname, 'DOCKER-REMOTE-PROBE.json');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('limit', '0'), 10);
const TIMEOUT = 8000;

const H = { Authorization: `token ${TOKEN}`, 'User-Agent': 'mcp-probe', Accept: 'application/vnd.github+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gh = async u => { const r = await fetch(u, { headers: H }); return r.status === 200 ? r.json() : null; };

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'unreached-probe', version: '1.0.0' } } };

async function sseProbe(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(url, { headers: { accept: 'text/event-stream' }, signal: ac.signal, redirect: 'follow' });
    if (r.status === 401 || r.status === 403) return { state: 'alive-gated', status: r.status, note: 'SSE, auth required' };
    if (r.ok && /text\/event-stream/i.test(r.headers.get('content-type') || '')) return { state: 'alive-open', status: r.status, note: 'SSE transport' };
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function probe(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(INIT), signal: ac.signal, redirect: 'follow',
    });
    const status = r.status;
    if ([401, 402, 403, 407].includes(status)) return { state: 'alive-gated', status, note: status === 402 ? 'payment required — live commercial service' : undefined };
    const body = (await r.text()).slice(0, 2000);
    if (/"jsonrpc"\s*:\s*"2\.0"/.test(body)) return { state: 'alive-open', status };
    if (status >= 500) return { state: 'unknown', status, note: 'server error — not a death certificate' };
    if (status === 405 || status === 415) return (await sseProbe(url)) || { state: 'alive-wrong-transport', status };
    return { state: 'not-mcp', status, sample: body.slice(0, 80).replace(/\s+/g, ' ') };
  } catch (e) {
    const m = String(e.message || e);
    if (/abort/i.test(m)) return { state: 'unknown', note: 'timeout' };
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return { state: 'dead', note: 'DNS does not resolve' };
    if (/ECONNREFUSED/i.test(m)) return { state: 'dead', note: 'connection refused' };
    return { state: 'unknown', note: m.slice(0, 70) };
  } finally { clearTimeout(t); }
}

// Three probes. Not because endpoints flap — measured, they do not — but because a
// repeated result is a measurement and a single one is a status code I happened to catch.
async function probeN(url, n = 3) {
  const runs = [];
  for (let i = 0; i < n; i++) { runs.push(await probe(url)); if (i < n - 1) await sleep(350); }
  const states = runs.map(r => r.state);
  if (new Set(states).size === 1) return { ...runs[0], agreement: `${n}/${n}`, runs: states };
  const tally = {}; states.forEach(s => tally[s] = (tally[s] || 0) + 1);
  const [top, c] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return { ...runs.find(r => r.state === top), state: 'flapping', settled_as: top, agreement: `${c}/${n}`, runs: states };
}

(async () => {
  const tree = await gh('https://api.github.com/repos/docker/mcp-registry/git/trees/HEAD?recursive=1');
  let files = tree.tree.filter(t => /^servers\/[^/]+\/server\.yaml$/.test(t.path)).map(t => t.path);
  if (LIMIT) files = files.slice(0, LIMIT);
  console.log(`docker/mcp-registry: ${files.length} server definitions`);

  const remotes = [];
  await pool(files, 10, async (p) => {
    const j = await gh(`https://api.github.com/repos/docker/mcp-registry/contents/${p}`);
    if (!j || !j.content) return;
    const y = Buffer.from(j.content, 'base64').toString('utf8');
    if (!/^type:\s*remote\s*$/m.test(y)) return;
    const url = (y.match(/^\s*url:\s*(\S+)\s*$/m) || [])[1];
    const transport = (y.match(/^\s*transport_type:\s*(\S+)\s*$/m) || [])[1] || '(unstated)';
    if (url) remotes.push({ name: p.split('/')[1], url, transport });
  });
  console.log(`remote endpoints: ${remotes.length}  (${(remotes.length / files.length * 100).toFixed(1)}% of catalogue)\n`);

  let done = 0;
  for (const r of remotes) {
    Object.assign(r, await probeN(r.url, 3));
    console.log(`  ${String(++done).padStart(2)}/${remotes.length}  ${r.state.padEnd(20)} ${r.agreement}  ${r.name}`);
  }

  const count = s => remotes.filter(r => r.state === s).length;
  const result = {
    scanned_at: new Date().toISOString(),
    source: 'docker/mcp-registry :: servers/*/server.yaml where type=remote, remote.url',
    method: 'MCP initialize handshake, 3 probes per endpoint',
    catalogue_size: files.length,
    remote_endpoints: remotes.length,
    counts: Object.fromEntries(['alive-open', 'alive-gated', 'alive-wrong-transport', 'not-mcp', 'dead', 'unknown', 'flapping'].map(s => [s, count(s)])),
    caveat: 'alive-gated = running and requiring auth, the opposite of dead. unknown is never counted dead. YAML read by regex, so the miss direction is fewer-found, never live-reported-dead.',
    endpoints: remotes,
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`\n───── DOCKER ─────`);
  for (const [k, v] of Object.entries(result.counts)) if (v) console.log(`  ${k.padEnd(22)} ${v}`);
  console.log(`\nwrote ${OUT}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
