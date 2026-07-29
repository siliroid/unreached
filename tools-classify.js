#!/usr/bin/env node
/*
 * tools-classify — derive the verdict from TOOLS-RAW.json, in ONE place, from stored bodies.
 *
 * THE QUESTION (pre-registered in ventures/THE-SEAM-threestate.md, before any data existed):
 *   1. How many live MCP servers expose a tool that MUTATES something?
 *   2. Of those, how many can express FAILURE in their declared contract?
 *   3. Of those, how many can express UNVERIFIABLE — "the call completed and I cannot confirm
 *      the far side committed"?
 *
 * (3) is the thesis. If a write tool's contract is success-or-error, then a write that no-opped
 * and a write that landed are REQUIRED BY THE SCHEMA to return the same artifact. The defect
 * stops being an implementation bug and becomes unrepresentable in the ecosystem's vocabulary.
 *
 * ⛔ THIS FILE ASSERTS NOTHING IT CANNOT SHOW. Every count carries example tool names and the
 * server they came from, because a verdict with no evidence attached is an opinion with a
 * timestamp — I shipped that once and had 158 disputed rows I could not adjudicate.
 *
 * ⛔ AND IF ANY HEADLINE COMES BACK AT 100% OR 0%, SUSPECT ME FIRST. A perfectly uniform result
 * is a tell that the instrument is broken, not that the world is. It has been, twice.
 *
 *   node tools-classify.js [--in TOOLS-RAW.json] [--examples 8]
 */
'use strict';
const fs = require('node:fs');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const IN = arg('--in', 'TOOLS-RAW.json');
const NEX = Number(arg('--examples', '8'));

// MCP declares tool behaviour with annotations. readOnlyHint:true is the server telling us the
// tool does not mutate. That is the protocol's own vocabulary, so use it rather than guessing
// from verbs — but keep the verb heuristic for tools that declare no annotations at all, and
// COUNT THOSE SEPARATELY so the denominator stays honest.
const WRITE_VERB = /^(create|add|insert|update|set|put|patch|delete|remove|write|send|post|submit|file|publish|upload|push|execute|run|invoke|book|pay|charge|transfer|cancel|approve|assign|merge|deploy|provision|register|schedule|move|rename|archive|restore|revoke|grant|issue|refund|sync|import|export_to|apply)[_\-A-Z]/;

// Does anything in this schema admit a third state — a result that is neither success nor error,
// but "I cannot confirm"? Searched literally, and every hit is recorded with its context so the
// claim is checkable rather than asserted.
const THIRD_STATE = /\b(unverified|unverifiable|unconfirmed|not[_\- ]?confirmed|indeterminate|unknown_?status|pending_?confirmation|maybe_?sent|delivery_?unknown|could_?not_?verify|verification_?(status|failed|unavailable)|partially_?(applied|committed)|uncertain)\b/i;
const FAILURE_SHAPE = /\b(isError|is_error|error|success|status|failed|failure)\b/;

function parseTools(body) {
  if (!body) return null;
  // Bodies arrive either as raw JSON or wrapped in an SSE frame (`event: message\ndata: {...}`).
  const m = body.match(/"tools"\s*:\s*\[[\s\S]*/);
  if (!m) return null;
  for (const cand of [body, ...(body.match(/data:\s*(\{[\s\S]*?\})\s*$/gm) || []).map(s => s.replace(/^data:\s*/, ''))]) {
    try {
      const j = JSON.parse(cand.trim());
      const t = j && j.result && j.result.tools;
      if (Array.isArray(t)) return t;
    } catch { /* try next */ }
  }
  return null;
}

const d = JSON.parse(fs.readFileSync(IN, 'utf8'));
const rows = d.results || [];

const stat = {
  endpoints_attempted: d.attempted ?? rows.length,
  live_in_source: d.live_endpoints_in_source ?? null,
  outcomes: d.outcomes || {},
  parsed_tool_lists: 0,
  unparseable_despite_tools_listed: 0,
  servers_with_any_tool: 0,
  servers_with_write_tool: 0,
  write_tools_total: 0,
  write_by_annotation: 0,
  write_by_verb_only: 0,
  tools_with_annotations: 0,
  write_tools_with_input_contract: 0,
  write_tools_with_output_contract: 0,
  write_tools_with_NO_output_contract: 0,
  write_tools_expressing_failure: 0,
  write_tools_expressing_THIRD_STATE: 0,
};
const ex = { write: [], third: [], failure: [], unparseable: [], no_contract: [] };
const push = (a, v) => { if (a.length < NEX) a.push(v); };

for (const r of rows) {
  if (r.outcome !== 'tools-listed') continue;
  const tools = parseTools(r.list_body);
  if (!tools) { stat.unparseable_despite_tools_listed++; push(ex.unparseable, r.url); continue; }
  stat.parsed_tool_lists++;
  if (tools.length) stat.servers_with_any_tool++;

  let serverHasWrite = false;
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    const ann = t.annotations || {};
    const hasAnn = Object.keys(ann).length > 0;
    if (hasAnn) stat.tools_with_annotations++;

    const declaredWrite = hasAnn && ann.readOnlyHint === false;
    const declaredRead = hasAnn && ann.readOnlyHint === true;
    const verbWrite = WRITE_VERB.test(String(t.name || ''));
    const isWrite = declaredWrite || (!declaredRead && verbWrite);
    if (!isWrite) continue;

    serverHasWrite = true;
    stat.write_tools_total++;
    if (declaredWrite) stat.write_by_annotation++; else stat.write_by_verb_only++;
    push(ex.write, `${t.name}  @ ${r.url}`);

    // ⛔ THE MEASUREMENT MOVED HERE, AND THE OLD ONE WAS NOISE. I first searched the WHOLE tool
    // blob for third-state words. On 18 pilot write tools it returned 2 hits — and both were
    // agentra_verify_identity / agentra_authorize_payment matching "unverified", which is the
    // DOMAIN of those tools (KYC status), not a statement about whether the call committed. At
    // 5,722 endpoints that regex would have manufactured hundreds of false hits out of every
    // payment and identity tool in the registry, and the headline would have been unrecoverable.
    //
    // The decidable question is the OUTPUT CONTRACT. 100% of pilot tools declared inputSchema;
    // 22.1% declared outputSchema. A tool whose return shape is undeclared cannot express
    // "I could not confirm this landed" — there is nowhere in the contract for it to live. That
    // is a count of declared fields: no judgement call, no vocabulary collision, nothing to defend.
    if (t.inputSchema) stat.write_tools_with_input_contract++;
    if (t.outputSchema) {
      stat.write_tools_with_output_contract++;
      const out = JSON.stringify(t.outputSchema);
      if (FAILURE_SHAPE.test(out)) { stat.write_tools_expressing_failure++; push(ex.failure, `${t.name} @ ${r.url}`); }
      if (THIRD_STATE.test(out)) {
        stat.write_tools_expressing_THIRD_STATE++;
        push(ex.third, `${t.name} @ ${r.url} :: ${(out.match(THIRD_STATE) || [])[0]}`);
      }
    } else {
      stat.write_tools_with_NO_output_contract++;
      push(ex.no_contract, `${t.name} @ ${r.url}`);
    }
  }
  if (serverHasWrite) stat.servers_with_write_tool++;
}

