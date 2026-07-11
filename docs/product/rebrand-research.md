# Rebrand research — CWS landscape, naming, store copy

> **DECISION (2026-07-11, user):** Name = **Starry**. Store title = `Starry — AI Bookmark Search`.
> Short description (user-authored, final): "Find your bookmarks like a simple Google search.
> Local, private, and free. It just works." (90 chars). CWS "starry" search = only night-sky
> wallpaper themes, zero functional extensions — clean. Note for review: description references
> "Google search" comparatively; precedent exists (Featured "Speedy Bookmarks Search" says
> "google-liked search engine") — if review ever objects, fallback wording: "like a simple web
> search". Icon = night-sky blue square, white four-point star + companion star (gen-icons.mjs).

> Working doc for the rename/rebrand + Chrome Web Store packaging phase (July 2026).
> Live CWS sweeps done in the dev-loop browser; deep competitor/rules scans by research agents.

## Live CWS search sweeps (July 2026, hl=en-US)

### "bookmark ai" — the space we'd rank in

Crowded with tiny, low-rated, near-identical listings. Every name is a permutation of
"AI Bookmark X"; every tagline is "AI-powered bookmark manager with [organizing/tagging/search]".
Most are cloud/API-tied (Gemini, accounts). No leader, no differentiation.

| Store title | Tagline (short description) | Rating |
|---|---|---|
| Bookmark AI Assistant | AI-powered … organizes your bookmarks based on your existing folder structure | 2.3 |
| AI Bookmark | Intelligent bookmark manager powered by on-device AI | 0.0 |
| AI Bookmark Copilot | Your intelligent assistant for managing, organizing, and finding your bookmarks using AI | 4.3 |
| Bookmark Genie - Organize with AI | AI-powered tool that organizes, categorizes, and manages your bookmarks | 1.8 |
| Smart Bookmark | AI-powered bookmark manager with automatic tag generation and semantic search | 3.8 |
| Bookmark AI | AI-powered bookmark manager with auto-categorization, tagging, and smart search | 5.0 (tiny) |
| BookmarkBuddy | AI-powered … Find your best bookmark instantly with smart semantic search | 4.0 |

### "bookmark search" — the Featured utility niche

Established, well-rated, ALL lexical/fuzzy — none semantic, none AI:
- **Bookmarks Quick Search** (Featured, 4.6) — "Search bookmarks quickly and easily, with a search popup"
- **Search Bookmarks, History and Tabs** (Featured, 4.9) — "(fuzzy) search and navigate bookmarks, history and open tabs"
- **Speedy Bookmarks Search** (Featured, 3.9) — "google-liked search engine for bookmarks … offline indexing"
- Bookmark Search (4.4) — omnibox-only

### "bookmark manager" — the organize-first old guard

Bookmark Manager and Viewer (Featured 3.9, "fuzzy search"), Dragon (4.7, drag-drop),
Starmarks (3.7), Bookmanize (3.7, tagging/filtering), Elink (4.1, cloud/newsletters).
All organize/view-first; search is an afterthought.

### "semantic search" — our positioning language already works… for HISTORY

The on-device-AI privacy pitch is proven, but only in the history-search niche:
- **TraceMind: Local AI & Semantic History Search** (Featured, 4.0) — "Private, on-device AI for your browser. Semantic search for history, offline page recall, and 100% local data sovereignty."
- **MemexNG - Semantic History Search** (5.0) — "Never lose what you've read. Semantic search for your browsing history — 100% private, zero cloud, on-device AI."
- **SemanticFinder** (Featured, 5.0) — "In-browser Semantic Search via Transformers.js" (page content, same tech stack as us)

**Nobody owns "semantic bookmark search, 100% local."** That's our lane.

### "smart bookmarks" + closest competitor found

Generic AI-manager soup (Smart Bookmark/Smart Bookmarks/SortlyAI/TabSpark…), mostly cloud.
Notable: **Smart Bookmarks AI** — "on-device Gemini Nano or Claude API" (organize-only, no search focus).

**Closest rival in spirit: "Recollect" (5.0, tiny)** — "Find bookmarks by content. Create and
search your personal knowledge base — all within Chrome browser." Small, but exact-overlap copy.

## Name availability (live CWS searches)

| Candidate | Verdict | Evidence |
|---|---|---|
| **Lodestar** | ✅ FREE in this space | only unrelated Japanese SSO modules (LodestarALM) |
| **Starmap** | ✅ effectively free (EN) | one Chinese AI start-page "StarMap", nothing bookmark-related |
| Constellation | ⚠️ usable, crowded | crypto wallet brand (Constellation Network), several small tools, none bookmarks |
| Starmark(s) | ❌ | "Starmarks Bookmark Manager" exists |
| Recollect | ❌ | 3 products incl. direct-competitor bookmark search |
| Pinpoint | ❌ | 7+ extensions share the exact name |
| Wayfinder | ❌-ish | several, incl. "Entalas Wayfinder" bookmark/link manager |
| Hypermark | ❌ | "Hyper Mark" (Pocket-import read-later) |
| Recall | ❌ (poisoned) | getrecall.ai + Microsoft Windows Recall privacy fiasco association |

