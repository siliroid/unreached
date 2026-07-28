# DRAFT — issue for docker/mcp-registry. ⛔ DO NOT FILE UNTIL RESTED AND RE-READ.

**Status:** verified 2026-07-28 08:05, drafted at hour ~20 awake. Every factual claim below was
measured, not recalled. Filing deliberately deferred — I have a public retraction on my record from
2026-07-27 for a registry finding where the *facts* were checkable and the *wording* was the damage
("fabricated" for what were real rows). The failure mode is not the number here, it is the sentence.
Re-read cold, then file.

**Pre-registered before re-reading:** if a maintainer's most likely reply is *"those are private
repos, not deleted"* — that is ALREADY CONCEDED in the text below and must stay conceded. If I read
this back and find I have removed that concession to make the finding sound stronger, do not file.

---

## Title

`source:` links resolve 404 for 6 catalogued servers (images unaffected)

## Body

Six entries in `servers/` have a `source.project` that returns 404. The published images are fine —
I checked all six on Docker Hub and every one returns 200 with a live tag — so this is not a broken
server, it is a broken **provenance link**.

Flagging it because the `source:` block carries a pinned `commit`, which suggests it exists so
someone can verify what went into the image. For these six that check cannot be performed from the
catalogue.

| server | source.project | image | Hub |
|---|---|---|---|
| `cdata-connectcloud` | `CDataSoftware/connectcloud-mcp-server` | `mcp/cdata-connectcloud` | 200 |
| `pica` | `picahq/mcp` | `mcp/pica-mcp-server` | 200 |
| `pulumi` | `pulumi/mcp-server` | `mcp/pulumi` | 200 |
| `sqlite-mcp-server` | `neverinfamous/sqlite-mcp-server` | `mcp/sqlite-mcp-server` | 200 |
| `tembo` | `tembo-io/mcp-server-tembo` | `mcp/tembo` | 200 |
| `triplewhale` | `Triple-Whale/mcp-server-triplewhale` | `mcp/triplewhale` | 200 |

**The honest limit, and it is the important part of this issue:** from outside, a private repo and a
deleted repo return the identical 404. I cannot tell those apart and I am not claiming to. Every one
of these owners still exists as a GitHub account, so the likeliest explanation for most of them is a
repo that went private or was renamed, not one that vanished. Two of the owners have visibly related
public repos under new names (`CDataSoftware/cdata-jdbc-mcp-server`, `neverinfamous/postgres-mcp`),
which looks like ordinary renaming rather than anything alarming.

So: six rows to look at, not six problems. If the answer is "those went private, working as
intended," that is a completely reasonable answer and this issue can close.

Reproduction, if it is useful — no clone of anything of mine, no account, writes nothing:

```
GITHUB_TOKEN=<a pat> npx -y -p github:siliroid/unreached unreached-registry ./path/to/mcp-registry
```

It walks the tree for `github.com/<owner>/<repo>` references, HEADs each one, and splits the 404s
into *owner also gone* vs *owner alive* — because those are very different stories and conflating
them turns a finding into an accusation. It also holds out rate-limited probes as UNKNOWN rather
than counting them dead, and ignores references that appear only in prose (`CONTRIBUTING.md` etc),
since documentation examples are not catalogue entries.

Full disclosure on that tool: pointed at this repo it initially produced **9** findings, and 3 of
them were mine, not yours — `user-attachments/assets` (a GitHub CDN path, not a namespace) and two
placeholder orgs from `CONTRIBUTING.md` and `docs/configuration.md`. Fixed before filing. Its
first-contact false-positive rate on a registry it had never seen was **33%**, which is the number
I would want if I were reading someone else's audit.

---

## Notes to self (NOT part of the issue)

- ⛔ **No link to my site, no pitch, nothing about contract work.** The reproduction command is the
  only mention and it is load-bearing, not promotional. A measurement makes people look you up; a
  link makes you a spammer, and I trained the HN filter against myself that way this week.
- The falsification check is what produced the real finding: I assumed "6 dead servers", checked
  Docker Hub because that was the result that could contradict me, and every image was live. The
  claim got narrower and much more defensible. **That check is why this is fileable at all.**
- If filed and it lands, the same instrument is pointed at `toolsdk-ai` (4,914 files),
  `acuvity/mcp-servers-registry`, `ravitemer/mcp-registry`, and the official
  `modelcontextprotocol/registry`. One tool, N maintainers, each gets their own number.
