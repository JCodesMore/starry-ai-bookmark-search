# 002 — Signal collection: one composite text per bookmark, fetch-with-floor

**Decision (2026-07-10).** Each bookmark gets ONE composite embedding text assembled by priority:
`title/og:title → meta/og:description → site_name + domain → h1/h2 → first ~300 words of readable
body → URL path tokens → folder path`. No page chunking — research shows document-level
identifiers drive document *selection*; chunking only helps locate passages within long docs,
which is not the bookmark task.

**Fetching.** `fetch()` from the service worker (bypasses CORS with host permissions — confirmed
2026 behavior). Dev builds use `<all_urls>` host permissions; a Web-Store release must switch to
`optional_host_permissions` granted at index time (review-friction evidence in research).
Parsing: meta/OG extraction first (regex/lightweight — works even for JS-shell SPAs, which
usually still ship meta tags); full readable body via offscreen document + DOMParser +
@mozilla/readability when the HTML warrants it.

**The floor, not the ceiling.** ~20–40 % of a mature corpus yields poor/no body (SPAs, auth
walls, link rot ~10 %/yr, PDFs, video). Every record therefore carries a fetch status —
`full | meta_only | baseline | dead` — and `title + URL tokens + domain + folder path` alone must
produce a usable embedding. Fetch failure NEVER excludes a bookmark from the index.

**Crawl etiquette.** ~6 global in-flight, max 2 per host, 12 s AbortController timeout, retry
only 408/425/429/5xx with capped backoff+jitter (honor Retry-After), never retry 403/404.
Queue state persists in IndexedDB keyed by canonical URL; `chrome.alarms` resumes batches across
service-worker deaths. Throttling is non-negotiable (prior art: Pinbot's unthrottled embedding
hit 8 GB RAM and nearly crashed machines).

**Canonicalization.** Keep our zero-dep `canonicalizeUrl` (tracking-param strip, www/hash/slash
rules, param sort); extend rules as dedup issues surface. Rejected `normalize-url` dep — ours is
~40 LOC and tested.

**Invalidated if:** golden queries show body text materially beats meta-only (→ raise fetch
depth), or composite-text recall is poor for long articles (→ revisit chunking for `full` pages).

Source: docs/research/signal-collection-and-tagging.md.
