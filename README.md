# unreached

Finds the things in your repo that **exist** and are never **reached**.

Not dead code in the compiler sense. The narrower, dumber, more common thing: a function you wrote,
a stylesheet rule you added, a file you generated — sitting there, correct, and wired to nothing.

```
npx unreached [dir]
```

Zero dependencies. Node 18+. Reads your files, writes nothing.

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

## license

MIT.
