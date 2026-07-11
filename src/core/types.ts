// Shared domain types. Shapes only — behavior lives in the owning module.
// Fixed label sets are const maps per coding standards (no stringly-typed states).

export const FETCH_STATUS = {
  /** Not yet fetched. */
  Pending: 'pending',
  /** Full readable body extracted. */
  Full: 'full',
  /** Meta/OG tags only (e.g. JS-shell SPA). */
  MetaOnly: 'meta_only',
  /** No fetch data — title + URL + folder signals only. Always searchable. */
  Baseline: 'baseline',
  /** Unreachable (dead link, DNS, hard 4xx). Still searchable via baseline signals. */
  Dead: 'dead',
} as const;
export type FetchStatus = (typeof FETCH_STATUS)[keyof typeof FETCH_STATUS];

export type PageSignals = {
  ogTitle?: string;
  metaDescription?: string;
  siteName?: string;
  headings?: string[];
  /** First ~300 words of readable body text. */
  excerpt?: string;
  /** Best <link rel=icon> the page declares (absolute). Display-only — composite.ts
   * must never include it, or every crawl would dirty the contentHash for nothing. */
  iconUrl?: string;
};

export type BookmarkRecord = {
  /** chrome.bookmarks node id. */
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  /** e.g. "Bookmarks bar / Dev / Tools". */
  folderPath: string;
  dateAdded: number;
  fetchStatus: FetchStatus;
  signals: PageSignals;
  /** The ONE text that gets embedded (decision 002). */
  compositeText: string;
  /** Hash of compositeText — unchanged hash ⇒ skip re-embed. */
  contentHash: string;
  tags: string[];
  /** Cluster-discovered topic labels (topics.ts) — the user's own vocabulary,
   * kept apart from `tags` so the zero-shot tagger's wholesale replacement
   * never wipes them. At most one topic per record today. */
  learnedTags?: string[];
  /** Topics stamp (algo + model version) learnedTags were computed with. */
  learnedTopicsVersion?: string;
  /** Embedding model version the stored vector was computed with; null = not embedded yet. */
  modelVersion: string | null;
  /** Tagger version (model + tag-input scheme) tags were computed with; absent = stale. */
  tagModelVersion?: string;
  updatedAt: number;
};

export type VectorRow = {
  id: string;
  /** L2-normalized Float32Array bytes. */
  vector: ArrayBuffer;
  modelVersion: string;
};

export const INDEX_PHASE = {
  Idle: 'idle',
  Ingesting: 'ingesting',
  Fetching: 'fetching',
  Embedding: 'embedding',
  Tagging: 'tagging',
  Done: 'done',
} as const;
export type IndexPhase = (typeof INDEX_PHASE)[keyof typeof INDEX_PHASE];

export type IndexProgress = {
  phase: IndexPhase;
  processed: number;
  total: number;
  failed: number;
  /** 0–100 while the embedding model downloads on first run. */
  modelDownloadPct?: number;
  startedAt: number;
  updatedAt: number;
};

export const MATCH_REASON = {
  Semantic: 'semantic',
  Title: 'title',
  Url: 'url',
  Tag: 'tag',
  Domain: 'domain',
  Folder: 'folder',
  /** Crawled page description/headings — the row snippet shows the literal hit. */
  Description: 'description',
} as const;
export type MatchReason = (typeof MATCH_REASON)[keyof typeof MATCH_REASON];

/** A crawl-captured favicon shared by every bookmark on its origin. An empty
 * bytes buffer is a negative-cache marker: "we looked, this origin has none"
 * — it stops the icon sync from re-fetching known-missing icons forever. */
export type IconRow = {
  origin: string;
  bytes: ArrayBuffer;
  contentType: string;
  updatedAt: number;
  /** Icon-sync algorithm version this row was written by (absent = v1). A version
   * bump re-arms negative-cached origins exactly once under the improved strategy. */
  syncVersion?: number;
  /** The declared icon URL known when this row was attempted ('' = none). A record
   * later declaring a DIFFERENT icon re-arms a negative-cached origin. */
  declaredUrl?: string;
};

/** One recorded result activation — the raw material for personalized re-ranking. */
export type ClickRow = {
  /** autoIncrement key; absent until persisted. */
  key?: number;
  /** Token-sorted normalized query text ("prices gold" ≡ "gold prices"). */
  queryNorm: string;
  queryTokens: string[];
  recordId: string;
  ts: number;
  /** 1-based rank the result had when clicked (deeper clicks are stronger signals). */
  rank: number;
  /** False = suspected misclick (opened tab closed again within seconds). */
  sat: boolean;
};

export type ScoredHit = {
  id: string;
  title: string;
  url: string;
  score: number;
  /** The single honest explanation shown in the UI (decision 003). */
  reason: MatchReason;
  tags: string[];
  /** Where the bookmark lives in the tree — a strong disambiguator on hover. */
  folderPath: string;
  dateAdded: number;
  /** Meta description / readable excerpt snippet for the result row. */
  description?: string;
  /** The page didn't respond when last crawled (fetchStatus Dead). Rendered as
   * a quiet marker — the bookmark stays fully searchable (decision 002). */
  dead?: boolean;
};