const pct = (a, b) => b ? ((a / b) * 100).toFixed(2) + '%' : 'n/a';
console.log(`\n  source: ${IN}   harvested_at: ${d.harvested_at}\n`);
console.log(`  DENOMINATOR — stated first, so nothing below floats free`);
console.log(`    live endpoints in source        ${stat.live_in_source}`);
console.log(`    attempted                       ${stat.endpoints_attempted}`);
for (const [k, v] of Object.entries(stat.outcomes).sort((a, b) => b[1] - a[1])) console.log(`      ${String(v).padStart(6)}  ${k}`);
console.log(`    tool lists parsed               ${stat.parsed_tool_lists}`);
console.log(`    ⚠ said tools-listed, would not parse   ${stat.unparseable_despite_tools_listed}`);

console.log(`\n  (1) SERVERS EXPOSING A MUTATING TOOL`);
console.log(`    servers with any tool           ${stat.servers_with_any_tool}`);
console.log(`    servers with a write tool       ${stat.servers_with_write_tool}   (${pct(stat.servers_with_write_tool, stat.servers_with_any_tool)} of servers with tools)`);
console.log(`    write tools total               ${stat.write_tools_total}`);
console.log(`      declared via readOnlyHint:false  ${stat.write_by_annotation}`);
console.log(`      inferred from verb only          ${stat.write_by_verb_only}   ← weaker evidence, kept separate on purpose`);

console.log(`\n  (2) CAN EXPRESS FAILURE`);
console.log(`    ${stat.write_tools_expressing_failure}  (${pct(stat.write_tools_expressing_failure, stat.write_tools_total)} of write tools)`);

console.log(`\n  (3) CAN EXPRESS UNVERIFIABLE  ← the thesis`);
console.log(`    ${stat.write_tools_expressing_THIRD_STATE}  (${pct(stat.write_tools_expressing_THIRD_STATE, stat.write_tools_total)} of write tools)`);

for (const [label, arr] of [['write tools', ex.write], ['express failure', ex.failure], ['EXPRESS THIRD STATE', ex.third], ['unparseable', ex.unparseable]]) {
  if (!arr.length) { console.log(`\n  examples — ${label}: none`); continue; }
  console.log(`\n  examples — ${label}:`);
  for (const e of arr) console.log(`    ${e}`);
}

const heads = [stat.write_tools_expressing_THIRD_STATE / (stat.write_tools_total || 1), stat.write_tools_expressing_failure / (stat.write_tools_total || 1)];
if (heads.some(h => h === 0 || h === 1)) {
  console.log(`\n  ⛔ A HEADLINE CAME BACK AT EXACTLY 0% OR 100%. Suspect the instrument before the`);
  console.log(`     ecosystem — that has been the right call twice. Open the stored bodies and`);
  console.log(`     confirm by hand before this number goes anywhere near a public issue.`);
}
fs.writeFileSync('TOOLS-VERDICT.json', JSON.stringify({ ...stat, examples: ex }, null, 1));
console.log(`\n  wrote TOOLS-VERDICT.json\n`);
