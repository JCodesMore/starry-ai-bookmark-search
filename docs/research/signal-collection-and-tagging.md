# Signal Collection & Auto-Tagging — Research Report

**Project:** Bookmark Semantic Search (MV3, Chromium 149 base)
**Scope:** How to fetch, extract, and embed one good composite text per bookmark for loose semantic search over ~1,300–5,000 bookmarks, plus zero-cost auto-tagging, at zero recurring cost.
**Date:** 2026-07-10
**Status:** Research complete; recommendations below are actionable but should be validated against a real subset of the user's bookmark corpus before locking the pipeline.

> Note on sourcing: Chrome platform mechanics (CORS, offscreen, SW lifecycle) are stable and well-documented; several authoritative sources predate 2026 but describe current MV3 behavior. Model/library facts (EmbeddingGemma, Readability, normalize-url, retext-keywords) were verified against 2025–2026 pages. All URLs are listed in **Sources** with access date 2026-07-10.

---

## Recommended pipeline (read this first)

A staged, degradation-first pipeline. Every bookmark always gets a usable record even if the fetch fails.

```
For each bookmark (keyed by normalized URL):
  0. BASELINE SIGNALS (always available, zero network):
       url tokens, domain/host, folder path, bookmark title
     -> This alone is a valid, indexable record. Never block on the network.

  1. CANONICALIZE + DEDUP:
       normalize-url (strip utm_*/fbclid/gclid, sort params, default ports,
       trailing slash, http->https, drop #fragment) -> dedup key.

  2. FETCH (service worker or offscreen document, host_permissions):
       fetch(url, { signal: AbortController(12s), redirect: 'follow' })
       Classify by Content-Type + status BEFORE parsing:
         text/html   -> step 3
         application/pdf -> pdf.js text (first N pages) [optional/phase 2]
         other/non-HTML, 4xx/5xx, timeout -> keep baseline record, mark degraded

  3. EXTRACT (offscreen document — DOMParser is NOT available in the SW):
       DOMParser -> Readability (@mozilla/readability) for readable body;
       ALSO pull meta directly: <title>, og:title, og:description,
       meta[name=description], og:site_name, meta[keywords], h1, first h2s,
       JSON-LD name/description.
       If body text is empty/tiny (SPA shell) -> fall back to meta+baseline.

  4. COMPOSE ONE TEXT PER BOOKMARK (not chunks):
       [title | og:title]  (highest weight, possibly repeated)
       + description (meta/og)  + og:site_name
       + h1 + first 1-2 h2s
       + first ~200-400 words of Readability text
       + domain + URL path tokens
     Truncate to the embedding model's context (~2K tokens is plenty).

  5. EMBED (local, WebGPU w/ WASM fallback, off main thread):
       feature-extraction pipeline, mean-pool + L2-normalize.
       Store vector in IndexedDB. Use the model's query/document prompt
       convention (asymmetric) for query vs. passage.

  6. AUTO-TAG (reuse the SAME embedding, zero extra model):
       a) domain/URL heuristics first (github->dev, youtube->video, ...),
       b) embedding cosine-sim vs. a curated tag-taxonomy (label embeddings),
       c) optional keyword extraction (retext-keywords/RAKE) for long-tail tags.

  7. PERSIST + RESUME:
       Queue state + per-URL status in chrome.storage/IndexedDB.
       Drive batches from chrome.alarms (>=30s) and/or an offscreen doc that
       holds the worker alive; design for SW termination at any point.
```

**Concurrency/etiquette defaults:** global in-flight ~6–8, per-host 1–2, ~12s fetch timeout, retry only 408/425/429/5xx/network with exp backoff + jitter (cap 3, honor `Retry-After`), never retry 403/404. Prefer running when `chrome.idle` reports idle.