## Patterns worth copying

1. **Title formula of real products:** `Brand — keyword tagline` ("Raindrop.io — Smart bookmarks",
   "TraceMind: Local AI & Semantic History Search"). Brand word can be pure/evocative; the suffix
   carries CWS search keywords ("bookmark", "search", "AI", "local").
2. **Featured utility names are keyword-descriptive** — we get the same SEO via the suffix without
   a generic name.
3. **Privacy copy that already converts (adjacent niche):** "100% private, zero cloud, on-device
   AI" / "nothing leaves your computer" — matches our onboarding voice exactly.
4. **Gap nobody claims:** works on the bookmarks you ALREADY have (every AI rival wants you to
   save into their system); no account; free forever; type-what-you-remember.

## CWS listing rules (agent scan, official-docs-first, July 2026)

**Fields**
- Name: max **75 chars** (changed from 45 ~2023). No Google trademarks — **no "Chrome" in the name**; use "for Google Chrome™" in description. Duplicate names technically allowed (ID is the unique key) but avoid for discoverability. Misleading names prohibited. No rule against "AI" in names.
- Short description (summary): **132 chars**, plain text — shown in search/category cards.
- Detailed description: plain text only (line breaks only, no markdown). Keyword repeated ≥5 times = spam violation. No unattributed testimonials. Max 5 site/brand names listed.
- Category: bookmarks tools live under **Tools** or **Workflow & Planning**.

**Assets**
- Store icon 128×128 PNG (artwork 96×96 + 16px transparent padding; must work on dark).
- Screenshots: 1–5, **1280×800** preferred, full bleed.
- **Small promo tile 440×280 still required** (listings without it rank after those with).
- Marquee 1400×560 optional (only for marquee featuring). Old 920×680 tile is GONE.

**Privacy tab (blocks publishing if incomplete)**
- Single-purpose statement + **per-permission written justification** (bookmarks, favicon, offscreen, alarms, omnibox, host permissions each).
- Remote-code declaration: MV3 bans remotely hosted code → declare "no remote code" and **bundle model/WASM**. VERIFIED (src/core/embedder/transformers.ts): ORT runtime `.mjs/.wasm` (the executable code) IS bundled into dist/ (`wasmPaths` → extension root) ✅; model **weights** download from Hugging Face Hub on first run (`env.allowLocalModels = false`) — weights are data interpreted by the bundled runtime, not remote code. Precedent: SemanticFinder (Featured, transformers.js, runtime HF download) and TraceMind/MemexNG all published this way. PACKAGING DECISIONS: (a) disclose the one-time model download in privacy policy ("downloads the model once from Hugging Face; none of your data is ever sent"); (b) decide bundle-vs-download (bundling adds ~tens of MB to the zip but makes "no remote fetches at all" literal); (c) drop unused `storage` permission from manifest; (d) crawling to optional_host_permissions.
- **Privacy policy URL required even for 100% local** — "handling" includes local processing of bookmarks/page content. Can be short; host anywhere public.
- Local-only data must still be disclosed on the data-usage certification.
- New enforcement from Aug 1 2026 (announced Jul 1): prominent disclosure standard — our "collects nothing, all local" posture is compliant; state it prominently.

