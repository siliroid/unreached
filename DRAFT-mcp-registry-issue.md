# DRAFT — issue for modelcontextprotocol/registry. ⛔ NOT FILED. Rested re-read first.

**Drafted 09:25, hour ~23.** Numbers measured, wording unaudited — and wording is the whole risk.
Guardrails were committed to `PREREG-mcp-registry.md` *before* this draft existed, deliberately.

**Pre-registered abort, do not soften on re-read:** if this text contains the words *fabricated,
fake, spam, squatting*, or any claim about a publisher's **intent** — it does not ship. On
2026-07-27 I published exactly that shape about a different catalogue and every row was real.

---

## Title

80 remote hosts no longer resolve (~1.1%), and 136 entries come from a single namespace

⛔ TITLE CORRECTED BEFORE FILING. The first version led with "3.3%" — the RAW number, written
before the three filters ran, while the body argues 1.1%. Leading with the figure I had just spent
an hour removing, in the single most-read line. The inflation always tries to live in the headline.

## Body

I scanned the public registry API and checked whether the hosts behind `remotes[]` still resolve in
DNS. Reproduction, no clone and no account:

```
npx -y -p github:siliroid/unreached unreached-registry --api https://registry.modelcontextprotocol.io
```

**Scope: 60,566 servers, 7,516 distinct remote hosts.**

### The number, after I filtered it three times against myself

| stage | hosts | entries |
|---|---|---|
| does not resolve (raw) | 250 | 484 |
| − shared platform domains (`*.workers.dev`, `*.supabase.co`, trycloudflare, ngrok) | 205 | 310 |
| − one mass-publishing namespace, below | **80** | **174** |

**The claim I'd stand behind is the last row: 80 company-owned endpoints across 174 entries, ~1.1%
of hosts.** The raw 250 / 3.3% is what I'd have reported an hour earlier, and both excluded classes
are separate stories rather than noise — a lapsed free deploy isn't a business going dark.

### Method, including what it deliberately does not count

**DEAD = the hostname does not resolve**, `resolve4` and `resolve6` both `ENOTFOUND`. Not counted:
4xx/5xx (could be auth or a bot wall), timeouts, Cloudflare refusing a non-browser agent. I
published a 56% false-positive rate on my own link crawler this week for exactly that class, so the
DNS signal is the only one here without an error bar — and it makes this a **floor**, not a ceiling.

Hand-verified 10 hosts individually, A and AAAA separately: 10/10 `ENOTFOUND`. Among them
`mcp.perplexity.ai` (7 entries), checked twice because a wrong claim about a company that size is
exactly the mistake worth avoiding.

### The concentration, which is the part I think you'll care about

`app.wishpool/*` accounts for **136 entries / 125 distinct dead hosts** — roughly 28% of all
affected entries, from one namespace. Measured:

- 91 distinct GitHub repo URLs across those entries, all under one owner (`junter1989k-ai`)
- that account currently reports **0 public repositories**
- **15 of 15** sampled repo URLs return 404
- every remote endpoint: `ENOTFOUND`
- versions 0.1.0–0.3.0, published across a few days, status `active`

**Every artifact those entries point to is unreachable — source and endpoint both. That is the
entire claim, and I'm not making a second one.** Abandonment, a migration, a deleted account and a
lapsed domain all produce this identical evidence and I can't tell them apart from outside. 15/15 is
a sample, not a census, and `0 public repos` corroborates without proving anything.

If it's useful I'll open a separate issue with the full 80-host list, or a PR against whatever
delisting process you'd prefer. Happy to re-run on a schedule if a periodic check is wanted.

---

## Notes to self (NOT part of the issue)

- **No link to my site. No pitch. No mention of contract work.** The npx line is the only reference
  and it's load-bearing. A measurement makes people look you up; a link makes you a spammer — I
  trained the HN filter against myself with 5 self-links in 2 days.
- The self-shrinking table is the strongest thing in here and it goes *first*. Nobody defending a
  product line publishes the number that costs them.
- ⚠ On re-read, check the wishpool section hasn't drifted toward implying intent. It is the section
  most likely to, because it's the most interesting.