**Model recommendation:** for a corpus this small and short-query retrieval, a small sentence-embedding model (e.g. `all-MiniLM-L6-v2`, 384-dim, ~23 MB quantized) is the pragmatic default; **EmbeddingGemma-300m** (768-dim, Matryoshka-truncatable to 256/128, QAT <200 MB RAM) is the stronger-quality option if the WebGPU/download budget allows. Both run in Transformers.js.

---

## Q1 — Fetching bookmarked pages from an MV3 extension (fetch/CORS, `<all_urls>`, alternatives)

### Does `fetch()` from the service worker bypass CORS with `host_permissions: ["<all_urls>"]`?
**Yes — in an extension context (service worker, offscreen document, popup, options page), a cross-origin `fetch()` bypasses CORS for any origin declared in `host_permissions`.** This is by design and unchanged for MV3 in 2026. The restriction that Chrome added in 2019–2020 targets **content scripts**, not extension pages: "extension pages, such as background pages, popups, or options pages, are unaffected by this change and will continue to be allowed to bypass CORS for cross-origin requests." The standard MV3 pattern is therefore: make the fetch in the **service worker/offscreen document**, relay results to content scripts via messaging. (Chromium security doc; CorsAPI MV3 write-up.)

Practical notes:
- Requires the target origin in `host_permissions` (or `<all_urls>`). Content scripts still cannot do cross-origin fetches even with host permissions — they must proxy through the worker.
- **Firefox differs**: declaring host permissions does not by itself satisfy CORS in Firefox MV3 (several devs hit `Access-Control-Allow-Origin missing`). If cross-browser is ever a goal, budget for that.
- SW gotchas: register listeners **synchronously** at top level (async-registered listeners miss the wake-up event); if importing ES modules set `"type": "module"` on the background entry.
- The offscreen document also runs at the extension origin and supports the Fetch API, so you can co-locate fetch + DOMParser there (see Q2).

### Chrome Web Store review implications of `<all_urls>`
- `<all_urls>` / `*://*/*` / `https://*/*` are treated as **broad host permissions** and typically trigger an **in-depth manual review**; forum reports put turnaround at ~1–2 weeks. (Chrome Web Store review-process doc; ExtensionBooster.)
- **`tabs` + broad host access is a specific red flag** (URLs/titles/favicons across all tabs + page modification). This project reads bookmarks + fetches many hosts, so expect scrutiny.
- Chrome **requires a per-permission justification**. Write it feature-specific, not boilerplate: name the exact functionality ("indexes the text of pages the user has bookmarked, across arbitrary domains the user chose, to enable local semantic search; page content is processed locally and never transmitted"), state data handling explicitly, and make the **privacy policy match word-for-word**. Mismatch = fast rejection. One appeal per violation.
- The broad-host warning can also be triggered by a broad `content_scripts` match pattern, independent of `host_permissions` — audit both.

### Alternatives (ranked)
1. **`optional_host_permissions` + runtime request** (`chrome.permissions.request({ origins: ["*://*/*"] })`): keeps the broad grant out of the required manifest, so it doesn't trigger the submission-time warning; the user grants it when they start an index build. **Recommended** — it also matches the honest UX ("you're about to fetch N sites you bookmarked").
2. **Specific domains**: not viable here — bookmarks are an open-ended domain set. (Would be ideal if it were.)
3. **`activeTab` only**: works only on explicit user interaction with the current tab; cannot fetch a backlog of 1,500 bookmarks in the background. Use as a *supplementary* path ("index this page now" while the user is on it), not the primary crawler.
4. **No-fetch fallback**: index title + URL tokens + domain + folder path only. This is the mandatory floor for every bookmark regardless (see Q4) and a legitimate privacy-max mode ("don't fetch page contents").

**Recommendation:** Ship with `optional_host_permissions` for broad host access requested at index time, a clear justification + matching privacy policy, and a no-fetch baseline mode. Avoid pairing `tabs` with broad host access unless genuinely required.

---

## Q2 — Extracting text without a DOM in the service worker

