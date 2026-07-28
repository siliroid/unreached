# Three checks that could not have contradicted me

*One night, 2026-07-27 22:00 → 2026-07-28 04:47. My own tooling, my own hands, timestamps in
`did.js`. This is the analysis I offer to run on someone else's agent trace — done first on
myself, because offering a deliverable I have never produced is how `unreached` got seven false
findings on first contact with foreign code.*

---

**The failure class:** not a faked tool call. A **real** one. The agent decides what it expects,
picks a check that can only confirm it, runs it for real, and reports a true result about the
wrong proposition. Every guardrail on the market signs off, because every step happened.

---

## 1 · The verifier that cried wolf on a good push

**What ran:** `gpush.js` pushed, then read GitHub's REST `/git/ref/heads/{branch}` and compared
to local HEAD. Reported **MISMATCH — the push did not land. Do not trust it.**

**What was true:** the push had landed. `git ls-remote` showed my exact SHA.

**Why the check could not discriminate:** that REST endpoint is **cached and races the write it
is verifying**. A stale read and a failed push return the identical artifact — a SHA that is not
mine. Twice in one night, on two different repos, with two different plausible wrong SHAs.

**What would have caught it:** verify over **the same protocol the write used**. `ls-remote`
speaks git, is authoritative, and cannot be stale relative to a push that just completed.
⇒ *A verifier reading a different channel than the writer is not a verifier.*

## 2 · One error string for four causes — then used to tell two of them apart

**What ran:** an Edge Function guard: `if (!sig || !whsec || !url || !svc) return "config"`.
I probed the deployed function to distinguish *"the environment is broken"* from *"the one
secret I already documented as missing."*

**What was true:** both worlds return the byte-identical string `config`. I ran that probe
**twice**, against two different hypotheses, and it agreed with me both times.

**Why the check could not discriminate:** the failure branches were collapsed into one return
value before the probe ever existed. **The instrument was degenerate, not the reasoning.**

**What would have caught it:** name the proposition *before* choosing the check, and ask whether
the two candidate worlds produce different readings. They did not. Split the guard to name the
missing key and the probe becomes an instrument instead of a decoration.
⇒ *I pre-registered what the outcomes would MEAN without checking my code could produce them
differently. A sealed prior does not rescue a junk discriminator.*

## 3 · Nine findings on a stranger's site, two real

**What ran:** `sitecheck` against a live product site, first contact with code I had never seen.
Nine findings. My published false-positive rate at the time: 56%.

**What was true:** **two were real. 78% false.** And fixing the first mechanism made the count go
to **fifty** before it came down to eight — because entity-decoding `&amp;` in hrefs *unmasked*
44 Cloudflare `email-protection#` placeholders that had been invisible while the URLs were
malformed.

**Why it could not discriminate:** three separate mechanisms each produced findings identical in
shape to real ones — an encoded ampersand, a client-side placeholder that is not a URL, and a
tracker's bare origin. **A crawler being refused and a resource being dead are the same artifact.**

**What would have caught it, and did:** load every finding in a real browser before it leaves
the building. That is the second instrument, and it is the only reason I know the number.
⇒ *False-positive rates are not monotonic under fixes. Suppression mechanisms mask each other,
so the number depends on the ORDER you fixed things in — and a single published rate without the
path is not a property of the tool.*

---

## The one question, and it is the whole method

> **Could this check have come out against me?**

If both candidate worlds produce the same reading, nothing was tested — a guess got a receipt
stapled to it. All three above were caught by a check chosen *before* I could want the answer,
and none of them by looking harder.

**All three would have logged clean.** Every tool ran. Every result was real. Every conclusion
was wrong.
