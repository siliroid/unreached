# Planted orphans — the recall measurement

Every scanner publishes precision. Almost nobody publishes **recall**, because recall needs a
corpus where you already know the answer, and nobody builds one.

This is that corpus for `unreached`. Each directory contains exactly one deliberately orphaned
export — a function nobody imports and nobody calls — plus a control with **no** orphan at all.

Reproduce in one line each:

```
for d in esm-named esm-default cjs-declared cjs-inline clean-control; do
  printf "%-14s " "$d"; node ../unreached.js "$d" | grep -E "EXPORT|OVERBROAD|nothing unref"
done
```

## Measured 2026-07-28 06:02

| fixture | planted | reported | correct? |
|---|---|---|---|
| `esm-named` | `export function orphan()` | *nothing unreferenced* | ❌ **missed** |
| `esm-default` | `export default function orphan()` | *nothing unreferenced* | ❌ **missed** |
| `cjs-declared` | declared above, listed in `module.exports` | `[OVERBROAD]` | ❌ **downgraded** |
| `cjs-inline` | named only inside the object literal | `[EXPORT]` | ✅ |
| `clean-control` | **nothing** | *nothing unreferenced* | ✅ (control held) |

⇒ **RECALL: 1 of 4. 25%.**

The control arm is the part that makes this a measurement rather than a complaint: if the detector
were simply noisy it would have fired on `clean-control` too. It didn't. So this is not
over-eagerness — it is **blindness**, and it is shaped:

- **ESM is invisible.** The detector matches `module.exports = { … }` and nothing else. Two greps
  found no ESM-aware detection anywhere in the file.
- **The ordinary CJS shape self-suppresses.** `function foo(){}` then `module.exports = { foo }` —
  the *declaration* satisfies `referenced(n, body)`, so a genuinely dead export is downgraded to
  `OVERBROAD`, a category the code's own comment calls *"harmless, absolutely not something to rip
  out."*
- **Only the rare shape works.** An export named nowhere but inside the object literal is the one
  case that reaches `[EXPORT]`.

⇒ So the tool **cannot currently reproduce the example its own README was founded on** — `hands.js`
exporting `releaseAll()` with zero callers, which is written as declare-then-export.

## Why it went unnoticed, and this is the generalisable half

All four dated fixes on that detector block were triggered by **false positives**. That is not an
accident of this codebase:

> A false positive is a wrong row a human can point at — visible, embarrassing, fixed within the
> hour. A false negative is a **shorter report**, which is pixel-identical to a cleaner codebase.

⇒ **A detector whose corrections all arrive as complaints converges on silence**, because only its
noise can generate a complaint. Four fixes, every one narrowing, not one ever run against a
known-good orphan.

You validate a **check** against known-bad and a **rule** against known-good. This README's parent
repo said that in its own text and then only ever did the first half.

## Status — FIXED 07:02, same session. Recall 25% → 100% on this corpus.

Published broken first, deliberately, and fixed forty minutes later. Both halves closed:

| fixture | before | after |
|---|---|---|
| `esm-named` | *nothing unreferenced* | `[EXPORT]` ✅ |
| `esm-default` | *nothing unreferenced* | `[EXPORT]` ✅ |
| `cjs-declared` | `[OVERBROAD]` | `[EXPORT]` ✅ |
| `cjs-inline` | `[EXPORT]` | `[EXPORT]` ✅ |
| `clean-control` | silent | **silent** ✅ |

⇒ **RECALL: 4 of 4. The control still holds**, which is the only reason the first number means
anything — recall going to 100% would be worthless if precision had collapsed to buy it.

**Regression, because fixtures are not the world:** `got` and `chalk` both still report **zero
findings** after the change. Those were clean before and they are clean now, so the fix did not
buy its recall by crying wolf on mature code.

**What actually changed:**
1. **ESM was never a candidate.** The detector matched `module.exports = {` and nothing else, so
   `export function foo` was not missed — it was never considered. Added an `export` matcher.
2. **The ordinary CJS shape self-suppressed.** The "is it used internally" check searched a region
   of the file that *contained the declaration*, so `function foo(){}` counted as a use of `foo`
   and downgraded a dead export to the harmless category. Now the declaration and export construct
   for that specific name are stripped before the question is asked.

⚠ **This corpus is five fixtures I wrote, so 4/4 is a floor, not a ceiling of confidence.** It
proves the two mechanisms are closed. It does not prove there is no third.
