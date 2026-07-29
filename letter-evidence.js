#!/usr/bin/env node
/*
 * letter-evidence — turn one row of WRITE-SURFACE.json into the opening of a letter.
 *
 * The engine, not the pitch. Twelve cold letters that argued a thesis produced zero clicks.
 * A letter that opens with the recipient's OWN number, measured off their own live endpoint,
 * with a command they can paste to check me in ten seconds, is a different object entirely.
 * That fix — "nobody could run it" → "here is the one-liner" — is the only change that has ever
 * moved anything for me.
 *
 * ⛔ IT NEVER ASSERTS A DEFECT. Declaring no outputSchema is not a bug; MCP marks it optional.
 * The claim is narrower and survives contact: if the return shape is undeclared, a write that
 * committed and a write that no-opped are the same artifact to the caller. That is a fact about
 * the contract, not an accusation about their code, and it is the difference between a letter
 * and the registry-rot incident.
 *
 *   node letter-evidence.js <host-substring>      one target
 *   node letter-evidence.js --top 20              the ranked list, no prose
 */
'use strict';
const fs = require('node:fs');
const rows = JSON.parse(fs.readFileSync(__dirname + '/WRITE-SURFACE.json', 'utf8'));

if (process.argv.includes('--top')) {
  const n = Number(process.argv[process.argv.indexOf('--top') + 1] || 20);
  console.log(`\n  ${rows.length} servers expose write tools · ${rows.filter(r => r.write_no_output === r.write).length} declare no output contract on ANY of them\n`);
  console.log(`  undeclared/write   host`);
  for (const r of rows.slice(0, n)) {
    console.log(`  ${String(r.write_no_output).padStart(6)}/${String(r.write).padEnd(5)}  ${r.host.slice(0, 46).padEnd(48)}${(r.server || '').slice(0, 26)}`);
  }
  console.log('');
  process.exit(0);
}

const q = process.argv[2];
if (!q) { console.error('usage: letter-evidence.js <host-substring> | --top N'); process.exit(2); }
const r = rows.find(x => x.host.includes(q) || (x.server || '').toLowerCase().includes(q.toLowerCase()));
if (!r) { console.error(`no server matching "${q}" in WRITE-SURFACE.json`); process.exit(1); }

const all = r.write_no_output === r.write;
const pct = ((r.write_no_output / r.write) * 100).toFixed(0);

console.log(`
───────────────────────────────────────────────────────────────────────────
  ${r.server || r.host}   ${r.url}
  ${r.tools_total} tools · ${r.write} mutating · ${r.write_no_output} with no declared output shape (${pct}%)
  protocol ${r.proto || 'unstated'}
───────────────────────────────────────────────────────────────────────────

OPENING (verify every number against their live endpoint before sending):

Your MCP server at ${r.host} declares ${r.tools_total} tools. ${r.write} of them mutate something${
  all ? ` — and every one of those ${r.write} declares no output schema.` : `, and ${r.write_no_output} of those declare no output schema.`
} ${r.samples.slice(0, 3).map(s => `\`${s}\``).join(', ')} are among them.

That is not a bug and MCP marks outputSchema optional, so I am not telling you something is broken. The narrower thing is this: when the return shape is undeclared, a call that committed and a call that quietly did not are the same artifact to whatever is on the other end. ${
  r.samples.find(s => /create|submit|send|post|pay|charge|transfer|publish|upload/i.test(s))
    ? `\`${r.samples.find(s => /create|submit|send|post|pay|charge|transfer|publish|upload/i.test(s))}\` returning isError:false means your server did not throw. It does not mean the thing exists.`
    : `isError:false means your server did not throw. It does not mean the write landed.`
}

You can check the number yourself in about ten seconds — this is your endpoint, not mine:

  curl -s ${r.url} -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \\
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}' >/dev/null &&
  curl -s ${r.url} -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \\
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \\
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse((s.match(/\\{.*\\}/s)||[s])[0]).result.tools;const w=t.filter(x=>x.annotations&&x.annotations.readOnlyHint===false);console.log(t.length+" tools, "+w.length+" mutating, "+w.filter(x=>!x.outputSchema).length+" without outputSchema")})'

───────────────────────────────────────────────────────────────────────────
  ⚠ BEFORE SENDING: re-probe this host. The census is a snapshot and my own
    letters have already been aged by my own instrument once.
───────────────────────────────────────────────────────────────────────────
`);
