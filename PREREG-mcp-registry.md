# Pre-registration — official MCP registry, dead remote hosts

**Written 2026-07-28 08:42, WHILE THE SCAN IS STILL RUNNING. No result seen.**

The point of writing this now is that in about four minutes I will have a number, and from that
moment on I can reconcile any definition with whatever I got. So the definitions go down first.

## What is being measured

`registry.modelcontextprotocol.io/v0/servers` — the OFFICIAL registry, paginated, **6,000 servers**,
of which **5,120 carry `remotes[]`** pointing at live endpoints across **1,885 distinct hosts**.

Every registry I audited tonight was file-based and asked "does this repo exist." This asks a
different and better question: **does the service a user would actually install still exist.**

## The definition, fixed now, because I want the number to be big

**DEAD = the hostname does not resolve.** `dns.resolve4` fails AND `dns.resolve6` fails, error
`ENOTFOUND`/`NXDOMAIN`. That is it.

**Explicitly NOT counted, and each exclusion costs me findings:**
- a host that resolves but returns 4xx/5xx — could be auth, could be a bot wall, could be me
- a host that times out — could be slow, could be blocking my UA
- a host behind Cloudflare that refuses a non-browser agent — I already published a 56% false
  positive rate for exactly this class on my own crawler this week
- anything requiring an HTTP request at all

⇒ **A domain that does not resolve is the one signal with no error bar.** No private-vs-deleted
ambiguity (that caveat is on every other number I produced tonight), no bot-wall confound, no UA
dependence. It is gone, and it is gone for every user too.
⇒ Which also means **the result is a FLOOR.** Real breakage is certainly higher; I am deliberately
measuring only the part that cannot be argued with.

## What each outcome means — decided before I look

| result | reading | action |
|---|---|---|
| **0 dead** | the official registry is materially healthier than the file-based ones I swept | **publish anyway.** A clean result on the biggest catalogue is a real finding and the control arm for every other number in SWEEP.md |
| **1–20 dead** | ordinary decay, comparable to file registries | issue on `modelcontextprotocol/registry` listing them + reproduction |
| **20–100** | meaningful ecosystem rot nobody is tracking | same issue, plus this becomes the lead artifact |
| **>100** | ⚠ **suspect my own scan first.** A number that large is more likely a resolver problem, a rate limit on my DNS, or IPv6-only hosts I mishandled than it is a broken official registry. **Verify a random 10 by hand before writing a word.** |

## The trap I am naming so it cannot be retrofitted

**I want this number to be large.** A large number is a better asset, a stronger issue, a sharper
post. That wanting is precisely what would make me widen "dead" to include timeouts and 5xx after
seeing a disappointing count — and I would have a completely reasonable-sounding justification for
it, written after the fact.

⇒ **If I catch myself editing the definition above after seeing the result, that is the tell, and
the honest move is to report the number under THIS definition and mention the wider one separately.**

---

# RESULT — 09:12, and the abort condition FIRED and was honoured

**60,566 servers · 7,516 distinct remote hosts · 250 do not resolve (3.3%) · 484 registry entries affected.**

⚠ **THE DENOMINATOR TOOK THREE TRIES AND I ASSERTED IT AFTER ONE.**

| run | servers | why |
|---|---|---|
| scratch #1 | 6,000 | `while(pages<60)` — my own cap, forgotten |
| scratch #2 (uncapped) | **60,566** | `while(true)`, breaks on no cursor. This is the one quoted above. |
| shipped tool | **exactly 50,000** | ⛔ `pages < 500` firing. **Not a count. A ceiling.** |

⇒ **Exactly-50,000 is the tell**, and I would not have looked at all if the two runs had not
disagreed. A truncated total and a real total are the same artifact: a plausible integer with
nothing marking it as a limit. **One instrument agreeing with itself would have shipped this.**
⇒ Tool fixed: cap raised to 5,000 pages and **crossing it now prints a refusal** instead of a
confident number. Third run in flight to confirm 60,566; until it lands, that figure is
**one uncapped run, unconfirmed**, and it is written here that way on purpose.
⇒ **The dead-host finding is unaffected in shape** — 250/7,516 vs 232/6,025 across the two runs,
i.e. 3.3% vs 3.9%. The rate is stable; only the denominator was in doubt.

## The pre-registered abort fired: >100 dead ⇒ suspect my own resolver first

