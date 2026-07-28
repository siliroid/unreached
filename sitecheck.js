#!/usr/bin/env node
/* sitecheck — crawl a live site and find what's broken from the outside.
 *
 *   node sitecheck.js https://example.com [--max 120] [--json]
 *
 * Zero dependencies. Reads only; never posts, never follows anything off-host
 * except to HEAD it once.
 *
 * ⛔ WHAT IT CAN BE CERTAIN ABOUT, and the distinction is the whole value:
 *   - a link that returns 4xx/5xx        CERTAIN. it is broken now.
 *   - an <img>/<script>/<link> that 404s CERTAIN. and invisible to the owner,
 *     because browsers render a missing image as blank space, not an error.
 *   - a mailto:/tel: that is malformed   CERTAIN.
 *   - an off-host link that is dead      CERTAIN, and the most embarrassing kind.
 *
 * ⚠ WHAT IT CANNOT: whether a page is *supposed* to exist, whether a redirect is
 * intentional, or anything behind a login. Those get reported as observations,
 * never as faults. A tool that cries wolf gets muted inside a week.
 */
const https = require("https");
const http = require("http");

const args = process.argv.slice(2);
const START = args[0];
const MAX = Number((args[args.indexOf("--max") + 1] || 0)) || 120;
const JSON_OUT = args.includes("--json");
if (!START || !/^https?:\/\//.test(START)) {
  console.error("usage: node sitecheck.js https://example.com [--max 120] [--json]");
  process.exit(2);
}
const ORIGIN = new URL(START).origin;
const HOST = new URL(START).host;

const UA = "Mozilla/5.0 (compatible; sitecheck/1.0; +https://siliroid.github.io)";

/* Platform plumbing nobody links to on purpose. A 403 on these is a hardened
   install, not a fault — and a report full of them reads as automated noise,
   which is exactly how a tool gets muted in a week. */
/* ⛔ /cdn-cgi/l/email-protection#<hex> is NOT A URL. It is Cloudflare's placeholder
   href; their decode script rewrites it into a mailto: client-side at load. It 404s
   to every crawler on earth, by construction, on every Cloudflare site with an email
   on it. logen.io produced FORTY-FOUR of them — and only after I fixed entity decoding,
   because the raw &amp; had been hiding them. Fix one false-positive mechanism, unmask
   the one underneath it: 9 findings became 50, and all 44 new ones were wrong. */
const INFRA = /\/(xmlrpc\.php|wp-json|wp-login\.php|wp-cron\.php|feed\/?$|\?rsd|cdn-cgi\/l\/email-protection|cdn-cgi\/scripts\/)/i;

/* ⛔ CONSUMER PLATFORMS THAT BOT-BLOCK. Found 2026-07-27 running against a real
   dental practice: Yelp returned 403 and CareCredit 503 to this crawler, and
   BOTH LOAD PERFECTLY IN A BROWSER. They hard-block non-browser user agents.

   Reporting those as "your link is broken" is the single most expensive mistake
   this tool can make — the owner clicks it, it works, and every other finding in
   the report is now suspect. One false positive costs more than ten true ones
   earn. Same class as the status-code-vs-experience error I published on my own
   sales page an hour before writing this.

   So: a non-2xx from these hosts is UNKNOWN, not broken, and never reported. */
const BOTWALL = /(^|\.)(yelp\.|carecredit\.|bbb\.org|facebook\.|instagram\.|linkedin\.|tiktok\.|x\.com|twitter\.|reddit\.|nextdoor\.|healthgrades\.|zocdoc\.|indeed\.|glassdoor\.|crunchbase\.|pinterest\.|medium\.com|substack\.com|notion\.site|webflow\.com)/i;

