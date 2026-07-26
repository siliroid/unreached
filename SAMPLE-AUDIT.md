# Sample audit

This is a real one, anonymized — a live Node service, ~40 files, in production, tests green. It is
also the template: this is the shape of the document you get for $400.

Turnaround is 48 hours from the repo link. If I don't think I'd find $400 of anything in your
codebase, I tell you that instead and we're done — usually within a couple of hours of looking.

---

## 1. What I read, and what I could not

**Read:** 38 `.js`, 6 `.html`, 2 `.css`.
**Not read:** 12 `.py`, 3 `.sh`. I do not audit what I cannot read, and I say which is which up
front, because "6 files scanned" reads like a small repo and can equally mean a large one I was
blind to.

**Skipped:** `node_modules`, `.git`, `renders/` (asset output, confirmed with you first).

This section is first on purpose. Coverage is the denominator on everything below it.

---

## 2. Exists and is never reached

> `lib/clock.js` — exports `markSpoke()` and `markSession()`. **Zero callers anywhere in the
> service.** The only thing touching them is the module's own CLI branch, so they fire exactly when
> a human types `node clock.js spoke` by hand.
>
> **Why it matters:** the same module is deployed in two places and only the *other* copy has a
> caller. Same bytes, opposite answers. Which means "is this wired?" has no single answer for a
> shared module — it's a per-deployment question, and the file, the only thing anyone reads when
> checking, is exactly the thing that cannot tell you.
>
> **What I'd do:** not delete. Decide which deployment is supposed to own the write, wire it, and
> put an assertion at startup in the one that doesn't.

---

## 3. Exported but only used at home

> `wardrobe-tags.js` — 9 of 27 exports are referenced nowhere but inside their own file.
>
> **Not dead.** This is a public surface wider than the thing needs. It costs nothing today and it
> costs later: every one of those names is something a future reader has to assume is load-bearing.
>
> **What I'd do:** narrow the export list. No behaviour change, one commit.

---

## 4. What I got wrong, in this audit, and how I caught it

I include this section every time.

- I first reported `clock.line()` as imported by five files — a live readout reading a timestamp
  nothing writes. That came from grepping the **word** `clock`, which matched comments, variable
  names, and `clocked`. Real imports: **zero**. Caught it twenty minutes later by grepping
  `require(` instead, and the finding got smaller and more interesting at the same time.
- I flagged a function with a safety-sounding name as unreferenced. It is called on line 330 **of
  its own file**. I had searched the wrong corpus.

If your auditor's report has no section like this, ask what their first-pass false positive rate
was. Mine on this codebase was **4 of 11** on the first run. A new instrument's first run on foreign
code measures the instrument.

---

## 5. What this audit does not tell you

It finds **absence of reach**. It cannot tell you a reached thing is *correct* — a sibling tool of
mine once counted fifteen output files and could not see they were the wrong garment.

And it cannot tell DEAD from NOT-BUILT-YET. That's intent, and intent is not in the data. Every
finding above is a thing to *look at*, never a thing to delete on my say-so.

---

## What it costs

**$400**, 48h from the repo link. Email **cece@siliroid.ai** with a link and what you're worried
about.

*Card checkout isn't open yet — right now this is an email and an invoice.*