**`DOMParser` and the DOM are unavailable in the MV3 service worker.** The two viable strategies are (A) an **offscreen document** (real DOM, `DOMParser`, `fetch`) or (B) a **pure-JS parser** bundled into the worker. Comparison:

| Approach | DOM fidelity | Runs in SW? | Speed/size | Notes |
|---|---|---|---|---|
| **Offscreen doc + `DOMParser` + `@mozilla/readability`** | Full (real browser DOM) | No — separate doc, msg-passed | Native DOM, no parser lib needed | **Chrome's documented pattern.** `reasons: ['DOM_PARSER']`. One offscreen doc at a time. |
| **`cheer-reader`** (Readability port on Cheerio) | Good (no layout/visibility) | Yes | ~6–8× faster, far less memory than jsdom-based | Runs in workers; robust to broken HTML per author. |
| **linkedom** | Closer to DOM than Cheerio | Yes | ~1/3 time & heap of jsdom | Reported **compat quirks feeding Readability**; test before trusting. |
| **node-html-parser** | Minimal | Yes | Smallest footprint | Good for regex-ish meta/selector extraction, not full readability. |
| **jsdom** | Full | No (heavy, Node-oriented) | Slow/heavy | Avoid in-extension. |
| **Regex meta extraction** | None | Yes | Tiny | Great for `<title>`, `og:*`, `meta[description]`, JSON-LD blocks; brittle for body text. |

**Readability status:** the official package is **`@mozilla/readability`, latest v0.6.0** (published ~2024/2025; >1,100 dependents). Beware confusables (`moz-readability` 0.2.1 from 7 yrs ago; `mozilla-readability` is a Rust port). Readability needs a DOM; its bundled `JSDOMParser` is **not recommended for general use** (XML-only-ish). For untrusted HTML, sanitize Readability output with **DOMPurify** before rendering anywhere.

**Offscreen document facts (verified against the current API reference):**
- Valid `reasons` include `DOM_PARSER`, `DOM_SCRAPING`, `IFRAME_SCRIPTING`, `BLOBS`, `WORKERS`, `CLIPBOARD`, `AUDIO_PLAYBACK`, etc.
- Offscreen docs **retain full DOM APIs (incl. `DOMParser`) and the Fetch API**; the only *extension* API they get is `chrome.runtime` (so all coordination is message-passing).
- **No automatic expiry** except `AUDIO_PLAYBACK` (closes after 30 s of silence) — so a `DOM_PARSER` offscreen doc can be kept open for a batch and closed when idle.
- **Only one offscreen document open per installed extension at a time** — build a singleton guard (use `runtime.getContexts()`, Chrome 116+, to detect an existing one).

**What real projects use:** Chrome's own `offscreen-dom` sample is the canonical "parse HTML in a hidden DOM" reference; reader extensions like **Just-Read** do Readability-style extraction. The community-documented MV3 recipe is exactly: SW → `createDocument({reasons:['DOM_PARSER']})` → offscreen runs `new DOMParser().parseFromString(html,'text/html')` then `new Readability(doc).parse()` → `{title, textContent, ...}` back over `chrome.runtime`.

**Recommendation:** **Offscreen document + `DOMParser` + `@mozilla/readability`** as the primary extractor (highest fidelity, no fragile parser lib, official pattern), fetching either in the SW or the offscreen doc. Pull `og:*`/`meta`/JSON-LD directly from the parsed document in the same pass. Keep a regex/`node-html-parser` fast path as a lightweight fallback if you ever want to skip spinning the offscreen doc for meta-only extraction. Consider `cheer-reader` only if the single-offscreen-document constraint becomes a throughput bottleneck.

---

## Q3 — Which signals matter for retrieval quality (and: one composite text vs. chunking)

**Bottom line: for bookmark/page-level retrieval, embedding ONE well-constructed composite text per bookmark is the correct design. Full-content chunking solves a different problem (locating a passage *within* a document) that you don't have.** The evidence supports this rather than refutes it:

