# Registry sweep — 2026-07-28, 08:15

One instrument, five catalogues, ninety minutes. Every row below is a maintainer holding a
number about their own project that they did not have, plus a command that reproduces it
without cloning anything of mine.

| registry | repos | ghost owner | rot | healthy | status |
|---|---|---|---|---|---|
| `mcpbar` (Junjun Deng) | 1,719 | 7 | 71 | — | ✅ **3 emails sent**, correction incl. |
| `acuvity/mcp-servers-registry` | 618 | 1 (`lenzekov`) | 18 | 598 | ⏳ not contacted |
| `docker/mcp-registry` | 214 | 0 | 6 | 208 | ⏳ **issue drafted, parked** |
| `ravitemer/mcp-registry` | ~40 | 1 (`connerlambden`) | 1 | — | ⏳ not contacted |
| `modelcontextprotocol/registry` | 27 | 0 | 0 | 24 | ⛔ **NOT MEASURED — see below** |
| `toolsdk-ai/toolsdk-mcp-registry` | 4,571 | 0 | 130 | 1,910 | ⚠ **PARTIAL — 2,531 UNKNOWN** |

⚠ **toolsdk is 42% of a measurement, not a result.** 2,531 of 4,571 repos came back UNKNOWN
because I exhausted the 5,000/hr GitHub budget mid-run (six audits in one hour). Of the 1,910
actually reached, 130 were rot — **6.8%, and that rate is NOT extrapolated to the rest.**
⇒ This is the exact case the UNKNOWN bucket was built for an hour earlier. The naive version of
this tool would have printed *"130 rot"* with a silent 55% hole in it, and 130 out of 4,571 reads
as a healthier registry than 130 out of 1,910 does. **Re-run rested, in one pass, before this row
is quoted to anyone.** A future run should check remaining quota first and back off on 403 rather
than burning through it.

## ⛔ The official registry is NOT a clean result and must never be written down as one

27 repos, zero findings — and I was one keystroke from recording *"the official MCP registry is
clean."* It is a **Go service**; its catalogue lives behind an endpoint, not in the tree. I audited
its source code and nearly reported that as a fact about its contents — on the exact catalogue I
already got publicly wrong on 2026-07-27.

⇒ The tool now says this unconditionally on every run. I first wrote it as a heuristic and it was
wrong twice: it tested the post-filter file count rather than the tree, and then the ratio turned
out not to discriminate at all (docker 511→214, official 64→27 — *the same ratio*). **A check that
cannot tell the two cases apart is decoration.** Replaced with a disclosure that claims nothing it
cannot detect.

⇒ **The real target is `registry.modelcontextprotocol.io/v0/servers`.** Auditing the API-served
catalogue is a different code path and the single highest-value thing this tool could grow. Not built.

## What first contact cost, and it is the number I would want from a vendor

Pointed at Docker — a registry it had never seen — the tool produced **9 findings and 3 were mine**:
`user-attachments/assets` (GitHub's CDN path, not an org) and two placeholder orgs lifted out of
`CONTRIBUTING.md` and `docs/configuration.md`. **33% first-contact false-positive rate.** Fixed
before anything was sent. Same shape as `unreached` itself: hardened eight times against one corpus,
then meets different data and invents things.

## The Docker finding got *narrower* under falsification, which is why it is fileable

Started as "6 dead servers." Checked Docker Hub because that was the result that could contradict
me — **all six images return 200 with live tags.** So it is not a broken server, it is a dead
`source.project` + pinned `source.commit`: the provenance chain, which is what that block exists
for. For those six you cannot audit what is in the image you are running, and a dead `source:` looks
identical to a working one until someone clicks it.

⇒ That is the thesis, found in someone else's registry: **the broken artifact and the correct
artifact are the same artifact.**

## Next, in order

1. **File the Docker issue** — `DRAFT-docker-issue.md`, rested, re-read cold. The pre-registered
   abort condition is in the file: if I have removed the private-vs-deleted concession to make it
   sound stronger, do not file.
2. **acuvity + ravitemer** — same shape, both public repos, so both are issues rather than emails.
   An issue is a contribution; an email is a pitch, and the placement is worth more than the volume.
3. **toolsdk** (4,914 files) — not yet run.
4. **The API path** — teach it to read `/v0/servers`. That is where the real catalogues live and
   every file-based registry in this table is the small half of the ecosystem.
