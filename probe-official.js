#!/usr/bin/env node
/*
 * probe-official.js — the same instrument, the official MCP registry.
 *
 * Third adapter. Archestra keys hosted servers on server.url, Docker on remote.url +
 * transport_type, and the official registry on server.remotes[] — an ARRAY, so one entry
 * can advertise several endpoints, which neither of the other two schemas allow.
 *
 * WHY THIS ONE MATTERS MORE THAN THE OTHER TWO: it is the official registry, and it is
 * two orders of magnitude bigger. Archestra was 901 entries and Docker 328. This is
 * 60,000+. A census across the two small ones is a property of two catalogues; adding
 * this makes it a property of the ecosystem, which is the difference between an anecdote
 * and a number people cite.
 *
 * ⛔ AND THE INSTRUMENT NOTE, because it cost me five calls: /v0/servers works fine. My
 * curl returned "000" and I read it as the endpoint being down, then guessed three more
 * paths. node fetch with redirect:follow gets 200 first try. Sixth time today I blamed a
 * service for my own tooling.
 *
 * PHASE 1 ONLY collects and dedupes. Nothing is probed until I have seen the real count,
 * because "probe everything" against 60k entries is how you get rate-limited into a
 * partial result that looks complete.
 *
 * usage: node ventures/unreached/probe-official.js [--pages N] [--probe]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'OFFICIAL-REMOTES.json');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const MAXPAGES = parseInt(arg('pages', '700'), 10);
const DO_PROBE = process.argv.includes('--probe');
const TIMEOUT = 8000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'unreached-probe' } });
      if (r.status === 429) { await sleep(3000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1200); }
  }
  return null;
}

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'unreached-probe', version: '1.0.0' } } };

async function probe(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(INIT), signal: ac.signal, redirect: 'follow',
    });
    const status = r.status;
    // 402 is auth too — a live commercial service behind a paywall. Learned that the hard
    // way: I enumerated 401/403 from memory and put a working product in my broken column.
    if ([401, 402, 403, 407].includes(status)) return { state: 'alive-gated', status };
    const body = (await r.text()).slice(0, 1500);
    if (/"jsonrpc"\s*:\s*"2\.0"/.test(body)) return { state: 'alive-open', status };
    if (status >= 500) return { state: 'unknown', status };
    if (status === 405 || status === 415) return { state: 'alive-wrong-transport', status };
    return { state: 'not-mcp', status };
  } catch (e) {
    const m = String(e.message || e);
    if (/abort/i.test(m)) return { state: 'unknown', note: 'timeout' };
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return { state: 'dead', note: 'DNS does not resolve' };
    if (/ECONNREFUSED/i.test(m)) return { state: 'dead', note: 'connection refused' };
    return { state: 'unknown', note: m.slice(0, 60) };
  } finally { clearTimeout(t); }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

(async () => {
  console.log('walking the official registry…');
  let cursor = null, pages = 0, entries = 0, withRemotes = 0;
  const byUrl = new Map();           // url -> { url, type, servers:[names] }
  const t0 = Date.now();

  while (pages < MAXPAGES) {
    const u = 'https://registry.modelcontextprotocol.io/v0/servers?limit=100' +
              (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const j = await api(u);
    if (!j || !j.servers || !j.servers.length) break;
    for (const e of j.servers) {
      entries++;
      const s = e.server || {};
      const rem = s.remotes || [];
      if (!rem.length) continue;
      withRemotes++;
      for (const r of rem) {
        if (!r || !r.url) continue;
        if (!byUrl.has(r.url)) byUrl.set(r.url, { url: r.url, type: r.type || '(unstated)', servers: [] });
        const rec = byUrl.get(r.url);
        if (rec.servers.length < 6) rec.servers.push(s.name);
      }
    }
    pages++;
    if (pages % 50 === 0) console.log(`  ${pages} pages · ${entries} entries · ${byUrl.size} unique endpoints`);
    cursor = j.metadata && j.metadata.nextCursor;
    if (!cursor) break;
  }

  const remotes = [...byUrl.values()];
  console.log(`\nwalked ${entries} entries over ${pages} pages in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`entries advertising a remote: ${withRemotes} (${(withRemotes / entries * 100).toFixed(1)}%)`);
  console.log(`UNIQUE endpoint URLs: ${remotes.length}`);
  const reuse = remotes.filter(r => r.servers.length > 1).length;
  console.log(`endpoints claimed by >1 server: ${reuse}`);

  const result = {
    scanned_at: new Date().toISOString(),
    source: 'registry.modelcontextprotocol.io /v0/servers :: server.remotes[].url',
    entries_walked: entries, pages, entries_with_remotes: withRemotes,
    unique_endpoints: remotes.length, endpoints_shared_by_multiple_servers: reuse,
    probed: false, endpoints: remotes,
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`wrote ${OUT}`);

  if (!DO_PROBE) {
    console.log('\n⛔ NOTHING PROBED. Re-run with --probe once the count above is judged sane.');
    return;
  }

  // Random sample, not the full sweep. Two reasons, and the second is the real one:
  //  1. 10,542 probes is a long run for a number that a sample answers just as well.
  //  2. The FULL row-by-row audit is the thing a registry maintainer pays for. Publishing
  //     it in its entirety for free would be giving away the deliverable to advertise the
  //     deliverable. The ecosystem RATE is the free finding; the list of your broken rows
  //     is the invoice.
  const SAMPLE = parseInt(arg('sample', '1200'), 10);
  let pop = remotes;
  if (SAMPLE && SAMPLE < remotes.length) {
    const rr = (() => { let s = 20260728; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    pop = [...remotes].sort(() => rr() - 0.5).slice(0, SAMPLE);
    console.log(`\nrandom sample: ${pop.length} of ${remotes.length} (seeded, reproducible)`);
  }
  result.sampled = pop.length;
  result.population = remotes.length;

  console.log(`\nprobing ${pop.length} endpoints…`);
  let done = 0;
  await pool(pop, 12, async (r) => {
    Object.assign(r, await probe(r.url));
    if (++done % 100 === 0) console.log(`  ${done}/${remotes.length}`);
  });
  const count = s => remotes.filter(r => r.state === s).length;
  result.probed = true;
  result.counts = Object.fromEntries(
    ['alive-open', 'alive-gated', 'alive-wrong-transport', 'not-mcp', 'dead', 'unknown'].map(s => [s, count(s)]));
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('\n───── OFFICIAL REGISTRY ─────');
  for (const [k, v] of Object.entries(result.counts)) console.log(`  ${k.padEnd(22)} ${v}`);
  console.log(`\nwrote ${OUT}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