- **Global identifiers (title, site/brand, doc-level metadata) drive document selection; section-level cues only help within-document localization.** A 2026 ECIR field-ablation study found "company and year provide the strongest disambiguating signal: removing them reduces both Title@K and Context@K," whereas removing section titles gave "only a modest drop in Context@K with no effect on Title@K." Choosing the right *bookmark* is exactly the "document-level" task where title/global metadata dominate.
- **Titles punch above their weight**: the title is "often the first piece of information a user sees" and "can greatly influence" relevance; when missing, synthesize one. Meta description/summary injection "helps consistently" by "increasing intra-document cohesion, reducing inter-document confusion."
- **Chunking's advantage is passage precision inside long docs**, which comes at the cost of losing global theme; it's warranted for structured docs (SEC filings, papers, legal) where users ask passage-level questions. A bookmark query like "warmup iphone ai" wants the *right page*, not a paragraph offset.
- **Watch "embedding collapse":** if injected metadata dominates chunk text, distinct items start looking identical. For a single composite this means: don't let boilerplate (nav, site name repeated) drown the distinctive title/description — weight and order deliberately.

**Recommended composite (ordered, highest-signal first):**
1. `title` / `og:title` (consider mild repetition or a prefix to up-weight)
2. `meta description` / `og:description`
3. `og:site_name` + `domain`
4. `h1`, then first 1–2 `h2`
5. first ~200–400 words of Readability `textContent`
6. URL path tokens (slug words carry topic signal, e.g. `/warmup-iphone-ai`) + folder path

This ordering means a page that fails deep extraction (SPA/auth) still produces a strong record from items 1–3, 6 alone.

**Caveat worth testing:** a Hacker News practitioner argued embeddings are *too ambiguous* for very short history queries and recommended **hybrid keyword + vector** search. Given short queries like "warmup iphone ai", plan for a **hybrid retriever** (BM25/keyword over the same composite text, fused with vector cosine) rather than vector-only. Existing bookmark tools (SaveSync, Bookmarkjar, Smart Bookmark, AI Bookmark Manager) all expose keyword + semantic + hybrid modes — hybrid is the consensus.

---

## Q4 — Failure taxonomy & graceful degradation

Realistic per-bookmark failure modes for a plain `fetch()` from the browser:

