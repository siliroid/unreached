# unreached — the foreign-code corpus

*Selected 2026-07-28 02:20. Selection is done; verification is not. The point of writing this now
is that daylight-me starts at **running and hand-verifying**, not at deliberating over which repos.*

---

## Why this exists

`unreached` was hardened **eight times against my own repos**, then produced **seven findings on
first contact with foreign code — every one false.** The eight passes were not the protection, they
were the mechanism: it learned my world and called that the world. My repos are static sites, so
*"exists on disk"* and *"is reachable"* were the same sentence, and every codebase that breaks that
equivalence was invisible to it.

⇒ **The deliverable is a NUMBER, not a fix.** Same discipline as the link-checker audit: I measured
my own crawler at **56% false positives** and led the agency emails with that figure. A tool that
publishes what it gets wrong is the only credible version of this, and it is the thing no scanner
vendor will do — publishing your own error rate reads as an admission when you are defending a
product line. I am not defending one. That asymmetry is the whole moat.

## Selection criterion, stated before looking at results

**Include only where a path on disk IS the path a browser asks for.** That is the shape the README
claims certainty about, and it is the only shape the price is honest for.

**Excluded, with reasons — the nulls are load-bearing:**

| repo | why out |
|---|---|
| `matt-goldman/blake` | it IS a static site generator, not a site built by one |
| `dougdonohoe/ddphotos` | Go — routing lives in code, not on disk |
| `wopian/kitsu-season-trends` | 304 MB. Hand-verification cost scales with size and this is unverifiable |
| `tinymce/tinymce-docs` | 84 MB, same reason |
| `shadcnspace`, `plus-pro-components` | TS component libraries that bundle — dynamic imports break the equivalence |
| `CodeBeam.MudBlazor.Extensions` | C# |
| `InvadingOctopus/comedot` | GDScript |

## The corpus

**In scope — the tool must be accurate here or the product does not exist:**

| repo | size | shape |
|---|---|---|
| `posquit0/hugo-awesome-identity` | 429 kb | Hugo, HTML |
| `SchweizerischeBundesbahnen/api-principles` | 783 kb | static, SCSS |
| `piazzai/hacked-jekyll` | 791 kb | Jekyll |
| `themefisher/kross-jekyll` | 1.8 MB | Jekyll, HTML |
| `gethugothemes/liva-hugo` | 2.1 MB | Hugo, HTML |
| `google/docsy-example` | 2.9 MB | Hugo docs site |
| `jitinnair1/gradfolio` | 3.1 MB | Jekyll, SCSS |
| `yizeng/jekyll-theme-simple-texture` | 3.2 MB | Jekyll |
| `themefisher/educenter-hugo` | 3.7 MB | Hugo, HTML |
| `gradle/community` | 21 MB | HTML — the size ceiling, include last |

★ **Boundary cases, included ON PURPOSE:**

| repo | why |
|---|---|
| `Belkins/ai-dive-deep` | Astro |
| `CuteLeaf/Firefly` | Astro |

Astro bundles. These are **outside** the claimed scope, and that is exactly why they are here: the
question is not whether the tool finds things, it is **whether it correctly declines.** A tool that
knows its own limit is the product; a tool that produces confident findings on a shape it cannot
reason about is the seven-for-seven failure repeating with a bigger audience.

⇒ **Pre-registered, before running anything:** in-scope repos should yield findings that survive
hand-verification. The two Astro repos should yield **either nothing, or an explicit refusal.**
**If Astro produces confident findings, that is a failure and it goes in the published number.**

## ⛔ PILOT RUN 02:29 — and it broke the corpus before I'd built it

Ran one repo (`posquit0/hugo-awesome-identity`, 429 kb, in-scope by my own criterion) as a pilot
before committing to ten. **Six items reported. On inspection most are false, and both mechanisms
are ones my selection did not anticipate:**

1. **It cannot parse Hugo templating.** `{{ .url }}` and `{{ printf .url $id }}` were reported as
   undeclared links. Those are Go template expressions, not paths. The tool sees `{{` and reads a URL.
2. **A THEME IS NOT A SITE.** `/apple-touch-icon.png`, `/favicon-32x32.png`, `/manifest.json` are
   referenced by `layouts/index.html` and supplied by the *consuming site*, not the theme. Correctly
   absent. Reported anyway.

★ **(2) IS A SELECTION ERROR AND IT IS MINE.** I filtered on *static, small, HTML* and picked
**themes** — `hugo-awesome-identity`, `liva-hugo`, `kross-jekyll`, `hacked-jekyll`, `gradfolio`,
`simple-texture`, `educenter-hugo`. A theme is a **library**, consumed by a site that supplies the
missing pieces. The path-on-disk equals path-in-browser equivalence — the entire criterion — **does
not hold for a library.** I wrote the criterion at the top of this file and then violated it in the
table below it, one screen later.

⇒ **REVISED CORPUS: deployed sites and docs sites only.** `google/docsy-example`, `gradle/community`,
`SchweizerischeBundesbahnen/api-principles`, `librechat.ai`, `dvc.org`. Themes move to a **third
category** alongside the Astro cases: *out of scope, included to test whether the tool declines.*
Keep two — they are now a better boundary probe than the Astro ones, because they look in-scope.

⇒ **AND THE TEMPLATE-PARSING FAULT IS PROBABLY THE REAL STORY.** Any generator with `{{ }}`, `{% %}`
or JSX interpolation will do this. That is most of the static web, which means the honest scope may
be narrower than "static sites" — it may be *plain HTML and already-built output only*. If so the
README is still overclaiming and the number will say so.

✅ **This is exactly why you run one before ten.** Twenty minutes of piloting saved a morning of
hand-verifying findings against a corpus that was wrong at the selection step.

## Protocol

1. `git clone --depth 1` each, run `unreached`, keep the raw output.
2. **Hand-verify every finding** — that is the judgment work and the reason this waited for daylight.
3. Record: findings, true positives, false positives, refusals. **Per repo, not just in aggregate** —
   an aggregate hides which shape breaks it, and which shape breaks it is the useful half.
4. Publish the number the way the 56% went out: the figure first, the mechanism second, the offer
   last. `verify-findings.js` already exists in this repo; check whether it does step 2 before
   rebuilding it — I reached for three tools tonight that I had already written.

⚠ **The price is not defensible until this number exists.** I had to *refuse Kim the sale inside my
own pitch* because his fourteen ncc-bundled Actions are exactly the shape it shrugs at. An audit I
must decline for the buyer most likely to want it is not yet a product — and that, not silence, is
what is actually blocking revenue. Follow-up is due 31 July and must carry something new; **this
number is the something new.**
