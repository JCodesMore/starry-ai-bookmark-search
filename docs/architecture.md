# Architecture — Starry (formerly Bookmark Semantic Search)

Decisions behind this design: docs/decisions/001–006. Read the decision record before changing
its area.

## Contexts (MV3)

- **Service worker** (`src/background.ts`, thin entry) — owns the index lifecycle, bookmark
  events, and search orchestration. Mortal: all long-running state persists to IndexedDB;
  `chrome.alarms` resumes interrupted indexing. Cannot parse DOM or dynamic-import (so no ORT
  WASM) — both are delegated to the offscreen document via `core/offscreen-client.ts`.
- **Offscreen document** (`src/offscreen/`) — the DOM + ML host: DOMParser + Readability
  extraction AND the transformers.js embedding engine (decision 001 amendment). SW talks to it
  through `core/embedder/offscreen-proxy.ts` (same EmbeddingProvider seam).
- **Popup** (`src/popup/`) — command-palette UI. Opens a long-lived `chrome.runtime.connect` Port
  on mount: keeps the SW alive during a search session and triggers model warm-up immediately.

## Module map (src/)

```
lib/        messages.ts (typed contracts, validated at boundary) · url.ts (canonicalization)
core/
  types.ts        BookmarkRecord, FetchStatus, IndexProgress, ScoredHit, MatchReason, Tag
  storage.ts      typed IndexedDB wrapper (db "bss": records / vectors / meta stores)
  ingest.ts       full bookmark-tree crawl → records
  sync.ts         onCreated/onChanged/onMoved/onRemoved → record updates + queue work
  composite.ts    signals → ONE composite embedding text (priority per decision 002)
  fetcher.ts      page fetch + meta/OG extraction; delegates full text to offscreen
  queue.ts        persistent rate-limited crawl queue (6 global / 2 per host / 12s timeout)
  embedder/
    provider.ts   EmbeddingProvider interface + MODEL_VERSION constant
    transformers.ts  bge-small-en-v1.5 q8 via @huggingface/transformers (WASM)
  vectors.ts      Float32Array store + brute-force cosine (pre-normalized dot product)
  taxonomy.ts     curated tag list + domain-heuristic table (data, no logic)
  tagger.ts       zero-shot tag assignment (taxonomy vectors × bookmark vector) + heuristics
  search.ts       hybrid ranking: instant lexical + semantic fusion + match reasons
  indexer.ts      orchestration: ingest → queue → fetch → composite → embed → tag → store,
                  with persisted IndexProgress events
offscreen/      offscreen.html/ts — extraction service (DOM work only)
popup/          UI (rendering + keyboard model only; zero business logic)
background.ts   entry: wires chrome.* listeners to core modules
```

Import direction: `popup/ → lib/messages` (messages only); `background.ts → core/*`;
`core/* → lib/*`; nothing imports from `popup/` or `background.ts`. UI knows message contracts,
never storage or models.

## Data model (IndexedDB `bss` v1)

- **records** (key: bookmark id): url, canonicalUrl, title, folderPath, dateAdded, fetchStatus
  (`pending|full|meta_only|baseline|dead`), signals {ogTitle?, metaDescription?, siteName?,
  headings?, excerpt?}, compositeText, contentHash, tags[], modelVersion, updatedAt.
  `contentHash` gates re-embedding: unchanged composite ⇒ skip.
- **vectors** (key: bookmark id): ArrayBuffer (Float32Array, L2-normalized), modelVersion.
  Vectors with stale modelVersion are re-embedded lazily (decision 001).
- **meta** (key-value): IndexProgress, queue snapshot, taxonomy-vector cache (per modelVersion),
  settings.

## The search latency contract (UX-critical)

Model cold start is 2–5 s; typing must feel instant. Therefore:
1. Popup opens → Port connect → SW begins model warm-up in parallel with user typing.
2. Every keystroke gets **instant lexical results** (weighted term hits over records — pure JS).
3. When the query embedding arrives (~0 ms warm, ≤ few s cold), semantic scores **fuse in** and
   the list refines smoothly — no flash-reorder, no spinner-blocking.
4. Model weights: fetched from HF hub on first index with progress surfaced in UI, persisted via
   Cache API; ONNX runtime WASM is bundled in dist (no remote code). CSP: `wasm-unsafe-eval`.

## Indexing lifecycle

First run: ingest tree (instant, all records `baseline`) → searchable immediately → queue fetches
→ each fetch upgrades signals → composite → embed → tag → store, progress persisted. Bookmark
events (sync.ts) enqueue single-record updates. Reindex = version bump on affected records, same
pipeline. Throttled batches (decision 002) — memory ceiling is a hard requirement.

## Verification surfaces

Unit: Vitest (fake chrome APIs / fake-indexeddb). E2E: CDP dev loop (`npm run smoke`), golden
queries (`tools/eval.mjs`, decision 003) against the real imported corpus.