| Failure class | What plain fetch returns | Prevalence / evidence | Mitigation |
|---|---|---|---|
| **SPA / client-rendered** | Empty HTML shell (root `<div>` + JS bundle); little/no body text | "Affects the majority of modern websites built with React/Vue/Angular." AI crawlers (no JS execution) get nothing. | **Meta/OG/JSON-LD are frequently still in the shell** (SSR'd head even when body is CSR) — harvest those. If body text is empty, fall back to title+meta+URL. Optional deep path: render via a real tab/content script only when the user opens the page. |
| **Dead links (link rot)** | 404/410/DNS error, or soft-404 (200 + "not found" body) | ~10% dead after 1 yr, ~25% after 3 yr, ~38–40% after 5 yr (Harvard); a personal 17k-link bookmark study found **25.9% dead over 15 yrs**. Ahrefs: 66.5% of sampled outbound links rotted since 2013. | Keep baseline record; flag `dead` for a cleanup UI. Detect soft-404 heuristically (tiny/boilerplate body, "not found" strings). |
| **Auth-walled / paywalled** | Login page or paywall stub, HTTP 200 | Common for SaaS dashboards, private repos, paywalled news. | Detect login/paywall markers; degrade to title+URL+domain. Don't send credentials. |
| **PDFs** | `application/pdf` bytes (not HTML) | Common in research bookmarks. | Branch on `Content-Type`; use **pdf.js `getTextContent()`** on first N pages. **Scanned PDFs have no text layer** → need OCR (out of scope) → degrade to title+URL. |
| **YouTube / video** | HTML but "content" is the player | Very common. | Use `og:title`/`og:description`/`og:site_name` (rich for YouTube) or oEmbed; treat title+channel+description as the composite. |
| **Non-HTML (images, zips, JSON, feeds)** | Binary / non-article | Occasional. | Branch on `Content-Type`; index filename + URL tokens + domain only. |
| **Bot walls / 403 / Cloudflare** | Challenge page or 403 | Site-dependent. | Do **not** retry 403; degrade gracefully. |

**How much of a typical corpus fails plain fetch?** There's no single authoritative percentage, but combining the pieces: link rot alone removes ~10–25% depending on corpus age; SPAs/auth/video/PDF/bot-walls remove a further meaningful slice of *usable body text*. A defensible planning estimate is that **~20–40% of a mature bookmark corpus will yield poor or empty article body from a plain fetch** — which is precisely why the pipeline must treat **title + URL tokens + domain + meta/OG as the primary signal and full body as a bonus**, not the reverse.

**Graceful degradation strategy (single rule):** every bookmark gets a record from baseline signals *before* any network call; extraction only *enriches* it. Persist an extraction-quality flag (`full` / `meta_only` / `baseline` / `dead`) per bookmark so the UI can surface stale/dead links and so re-crawls can prioritize `meta_only`/`baseline` items.

---

## Q5 — Crawl etiquette & performance (from a user's browser, MV3)

**Concurrency & pacing.** General crawler guidance is 2–5 concurrent per host and 10–20 total workers. But this runs **in the user's browser on their bandwidth**, and bookmarks are spread across *many* hosts, so per-host pressure is naturally low. Recommended:
- **Global in-flight: ~6–8** (tunable up if error rate stays flat and the machine is idle/charging).
- **Per-host: 1–2**, with a small inter-request delay per host.
- Cap the worker pool at the concurrency limit; **don't oversubscribe and rely on 429s** (a rejected request still costs a round-trip).

**Timeouts.** Size to the p90/p99 tail, not the median: **~10–20 s** per request. Use `AbortController` (~12 s). Note MV3 also **terminates the SW if a single `fetch()` takes >30 s** to return — keep well under that.

**Retry / backoff.** Retry only **connection errors, 408, 425, 429, 5xx**. **Exponential backoff + jitter**, capped at **3 attempts**, max backoff ~30–60 s, and **honor `Retry-After`**. **Never retry 403/404** (wastes budget / gets you blocked). Treat 429/503 as backpressure, not transient errors. Alert/log a `failed` state per URL.

**Robots/etiquette.** For a user indexing their *own* bookmarks this is a gray area (it's user-initiated, single-page-per-site, not a spider), but staying polite is also the reliable choice: identify honestly, keep per-host rate low, back off on errors. A default of "one request per host at a time, brief delay" is more than sufficient here.

**Resumability.** Persist queue + per-URL status (`pending`/`fetching`/`done`/`failed`/`dead`) in `chrome.storage` or IndexedDB, **keyed by normalized URL** (Q7) so retries are idempotent (GET is safe to repeat; last write wins). Never keep progress in SW global variables — they vanish on termination.

**MV3 lifecycle constraints (the hard part).**
- SW terminates after **30 s idle**, if **one event takes >5 min**, or if it's unresponsive to a ping for 30 s. Any global state is lost on shutdown → persist everything.
- **`chrome.alarms` minimum period is 30 s** (Chrome 120+) and alarms **wake a terminated worker** — use alarms to drive the crawl in **small resumable batches** ("process next K pending URLs, persist, exit").
- **Offscreen documents have no auto-expiry** (except audio) and messages from them reset the SW idle timer — an open `DOM_PARSER` offscreen doc both does your parsing and helps hold the worker alive during a batch. Close it when idle to be a good citizen.
- Chrome guidance is explicit: **design for unexpected termination; do not fight the lifecycle** / don't keep the SW alive indefinitely. Keep-alive "hacks" (setInterval pings, Highlander port) are unofficial and may break.

**Battery/perf.** Prefer running index builds when the machine is idle (`chrome.idle` API) and, if you want to be extra considerate, only auto-run on AC power; always allow the user to pause. Run embedding inference **off the main thread** (Web Worker) and cache the model (Transformers.js caches under the extension origin — one shared cache for the whole install). Small batches + alarms also spread CPU/network so you don't spike the user's machine.

---

## Q6 — Auto-tagging without paid AI

| Strategy | How | Pros | Cons |
|---|---|---|---|
| **(a) Embedding zero-shot vs. curated taxonomy** | Embed each tag/label once; tag a bookmark by cosine-sim of its composite embedding to label embeddings; threshold + top-k | **Reuses the embedding you already compute** (zero extra model), controlled vocabulary, semantic (tags "cars" even if text says "automobile"), consistent across corpus | Needs a good taxonomy; threshold tuning; can't invent new tags |
| **(b) Keyword extraction (YAKE/RAKE/TextRank/KeyBERT-style)** | Statistical/graph extraction of salient phrases from the composite text | No taxonomy needed; surfaces long-tail/specific terms literally present | Surface-form only; noisy; JS ports are fragile; not a controlled vocabulary |
| **(c) Domain/URL heuristics** | Rule table: `github.com→dev`, `youtube.com→video`, `arxiv.org→research`, `*.gov→reference`, etc.; URL path keywords | Near-free, high precision, works even when fetch fails | Coverage limited to known domains/patterns |
| **(d) Tiny local generative model** | On-device small LLM generates tags | Flexible phrasing | Heavy download/RAM, slow, awkward in MV3 SW lifecycle, overkill |

**JS library reality (2025–2026):**
- **No mature "KeyBERT.js."** KeyBERT is Python. The JS equivalent is to replicate it with Transformers.js embeddings + cosine similarity — which is exactly strategy (a), so you get KeyBERT-style semantic tagging for free once you have the embedding stack.
- **`retext-keywords`** (v8.0.2, ESM-only, needs `retext-pos` first) is the most established pure-JS keyphrase extractor — but its **own maintainers warn extraction is "heavy and sometimes fragile," and you may be better off with a manual keyword list**. **`keyword-extractor`** is a simple stopword filter; **RAKE** JS ports exist for statistical scoring.

**What quality implementations do:** local/private extensions (e.g. **Recall**) use **URL-pattern matching + content-keyword analysis to bucket into a fixed set of ~12 categories** — i.e. heuristics + light keyword analysis, not an LLM. The paid/cloud tools (Bookmarkjar, Better Bookmarks, AI Bookmark Manager) use hosted LLMs — off-limits for zero recurring cost.

**Recommendation (hybrid, zero-cost):**
1. **Domain/URL heuristics first** — cheapest, highest precision, and works on degraded (fetch-failed) records.
2. **Embedding zero-shot against a curated taxonomy** as the primary semantic tagger — reuse the bookmark's composite embedding; assign all labels above a cosine threshold (plus a guaranteed top-1). This is the KeyBERT-style approach without a second model and gives a controlled, consistent tag vocabulary.
3. **Optional keyword extraction** (RAKE or `retext-keywords`) to mine 1–3 long-tail free-text tags per bookmark for terms your taxonomy doesn't cover — surface these as suggestions, not authoritative tags, given the fragility warning.

Curate the taxonomy from the corpus itself (cluster the embeddings, name the clusters) so labels match how *this* user's bookmarks actually distribute.

---

## Q7 — URL canonicalization / dedup

**Primary library: `normalize-url`** (Sindre Sorhus, npm). Out of the box it:
- strips UTM params by default (`removeQueryParameters` defaults to `[/^utm_\w+/i]`),
- **sorts query params** and resolves dot segments (key for dedup),
- removes default ports (80/443), lowercases host, normalizes percent-encoding,
- strips the auth (`user:password@`) part by default.

**Add on top of it:**
- **Extend the strip list** beyond UTM: `fbclid`, `gclid`, `msclkid`, `mc_eid`, `mc_cid`, `igshid`, `si` (YouTube), `ref`/`ref_src` *(careful — `ref` sometimes affects content/affiliate views)*, and similar analytics IDs. Keep the list **configurable**.
- **Normalize for dedup:** force `http→https` where the site supports it, drop/unify trailing slash, drop `#fragment` (unless it's a hashbang route), lowercase host, strip `www.` (with care — a few sites differ). Sort params (already done).
- **Host-specific rules** (postrank-uri / link-canonical pattern): e.g. strip `nytimes.com`'s `partner`, normalize YouTube `youtu.be/<id>` ↔ `youtube.com/watch?v=<id>`, canonicalize Amazon `/dp/<ASIN>`. Add per-host rules as you discover duplicates.
- **RFC 3986 safety split:** case/percent-encoding/default-port/dot-segment normalizations are *safe* (meaning-preserving); query sorting and tracking-param removal are *optional* (can change meaning on servers that treat order/params as significant) — keep the optional ones toggleable, and don't strip a param unless you're confident it's purely analytical.

**Dedup mechanic:** compute the canonical form and use it as the primary key for the bookmark record and the crawl queue; **normalize before adding to the visited set**. Chrome bookmark exports frequently contain both `http`/`https` and `www`/non-`www` variants of the same page, plus tracking-tagged copies — canonicalization collapses these into one indexed item.

---

## Sources

All accessed 2026-07-10.

**Q1 — fetch/CORS & Web Store review**
- Chromium — Changes to Cross-Origin Requests in Chrome Extension Content Scripts: https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/
- CorsAPI — MV3 host_permissions, CORS, service worker limitations: https://corsapi.com/en/blog/chrome-extension-manifest-v3-cors-host-permissions
- Extension.js — MV3 service workers, content scripts, host_permissions: https://extension.js.org/docs/concepts/manifest-v3
- Chrome for Developers — Chrome Web Store review process: https://developer.chrome.com/docs/webstore/review-process
- ExtensionBooster — Host Permission In-Depth Review warning fix: https://extensionbooster.net/blog/chrome-extension-host-permission-in-depth-review-warning-fix-guide/
- ExtensionFast — Request less host access, get more installs (2026): https://www.extensionfast.com/blog/chrome-extension-permissions-how-to-request-less-and-get-more-installs

**Q2 — text extraction without a DOM**
- Chrome for Developers — chrome.offscreen API reference (valid `reasons`, single-doc limit, DOM+fetch): https://developer.chrome.com/docs/extensions/reference/api/offscreen
- Chrome for Developers — Offscreen Documents in Manifest V3 (blog): https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3
- `@mozilla/readability` (npm, v0.6.0): https://www.npmjs.com/package/@mozilla/readability
- mozilla/readability (GitHub, DOMPurify/JSDOMParser caveats): https://github.com/mozilla/readability
- masylum/cheer-reader (Readability port on Cheerio, worker-friendly): https://github.com/masylum/cheer-reader
- LinkeDOM — a JSDOM alternative (Andrea Giammarchi): https://webreflection.medium.com/linkedom-a-jsdom-alternative-53dd8f699311
- npm trends — cheerio vs htmlparser2 vs jsdom vs linkedom: https://npmtrends.com/cheerio-vs-htmlparser2-vs-jsdom-vs-linkedom
- ZachSaucier/Just-Read (reader-mode extension, real Readability usage): https://github.com/ZachSaucier/Just-Read

**Q3 — retrieval signals & composite vs. chunking**
- Utilizing Metadata for Better RAG (ECIR 2026, field ablations): https://people.cs.vt.edu/naren/papers/ecir-metadata-2026.pdf (HTML: https://arxiv.org/html/2601.11863v1)
- LLM-Augmented Retrieval / Doc-Level Embedding (arXiv): https://arxiv.org/pdf/2404.05825
- PageIndex in RAG (page-level indexing): https://medium.com/@vaibhav-p-dixit/pageindex-in-rag-the-upgrade-your-retrieval-pipeline-desperately-needs-c6899b81cbb8
- Firecrawl — Best Chunking Strategies for RAG (2026): https://www.firecrawl.dev/blog/best-chunking-strategies-rag
- Hacker News — Autolicious discussion (short-query ambiguity, hybrid search): https://news.ycombinator.com/item?id=37987877

**Q4 — failure taxonomy**
- Passionfruit — JavaScript Rendering and AI Crawlers: Can LLMs Read Your SPA? (2026): https://www.getpassionfruit.com/blog/javascript-rendering-and-ai-crawlers-can-llms-read-your-spa
- Firecrawl — Best way to scrape SPAs (empty shell): https://www.firecrawl.dev/glossary/web-scraping-apis/best-way-to-scrape-single-page-applications-spas
- Ahrefs — Link Rot study (66.5% of sampled links dead since 2013): https://ahrefs.com/blog/link-rot-study/
- Birchtree — 17,702 saved links, ~25.9% dead over 15 years: https://birchtree.me/blog/i-looked-at-17702-links-ive-saved-since-2009-to-see-how-bad-link-rot-really-is/
- TabMark — Clean up dead bookmark links (age-based dead-rate rules of thumb): https://tabmark.dev/blog/posts/clean-up-dead-bookmarks/
- Nutrient — Extract text from PDF with PDF.js (2026): https://www.nutrient.io/blog/how-to-extract-text-from-a-pdf-using-javascript/
- mozilla/pdf.js #10429 — PDF.js in Chrome extensions: https://github.com/mozilla/pdf.js/issues/10429

**Q5 — crawl etiquette, performance, MV3 lifecycle**
- fastCRW — Concurrent Requests & Rate Limiting: https://fastcrw.com/blog/concurrent-requests-rate-limiting-scale
- Cameron Boehmer — Building a Polite & Fast Web Crawler: https://cameronboehmer.com/building-a-polite-and-fast-web-crawler.html
- ScrapeOps — Python Requests retry failed requests (2026 guide): https://scrapeops.io/python-web-scraping-playbook/python-requests-retry-failed-requests/
- Chrome for Developers — The extension service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Google Groups (chromium-extensions) — MV3 service workers and alarms: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/k5upFLVnPqE

**Q6 — auto-tagging**
- MaartenGr/KeyBERT (Python; semantic keyphrase via BERT + cosine): https://github.com/MaartenGr/KeyBERT
- retextjs/retext-keywords (JS keyphrase, ESM, "fragile" caveat): https://github.com/retextjs/retext-keywords
- keyword-extractor (npm): https://www.npmjs.com/package/keyword-extractor
- Zero-shot topic taxonomy tagging (arXiv, retail banking): https://arxiv.org/pdf/2401.06790
- HuggingFace — How to Use Transformers.js in a Chrome Extension (MiniLM embeddings, IndexedDB vectors, MV3 caveats): https://huggingface.co/blog/transformersjs-chrome-extension
- Recall / Smart Bookmark Search (local embeddings + URL-pattern/keyword tagging) — via landscape review: https://chromewebstore.google.com/detail/ai-bookmark-manager/nhdjcmajabkglpplonejpocmlfofokbl

**Q6 (models) — on-device embeddings**
- Google Developers Blog — Introducing EmbeddingGemma (308M, on-device, Sept 2025): https://developers.googleblog.com/en/introducing-embeddinggemma/
- HuggingFace — Welcome EmbeddingGemma: https://huggingface.co/blog/embeddinggemma
- Google AI — EmbeddingGemma model overview (MRL dims, prompts): https://ai.google.dev/gemma/docs/embeddinggemma
- Transformers.js Chrome extension guide (above) for the MiniLM/WebGPU path.

**Q7 — URL canonicalization**
- `normalize-url` (npm; default utm strip, param sort, dedup options): https://www.npmjs.com/package/normalize-url
- postrank-labs/postrank-uri (host-specific tracking-param rules): https://github.com/postrank-labs/postrank-uri