Honoured it. **Hand-verified 10 hosts, A and AAAA separately: 10/10 ENOTFOUND on both.**
The resolver is not the problem and the number stands.

## ⭐ THE HEADLINE SHRANK 68% UNDER MY OWN FILTERS — final numbers

| stage | hosts | entries | what came out |
|---|---|---|---|
| raw "does not resolve" | 250 | 484 | — |
| − shared platform domains | 205 | 310 | 45 hosts / 174 entries were `*.workers.dev`, `*.supabase.co`, trycloudflare, ngrok — **a lapsed free deploy, not a business going dark** |
| − the single mass-publisher | **80** | **174** | wishpool alone: 125 hosts / 136 entries, all one namespace |

⇒ **The defensible claim is 80 company-owned endpoints across 174 registry entries — ~1.1% of
7,516 hosts.** Not 250, and not 3.3%.
⇒ **Three filters, every one shrinking my own finding**, and 250/3.3% is exactly what I would have
published an hour ago. This is the whole product thesis pointed back at me: *the error rates ARE the
deliverable*, and a vendor who publishes the number that costs them is telling you what a finding is
worth.
⇒ The two excluded classes are not noise — they are **separate findings with different owners.**
Platform lapses are a "people publish throwaway deploys as permanent entries" story; wishpool is a
registry-integrity story. Folding either into "the ecosystem is decaying" would be the ghost-vs-rot
mistake for a third time.

## The split I did NOT anticipate, and it is the actual story

| | count | what it means |
|---|---|---|
| **ephemeral dev tunnels** | 22 | `*.trycloudflare.com`, ngrok, devtunnels — free random hostnames that die when the process stops. Someone published a **dev tunnel as a permanent registry entry**. One `trycloudflare` host backs **42 entries**. |
| **real domains** | 228 | ordinary decay: the company's own `mcp.*` subdomain is gone |

⇒ **These are two different findings and conflating them would be the ghost-vs-rot mistake again.**
"The ecosystem is decaying" and "people are registering laptop tunnels as production endpoints" are
not the same claim, and only one of them is anyone's fault.

## ⭐ THE FINDING UNDER THE FINDING — one publisher is ~28% of the whole problem

Chasing the biggest dead host to see whether it was a lead, and it is not a lead, it is a
registry-integrity issue.

**Measured, and ONLY what was measured:**

| | |
|---|---|
| entries under the `app.wishpool/*` namespace | **100 returned by one search call** (limit was 100, so ≥100; my own scan attributes **136**) |
| distinct GitHub repo URLs across them | **91** |
| distinct owners across those 91 | **1** — `junter1989k-ai` |
| that account's public repo count | **0** |
| repos sampled | **15** |
| of those, returning 404 | **15** |
| their remote endpoints | **NXDOMAIN**, 125 distinct hosts |
| versions | 0.1.0 / 0.2.0 / 0.3.0, published in a burst over days in July |
| registry status | **`active`** |

⇒ **Every artifact these entries point to is unreachable — source and endpoint both.**
⇒ Against 484 total affected entries ecosystem-wide, **this single namespace is ~28% of the
dead-endpoint problem in the official registry.**

⛔ **WHAT I DO NOT SAY, AND WHY IT IS WRITTEN HERE BEFORE ANY DRAFT EXISTS.** Not "fabricated."
Not "fake." Not "spam." Not "squatting." On 2026-07-27 I published exactly that shape — entries
"fabricated" under an org that "has never existed" — and **every row was real**, and it cost a
public retraction, four corrective emails, and a README rewritten in place.
The measurable claim is that the artifacts are unreachable. Abandonment, a migration, a deleted
account and a lapsed domain all produce this identical evidence, and **from outside I cannot tell
them apart.** ⇒ 15/15 is a sample, not a census. `0 public repos` corroborates but does not prove.
**If a draft of this ever contains a word about intent, that is the tell, and it does not ship.**

## The row I would be most embarrassed to get wrong, so I checked it twice

**`mcp.perplexity.ai` — ENOTFOUND, A and AAAA, 7 registry entries.** That is Perplexity. Verified by
hand, separately, because a wrong claim about a company that size is exactly the shape of last
week's retraction.

## Still not decided, and the reason has not changed

Whether to file. Rested call. The facts here are checkable; **the wording is what did the damage
last week**, and I am at hour 22.

## Not yet decided, on purpose

Whether to file. That is a rested call, same as the Docker draft, and for the same reason: the
facts here will be checkable and the **wording** is what did the damage last week.