**Review & publish**
- $5 one-time registration; 2FA mandatory; contact email fixed at signup.
- EU DSA: declare **Non-Trader** (hobbyist, free, no monetization) — no verification burden.
- Review: days-to-weeks; April 2026 surge = slower. New dev + new extension + broad hosts = slow path. ⚠️ ACTION: move crawling from `host_permissions: ["<all_urls>"]` to **optional_host_permissions** (it's opt-in in our onboarding anyway) to avoid the slow path + match consent UX.
- No staged rollout for new listings; deferred publish ≤30 days after approval.

**Discovery**
- Ranking: ratings + installs-vs-uninstalls heuristic; complete listing = Google's only official SEO advice; name/summary keyword match is community consensus.
- **Featured badge**: manual review; requires intuitive UX, modern APIs, privacy respected, quality listing; self-nominate via One Stop Support once published; core features free without login — we match every criterion.

## Competitor deep scan (agent, live CWS pages, July 2026)

**The market by tier**
- 100K–400K users: Raindrop.io (400K, 4.1, "All-in-one bookmark manager", freemium cloud),
  Toby (300K, tabs, freemium backlash over 60-tab cap), Bookmark Sidebar (300K, 4.5, free/local/OSS),
  Workona (100K), mymind (100K, paid, "extension for your mind"), Recall/getrecall.ai (100K, AI cloud freemium).
- Mid: Karakeep ex-Hoarder (40K, self-host), Memex (deprecated V1, dying), Fabric (10K), Sprucemarks (10K, auto-sort).
- The "AI bookmark" tail: NOTHING above ~6K users has "AI" in the title. All tiny AI rivals are
  BYO-API-key (Lumina/Gemini), cloud-account (SaveDay, PlutoAI), or fake-AI keyword extraction
  ("Recall: Smart Bookmark Search", 45 users).
- DEAD: Pocket (shut down 2025 — squatters own the name now; user distrust of cloud silos is live),
  Google Bookmark Manager (2018), Linkish (delisted), Omnivore (2024).

**Naming laws observed**
1. Big installs = pronounceable invented/real brand word ≤3 syllables; category keyword lives in
   the title TAIL ("Toby: Tab Management Tool", "Recall | Your Knowledge is Your Edge").
2. Keyword-stuffed descriptive names cap out tiny (except legacy 2013-era utilities).
3. "AI" in title correlates with tiny; "Smart" prefix saturated in the sub-2K tier.
4. Claimed single words: Recall (×2), Memex, Fabric, Lumina, Toby, Booky, Raindrop, mymind,
   Pocket, Karakeep, Hoarder, Linkwarden, WebCull, Sprucemarks, SaveDay, Starmarks, Recollect, Pinpoint, Cairn (×8), Trove (×10), Hypermark, Wayfinder.

**Copy laws observed**
- Big brands write IDENTITY taglines <10 words ("All-in-one bookmark manager"; "Your mental bank
  of inspiration"). Small ones write feature lists — reads as SEO soup.
- Big detailed descriptions: pain-point opening sentence → feature bullets → social proof.
- Privacy language exists only in the micro tail and is muddled (WebCull "privacy" but cloud;
  Lumina "local" but cloud API key). Clean claim + real AI = unowned.

**Unowned angles (all six are literally our product)**
1. True on-device AI (model runs in your browser) — verbatim-claimable by no one else.
2. Works on the bookmarks you already have (everyone else = save-to-our-silo, import required).
3. No account, nothing leaves your computer (only micro-listings claim it, none with real AI).
4. Search what you REMEMBER, not what it's titled (memory-recall framing open at scale).
5. Free because there's no server (freemium fatigue documented in rivals' reviews).
6. Apple-grade design in the native-bookmarks segment (that tier is utilitarian).

**Watch-outs:** "Recall" double-claimed + MS Windows Recall stigma; omnibox keyword `bm` already
used by "Bookmark Search" (functional, not fatal); "semantic search" phrase appears in ~6 tiny
listings — claim needs proof-of-difference (local model + existing bookmarks), not the phrase alone.

## Wider-web name checks

- **Lodestar** ⚠️ — Lodestar Hub, Inc. (outdoor trip planning, lodestarhub.com) ships a
  "Lodestar Browser Button" CWS clipper. Generic dictionary word + tiny non-competing niche, but
  it's an incorporated company with a save-links extension. Moderate-low risk.
- **Starmap** ✅-ish — astronomy apps (star-map.fr iOS app, starmap.io file tool) own the word in
  non-competing categories; nothing bookmark-related. One letter from "Starmarks" (discoverability
  noise, not legal risk).

## Final naming matrix + draft copy

| Option | Store title (≤75) | Short description (≤132) | Notes |
|---|---|---|---|
| **Starmap** (recommended) | `Starmap — AI Bookmark Search` | "Find any bookmark by describing it. The AI runs on your computer — nothing leaves it. Free, no account, no cloud." (113) | Bookmarks ARE stars in Chrome; topics = constellations; cleanest availability; icon story obvious |
| **Lodestar** | `Lodestar — Find Any Bookmark by Describing It` | "Your memory is the search box. On-device AI finds the bookmark you mean. Free, no account, nothing leaves your computer." (120) | Best word-meaning ("the star you steer by"); Lodestar Hub adjacency |
| **Constellation** | `Constellation — Semantic Bookmark Search` | "Your bookmarks, mapped into topics and found by meaning. All on your computer. Free, private, no account." (106) | Most poetic, ties topics; crowded word, 13 chars, crypto-brand adjacency |
| Keep descriptive | `Bookmark Semantic Search` | current | Pure SEO, zero brand; data says this tier caps out tiny |

Detailed-description skeleton (chosen name, packaging phase): pain hook ("You saved it. Now find
it." + post-Pocket cloud distrust) → how it works (type what you remember) → the six claims →
permissions explainer (bookmarks/favicon/offscreen/alarms/omnibox + opt-in crawling) → privacy
(local AI, one-time model download from Hugging Face, no telemetry).