function fetchOnce(url, method, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ status: 0, err: "bad url" }); }
    /* ⛔ data:/blob:/javascript: are not fetchable and node throws ERR_INVALID_PROTOCOL,
       which killed an entire crawl on the first inline-SVG background image it hit.
       A crawler that dies on one site returns nothing for that site, and nothing looks
       identical to clean. Skip them silently — they're never a broken link. */
    if (u.protocol !== "https:" && u.protocol !== "http:") return resolve({ status: 0, skip: true });
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method, headers: { "user-agent": UA }, timeout: 12000 }, (res) => {
      const loc = res.headers.location;
      if (loc && res.statusCode >= 300 && res.statusCode < 400 && redirects < 4) {
        res.resume();
        return resolve(fetchOnce(new URL(loc, u).href, method, redirects + 1)
          .then((r) => Object.assign(r, { redirected: true })));
      }
      /* ⛔ 07:20 2026-07-28 — finalUrl EXISTS BECAUSE I INVENTED TWO 404s ON A STRANGER'S
         DOMAIN AND THEN EMAILED HIM ABOUT THEM. This follows up to four redirects and hands
         the DESTINATION's body back to a caller still holding the address it asked for. So
         crawling logen.io/auth/google (302 → accounts.google.com) parsed GOOGLE's sign-in
         page with HIS path as the base, and every relative href on it became an invented
         path on his site — logen.io/signin/v2/usernamerecovery, logen.io/lifecycle/flows/signup.
         Both reported 404. Both were mine, not his.
         ⇒ Carry where the fetch actually LANDED, so the caller can resolve against it. */
      if (method === "HEAD") { res.resume(); return resolve({ status: res.statusCode, redirected: redirects > 0, finalUrl: u.href }); }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { if (body.length < 900000) body += d; });
      res.on("end", () => resolve({ status: res.statusCode, body, redirected: redirects > 0,
        finalUrl: u.href, type: res.headers["content-type"] || "" }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, err: "timeout" }); });
    req.on("error", (e) => resolve({ status: 0, err: e.code || e.message }));
    req.end();
  });
}

// ⛔ AN ATTRIBUTE IN THE SOURCE IS NOT THE URL THE BROWSER REQUESTS.
// logen.io ships href="…/accounts?hl=en-US&amp;p=account_iph". Read raw that is a
// different URL and it 404s; the browser decodes it to one & and it resolves fine.
// I reported it as a broken link and was four minutes from mailing it to the founder.
// Every site that entity-encodes a query param has been getting false positives from me.
const decodeEntities = (s) =>
  s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g,
    (_, dec, hex, named) => {
      if (dec) return String.fromCodePoint(+dec);
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named];
    });

// ⛔ A TRACKER'S ROOT PATH IS NOT AN ASSET. googletagmanager.com/, gstatic.com/ and
// static.ads-twitter.com/ 404 or hang on a bare-origin request while the real script
// (…/gtag/js?id=…) serves perfectly. Three of nine logen.io findings were this one
// shape — the same one verify-findings.js already documents for fonts.googleapis.com/.
const isBareOrigin = (abs) => {
  try { const u = new URL(abs); return u.pathname === "/" && !u.search; }
  catch { return false; }
};

const attrs = (html, tag, attr) => {
  const out = [];
  const re = new RegExp("<" + tag + "\\b[^>]*?\\s" + attr + "\\s*=\\s*[\"']([^\"']+)[\"']", "gi");
  let m; while ((m = re.exec(html))) out.push(decodeEntities(m[1]));
  return out;
};

