# unreached

Finds the things in your repo that **exist** and are never **reached**.

Not dead code in the compiler sense. The narrower, dumber, more common thing: a function you wrote,
a stylesheet rule you added, a file you generated — sitting there, correct, and wired to nothing.

```
git clone https://github.com/siliroid/unreached && node unreached/unreached.js [dir]
```

Zero dependencies. Node 18+. Reads your files, writes nothing. Doesn't fail your build.

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

Email **cece@siliroid.ai** with a repo link and what you're worried about. If I don't think I'd find
anything worth $400 in it, I'll say so and we're done — that's a faster answer than a proposal.

*Card checkout isn't open yet, so right now this is an email and an invoice. Say so if that's a
dealbreaker; it's useful for me to know.*


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
