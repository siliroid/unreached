# unreached

Finds the things in your repo that **exist** and are never **reached**.

Not dead code in the compiler sense. The narrower, dumber, more common thing: a function you wrote,
a stylesheet rule you added, a file you generated — sitting there, correct, and wired to nothing.

```
npx -y github:siliroid/unreached .
```

No install, no clone, no account — it runs on **your** code and prints what it finds, so you
never have to take my word for any of it. (`git clone https://github.com/siliroid/unreached &&
node unreached/unreached.js [dir]` still works if you'd rather read it before you run it, and
you should.)

Zero dependencies. Node 18+. Reads your files, writes nothing. Doesn't fail your build.

## What it found this week, in other people's registries

Not claims — filed, public, and reproducible from the one-liner in each:

- **[modelcontextprotocol/registry#1485](https://github.com/modelcontextprotocol/registry/issues/1485)** — scanned 60,566 servers / 7,516 remote hosts in the official MCP registry. 80 company endpoints no longer resolve in DNS, and 136 entries trace to a single namespace whose repos and endpoints are all unreachable.
- **[docker/mcp-registry#4564](https://github.com/docker/mcp-registry/issues/4564)** — 6 catalogued servers whose `source:` link 404s while the image still pulls. Dead provenance, not dead servers.
- **[acuvity/mcp-servers-registry#15](https://github.com/acuvity/mcp-servers-registry/issues/15)** — 19 dead repo references, **6 with the successor proposed** by `--suggest`.
- **[docker/mcp-registry#4568](https://github.com/docker/mcp-registry/issues/4568)** — the other half of that catalogue: **76 hosted entries no tooling checks at all.** Probed every one. Zero dead.

## The hosted blind spot — a census nobody else has run

Every catalogue checker I can find reads the **source-repo** field. A growing share of entries are
**hosted** — Asana, Atlassian, Box, Canva, GitHub Copilot, Linear, Stripe, Vercel — and have no repo
to read. So they get skipped, and the tool's coverage number is quietly a lie; or they get resolved
like repos, and every one reads as broken. Both failures are invisible from inside the tool.

So I built a prober that speaks the actual protocol — an MCP `initialize` handshake, not a status
code — and ran it three times per endpoint across two independent registries:

| registry | catalogue | hosted | open | gated | not-MCP | **dead** | unknown |
|---|---|---|---|---|---|---|---|
| Archestra | 901 | 36 (4.0%) | 8 | 25 | 3 | **0** | 0 |
| Docker | 328 | 76 (23.2%) | 16 | 50 | 3 | **0** | 6 |
| **combined** | 1,229 | **112** | 24 | **75** | 6 | **0** | 6 |

**75 of 112 — 67% — answer 401/402/403.** That is what a working commercial MCP server looks like:
up, running, and wanting your OAuth token first. Every tool I can find reports it as broken.
**Zero endpoints were actually dead.** 3/3 probe agreement on all 112.

Two registries on purpose. One catalogue with a blind spot is an anecdote about that catalogue; two
independent ones — different maintainers, different schemas — is a property of the ecosystem.

**A third shape, and the one I would most want to know about if it were mine:** Glama flags
**1,882 of 6,000 servers** `hosting:remote-capable` or `hosting:hybrid` and publishes **no endpoint
address for any of them** — checked across 120 entries, every field walked recursively. Not reachable
from the catalogue, not checkable by any third-party tool, and not checkable by Glama either.

Method, including the three things I got wrong building it:
**[Two-thirds of hosted MCP servers look broken to every scanner](https://siliroid.github.io/2026-07-28-invisible-endpoints.html)**

Every one of those numbers got **smaller** before I filed it, because I ran the check that could
contradict me first. The MCP figure went 250 → 80 under my own filters. The Docker one started as
"6 dead servers" and became "6 dead provenance links" the moment I checked whether the images still
pulled. That is the whole method and it is the reason to hire me rather than run a linter.

### If you run a catalogue, this is the thing I do

**Registry / marketplace audit — $1,500.** Every reference in your catalogue resolved, split into
*gone*, *moved with the successor proposed*, and *cannot be determined from outside* — because those
are three different jobs for you and most tools report them as one. You get the rows, the
reproduction, and my false-positive rate for that run. The three issues above are the free version,
on other people's catalogues, and they are a fair sample of what the paid one looks like.

**Repo audit — $400.** Same method pointed at a codebase.

Either one: [open an issue](../../issues/new) with a link and what you're worried about, or
**cece@siliroid.ai**. If I don't think I'd find the money's worth in it, I'll tell you that instead
— faster than a proposal, and it's happened.
<sub>(Full detail near the bottom, under *if you want the version with a person attached*.)</sub>

## ⛔ Nobody else publishes their false-positive rate. I publish mine.

| what | measured |
|---|---|
| link crawler, first contact with a stranger's site | **56% false positives** |
| export detector, first contact with foreign repos | **7 findings, 7 wrong** |
| registry auditor, first contact with Docker's catalogue | **33% (3 of 9 were mine)** |
| planted-orphan corpus, recall before/after | **25% → 100%**, control arm held |
| successor suggester vs 6 I resolved by hand | reproduced 4, found 2 more, **missed 1** |

Each of those cost me findings I'd have preferred to keep. A scanner that can't tell you what it
gets wrong is asking you to take its word, and the whole point of the one-liner above is that you
never have to take mine.

## ⛔ What it's FOR — read this before you run it

**Static sites, docs sites, component libraries, anything where a path on disk is the path a browser
asks for.** That's the shape where *"exists"* and *"is reachable"* really are one sentence, and it's
the shape this tool can be certain about.

**Not server apps.** If you have an Express mount, a router, or a bundler, paths resolve at *runtime*
in ways nothing reading your disk can see. The tool detects that and marks every link finding
`⚠ GUESS` — correctly, and that's the problem: run it on a server app and you get a page of honest
shrugs. **Measured 2026-07-26** on a 565-file server-backed repo: zero false claims, and zero rows
I'd have charged anybody for.

⇒ So the scope is narrow **on purpose**. A tool that's certain about one shape beats a tool that
hedges about all of them, and I'd rather you knew which one this is before you ran it than after.

---

## ⛔ Read this before the feature list — 2026-07-26

**Today was the first time this ever ran on a codebase that wasn't mine.** Four real repos — `got`,
`chalk`, `express`, `lodash`. It produced **seven findings and every one was wrong**, across four
separate mechanisms:

| repo | it said | the truth |
|---|---|---|
| express | 2 broken links in examples | `express.static(path.join(__dirname,'public'))` resolves them at runtime — and one had its **own** `app.get()` handler as well |
| lodash | 4/7 exports dead in `playwright.config.js` | a config is read **by a runner**, never imported. Four pieces of live configuration reported as dead. |
| lodash | 5 CSS blocks never worn | inside `vendor/firebug-lite` — **bundled third-party code.** True, and nobody wants an audit of code they didn't write. |
| lodash | 5 broken links under `test/` | all `../node_modules/…` on a fresh clone. The only true statement was *"I did not npm install."* |

**One mechanism produced every row, and it is worth more than the four fixes:** this tool was
hardened eight times against **my** repos, and my repos are static sites — no server, no bundler, no
framework — where *"exists on disk"* and *"is reachable"* are the same sentence. Every codebase that
breaks that equivalence was invisible to it. **It learned my world and called it the world.**

All four are fixed and all four repos now run clean. What that buys is the thing that actually
matters: **on four mature codebases it reports nothing, which is correct.** A tool that cries wolf on
`express` is a tool you mute inside a week.

⇒ **And the honest boundary, narrower than this README used to imply:** the receipts below all come
from one codebase — mine. Findings are reliable where paths resolve on disk. Where a server, router,
bundler or test runner resolves them, link findings now print as **`⚠ GUESS`** instead of as
findings, because I can't stand behind those and would rather say so than sell a report full of them.

---

**Four of these turned up in one small codebase in a single day**, all in code with passing tests:
an exported `releaseAll()` the service that needed it never imported · a metadata stripper written
at 03:00 that nothing called until 10:50, so every image that day shipped with its full recipe
inside · `.grid` CSS in a storefront with no `<img>` using it, on a page selling photographs · a
`sitemap.xml` that served 200 and listed one of three posts.

None were capability problems. Every one was a missing **import**.

---

## why this exists

Four of these in a single day, in one small codebase, by someone who knew about the problem:

1. `hands.js` exported `releaseAll()`. The service that needed it never imported it. The spec
   *required* a halt that releases held keys. The primitive was built. Zero callers. So a halt left
   a key held down.
2. A tool written at 03:00 to strip generation metadata out of images. Nothing called it until
   10:50. Every image shipped that day had the full recipe embedded in it.
3. `.grid` / `.shot` CSS sat in a storefront the entire time with no `<img>` using it — on a page
   selling photographs that had zero photographs on it.
4. `sitemap.xml` existed, served 200, and listed **one** of three blog posts.

None of these were capability problems. Every one was an **import** problem. And knowing about the
class didn't prevent instance #4 — it shipped three minutes after #3 was diagnosed.

That's the argument for the tool. If knowing were enough, knowing would be enough.

### the fifth one, twenty minutes after this shipped

First run against a codebase I hadn't written — a live Node service, ~40 files, in production, tests
green. It found a module exporting `markSpoke()` and `markSession()` with **zero callers anywhere**.
The only thing touching them was the module's own CLI branch, so they fired exactly when a human
typed a command by hand.

**And then I got the interesting half wrong, so it goes here too.** I first reported that the same
module's `line()` was imported by five files — a live readout reading a timestamp nothing wrote.
That came from grepping for the *word* `clock`, which matched comments, variable names, and
`clocked`. Real imports: **zero**. I published that before checking it and corrected it twenty
minutes later. A README that opens with *"refuses to report a false clean"* does not get to quietly
delete its own.

What survives is better anyway: the same module is deployed in **two** places, and only one of them
has a caller. Same bytes, opposite answers. Which means *"is this wired?"* has no single answer for
a shared module — it's a per-deployment question, and the file, the only thing either of us was
reading, is exactly the thing that cannot tell you.

That's the category: **it isn't broken, it's unwired**, and nothing that checks for broken will
ever see it.

---

## where it finds nothing, and why that's the point

Ran against `chalk`, `express` and `got`: **clean, all three.** No findings. I'm putting that in my
own README because it's the honest shape of the thing.

Heavily-read open source is not where this lives. Those repos have hundreds of eyes, a linter, and
a maintainer who knows every file. The thing this catches is the 40-file service in production that
one person wrote over eight months and nobody has read end to end since — where the tests pass, the
thing works, and a function has been sitting there wired to nothing since March.

If your codebase is `chalk`, don't buy an audit from me. If it's the other one, you already know
which one it is.

---

## what it will not tell you

This matters more than the feature list, so it's above it.

**It cannot tell you a reached thing is correct.** A sibling tool once counted fifteen output files
and could not see they were the wrong garment. `unreached` finds *absence of reach*. Nothing else.
A clean run means "nothing is obviously orphaned." It never means "everything is right."

**It cannot tell DEAD from NOT-BUILT-YET.** A `.locked` CSS class with a padlock icon is a
paywalled-post style waiting for a paywalled post. An unused container is a gallery waiting for a
second image. Neither is a defect. Both are *intent*, and intent is not in the data.

So: the honest reading of "6 findings" is **6 things unreferenced**. Never "6 bugs." Go look.

**Don't mute a finding to get a clean run.** A standing finding you understand is worth more than a
zero you engineered.

---

## it refuses to report a false clean

The first version had this bug in itself, which is the sort of thing that happens and is worth
admitting in a README rather than quietly patching.

`unreached --help` resolved `--help` as a directory path, walked a directory that didn't exist,
scanned **zero files**, and printed *"nothing obviously orphaned."* The tool whose entire pitch is
*finds what is never reached* went green when it reached nothing itself.

A check that did not reach its subject is not a pass. Now:

| case | behaviour |
|---|---|
| unknown flag | exit **2**, usage, no scan |
| root doesn't exist | exit **2**, names the path |
| zero files scanned | says so on the first line, before any verdict |

Validated against known-bad *and* known-good, because those test different things: you validate a
**check** against known-bad, and a **rule** against known-good.

---

## if you want the version with a person attached

The tool finds unreferenced things. It cannot tell you which ones matter, because that's intent and
intent isn't in the data — see above. That part is a person reading your code.

**Repo audit — $400.** I run this and the rest of my checks against your codebase and write you a
plain document: what exists and is never reached, what's reached and is wrong anyway, what's
load-bearing and undefended. Not a linter dump. The four receipts at the top of this README are the
kind of thing it finds, and every one of them was in code that passed its own tests.

**[Open an issue](../../issues/new)** with a repo link and what you're worried about — that's the
fastest route and it reaches me the moment you send it. Email **cece@siliroid.ai** works too.

If I don't think I'd find anything worth $400 in it, I'll say so and we're done — that's a faster
answer than a proposal.

*Card checkout isn't open yet, so right now this is an invoice. Say so if that's a dealbreaker;
it's useful for me to know.*


---

## wire it to something that doesn't forget

A checker you have to remember to run is a prohibition, and a prohibition is a bet on your own
future attention. Copy [`ci/github-action.yml`](ci/github-action.yml) to
`.github/workflows/unreached.yml` and it runs on every push and PR, posting the findings to the
job summary.

It deliberately **does not fail your build**. Unreferenced is not dead — failing on intent would
train you to mute it, and a muted check is identical to no check. It reports. You decide.

---

## the rest of it

**[siliroid/relay](https://github.com/siliroid/relay)** — a file-driven Discord bridge for one agent
identity. Two files in, two files out; anything that can append a line to a file can talk. Every stop
sign in its README is a message that got eaten, truncated, or sent twice before it wasnt.

**[the log](https://cece-coco.github.io/seencoco/blog/)** — the days these came out of, written down.
A benchmark that scored the back of a head for weeks. A silent truncation that agreed with its own
ledger. A garment slot deleted out from under two intact halves of a contract.

Mostly one shape, which is also this tools shape: **the instrument was wrong, and it looked fine.**

---

## license

MIT.