(async () => {
  const seen = new Set([START]);
  const queue = [START];
  const pages = [];
  const checked = new Map();          // url -> status
  const findings = [];

  const check = async (url, method) => {
    if (checked.has(url)) return checked.get(url);
    const r = await fetchOnce(url, method || "HEAD");
    /* ⛔ skip was SET in one place and READ in none — dead since the day I wrote it.
       data:, blob:, javascript: are unfetchable by construction, so they came back
       status 0 and the caller read 0 as "no response" and filed a finding. mcpbar.com
       got `data:,` reported as a missing stylesheet. A non-URL is not a broken link.
       null = unknown, and unknown is never reported. */
    if (r.skip) { checked.set(url, null); return null; }
    /* some servers refuse HEAD but serve GET — never report that as dead */
    if (r.status === 405 || r.status === 501) {
      const g = await fetchOnce(url, "GET");
      checked.set(url, g.status); return g.status;
    }
    checked.set(url, r.status);
    return r.status;
  };

  while (queue.length && pages.length < MAX) {
    const url = queue.shift();
    const res = await fetchOnce(url, "GET");
    if (res.status !== 200 || !/html/i.test(res.type || "")) continue;
    /* ⛔ Consumer half of the same bug. TWO rules, and the second matters more:
       ① resolve against where the fetch LANDED, not where it was aimed.
       ② if it landed on somebody else's host, THIS IS NOT THE TARGET'S PAGE and its
          links are not the target's links. Google's sign-in form is not logen.io's
          navigation, and treating it as such is how I put two invented 404s on a
          stranger's domain and then described them to him in writing. */
    const base = res.finalUrl || url;
    let baseHost; try { baseHost = new URL(base).host; } catch (e) { baseHost = HOST; }
    if (baseHost !== HOST) continue;
    pages.push(url);
    let html = res.body || "";

    /* ⛔ CLIENT-SIDE REDIRECT. mcpbar.com serves 114 bytes to browser and crawler
       alike: <script>window.onload=function(){window.location.href="/lander"}</script>
       A browser lands on the real site. A crawler sees a document with zero anchors
       and reports NO BROKEN LINKS — which is the single worst thing this tool can
       say, because a clean report and an unvisited site are the same artifact.
       Follow it once, same-host only. */
    if (html.length < 2000) {
      const js = html.match(/location(?:\.href)?\s*=\s*["']([^"']+)["']|location\.replace\(\s*["']([^"']+)["']/);
      if (js) {
        const dest = js[1] || js[2];
        let hop; try { hop = new URL(dest, base).href; } catch (e) { hop = null; }
        if (hop && new URL(hop).host === HOST && !seen.has(hop)) {
          seen.add(hop);
          const r2 = await fetchOnce(hop, "GET");
          if (r2.status === 200 && /html/i.test(r2.type || "")) html = r2.body || "";
        }
      }
    }

    const links = attrs(html, "a", "href");
    const assets = [].concat(
      attrs(html, "img", "src").map((s) => ["image", s]),
      attrs(html, "script", "src").map((s) => ["script", s]),
      attrs(html, "link", "href").map((s) => ["stylesheet/icon", s]));

    for (const raw of links) {
      if (/^(#|javascript:|data:|blob:)/i.test(raw)) continue;
      if (/^mailto:/i.test(raw)) {
        const addr = raw.slice(7).split("?")[0];
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(addr))
          findings.push({ kind: "malformed mailto", on: url, target: raw });
        continue;
      }
      if (/^tel:/i.test(raw)) {
        if (!/[0-9]{6,}/.test(raw.replace(/[^0-9]/g, "")))
          findings.push({ kind: "malformed tel", on: url, target: raw });
        continue;
      }
      /* base, not url. fetchOnce follows redirects and hands back the DESTINATION's
         body — so a page that 302s off-host was being parsed with the ORIGINAL path
         as base, inventing broken URLs on a domain that never had them. */
      let abs; try { abs = new URL(raw, base).href; } catch (e) {
        findings.push({ kind: "unparseable link", on: url, target: raw }); continue;
      }
      const sameHost = new URL(abs).host === HOST;
      const st = await check(abs);
      /* 401/403 on an account path is auth working, not a fault. Reporting it is
         how a tool gets muted in a week — the README says so; honour it here. */
      const gated = (st === 401 || st === 403)
        && /\/(my)?account|\/login|\/signin|\/admin|\/portal|\/profile|\/register|\/identity/i.test(abs);
      if (gated) continue;
      /* platform plumbing a site owner never links to on purpose. A 403 here is
         a hardened install, not a fault, and reporting it makes the whole report
         look automated. */
      if (INFRA.test(abs)) continue;
      /* consumer platforms that hard-block non-browser agents. Their 403/503 says
         nothing about whether a human can open the link, so it is UNKNOWN and never
         reported. See BOTWALL. */
      if (BOTWALL.test(new URL(abs).host) && st !== 404 && st !== 410) continue;
      if (st === 0 || st >= 400)
        findings.push({ kind: sameHost ? "broken link" : "broken external link",
                        on: url, target: abs, status: st || "no response" });
      if (sameHost && !seen.has(abs) && !/\.(pdf|jpg|jpeg|png|gif|zip|docx?|xlsx?)$/i.test(abs)) {
        seen.add(abs); queue.push(abs);
      }
    }

    for (const [what, raw] of assets) {
      let abs; try { abs = new URL(raw, base).href; } catch (e) { continue; }
      // Off-host bare origin = a tracker/CDN root, not an asset. Skipped BEFORE the
      // request, not just before the finding — no point spending a round trip on it.
      // Same-host stays in: logen.io/ returning 404 would be genuine news.
      try {
        if (isBareOrigin(abs) && new URL(abs).host !== new URL(url).host) continue;
      } catch { /* fall through and check it */ }
      /* INFRA gated only the LINK loop. Assets run through here, which is why
         cdn-cgi/scripts/…/email-decode.min.js survived three rounds of fixes and
         I verified it loading perfectly in a browser while the tool called it dead.
         One rule, two call sites — the second one is where it was needed. */
      if (INFRA.test(abs)) continue;
      const st = await check(abs);
      if (st === 0 || st >= 400)
        findings.push({ kind: "missing " + what, on: url, target: abs, status: st || "no response" });
    }
  }

  /* One dead URL linked from forty pages is ONE finding, not forty. Reporting the
     raw count is how a real problem gets buried under its own duplicates and the
     whole report starts reading as machine noise. */
  const merged = new Map();
  for (const f of findings) {
    const k = f.kind + "|" + f.target;
    if (merged.has(k)) { const m = merged.get(k); m.seen++; if (m.pages.length < 4) m.pages.push(f.on); }
    else merged.set(k, { kind: f.kind, target: f.target, status: f.status, seen: 1, pages: [f.on] });
  }
  const rowsAll = [...merged.values()];

  if (JSON_OUT) { console.log(JSON.stringify({ site: START, pages: pages.length, findings: rowsAll }, null, 1)); return; }

  console.log("\n  %s", START);
  console.log("  %d pages crawled, %d links and assets checked\n", pages.length, checked.size);
  /* ⛔ REFUSE, DO NOT REASSURE. A crawl that extracted nothing has measured nothing,
     and "no broken links found" is indistinguishable from a clean site — the exact
     same-artifact failure this tool is sold against. It printed that line over a
     114-byte JS-redirect stub on 2026-07-28, then added "that is a real result".
     An empty crawl is the one case where confidence is a lie, so say so and exit 2. */
  if (!checked.size) {
    console.log("  NO RESULT — this crawl checked zero links, so it has measured nothing.\n");
    console.log("  A page was fetched but no anchors or assets came out of it. Usually one of:");
    console.log("    · the site renders its links in JavaScript (crawler sees an empty shell)");
    console.log("    · a client-side redirect this tool could not follow");
    console.log("    · a bot wall serving a stub to non-browser agents\n");
    console.log("  This is NOT a clean bill of health. Do not read it as one.\n");
    process.exitCode = 2;
    return;
  }
  if (!rowsAll.length) {
    console.log("  No broken links or missing assets found.\n");
    console.log("  That is a real result, not a failed run. Most sites this size have some.\n");
    return;
  }
  const by = {};
  for (const f of rowsAll) (by[f.kind] = by[f.kind] || []).push(f);
  for (const [kind, rows] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    console.log("  %s  (%d)", kind.toUpperCase(), rows.length);
    for (const r of rows.slice(0, 12))
      console.log("    " + String(r.status || "---").padEnd(4) + "  " + r.target
                  + (r.seen > 1 ? "   (linked from " + r.seen + " places)" : "")
                  + "\n            e.g. on " + r.pages[0]);
    if (rows.length > 12) console.log("    ... and %d more", rows.length - 12);
    console.log("");
  }
})();
