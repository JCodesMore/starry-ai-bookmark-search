// Message contracts between extension contexts (popup ↔ service worker).
// Validate at this boundary; everything inward trusts these shapes.

import type { IndexProgress, ScoredHit } from '../core/types';
import type { BrowseSort, RankWeights } from '../core/search';
import type { Prefs } from '../core/prefs';

export type PingMessage = { type: 'ping' };
export type SearchMessage = {
  type: 'search';
  query: string;
  /** Dev/tuning seam: per-call ranking-weight override, sanitized by the SW. */
  weights?: Partial<RankWeights>;
  /** False disables the click-history boost (eval harness needs reproducible base ranking). */
  personalized?: boolean;
};
/** Open a result AND learn from the choice — the SW owns tab creation so the
 * click record and its bounce tracking can't race the popup closing. */
export type OpenResultMessage = {
  type: 'open-result';
  url: string;
  recordId: string;
  query: string;
  /** 1-based rank the result had in the list when activated. */
  rank: number;
  background: boolean;
};
/** Browse-at-rest: the library with no query — sorted, optionally folder-scoped. */
export type BrowseMessage = {
  type: 'browse';
  sort: BrowseSort;
  /** Full folderPath; scopes to it and its subtree. Absent = whole library. */
  folder?: string;
};
/** Delete a bookmark (the SW captures its position first so undo can restore
 * it in place). sync.ts hears the removal and cleans the index on its own. */
export type DeleteBookmarkMessage = { type: 'delete-bookmark'; recordId: string };
export type UndoDeleteMessage = { type: 'undo-delete' };
/** Open Chrome's own manager focused on the bookmark's parent folder. */
export type RevealBookmarkMessage = { type: 'reveal-bookmark'; recordId: string };
export type IndexStateMessage = { type: 'index-state' };
export type GetPrefsMessage = { type: 'get-prefs' };
/** The SW is the single prefs writer: applying may abort an in-flight crawl
 * and always re-runs the index pass so exclusions take effect immediately. */
export type SetPrefsMessage = { type: 'set-prefs'; prefs: Prefs };
/** Finishing first-run onboarding: saves the chosen prefs, latches the
 * onboarded flag, and starts the very first index pass. The ONLY way index
 * work ever begins on a fresh install. */
export type CompleteOnboardingMessage = { type: 'complete-onboarding'; prefs: Prefs };
export type ReindexMessage = { type: 'reindex' };
/** Destructive factory reset: cancels in-flight index work, wipes everything
 * (records, vectors, icons, clicks, prefs, the onboarded flag), and reopens
 * onboarding. Nothing rebuilds until the user finishes onboarding again. */
export type ResetDataMessage = { type: 'reset-data' };
/** Dev-loop diagnostic: exercises the embedding engine end-to-end in the SW. */
export type DebugEmbedMessage = { type: 'debug-embed'; text: string };
/** Dev-loop diagnostic: the omnibox suggestion pipeline for a query — CDP
 * cannot drive the real address-bar dropdown, so tools verify through this. */
export type DebugOmniboxMessage = { type: 'debug-omnibox'; query: string };
/** Dev-loop diagnostic: the persisted lifecycle event log (survives SW death). */
export type DiagLogMessage = { type: 'diag-log' };
/** Dev-loop diagnostic: cluster-discovered topics with live member counts. */
export type DebugTopicsMessage = { type: 'debug-topics' };
export type Message =
  | PingMessage
  | SearchMessage
  | BrowseMessage
  | OpenResultMessage
  | DeleteBookmarkMessage
  | UndoDeleteMessage
  | RevealBookmarkMessage
  | IndexStateMessage
  | GetPrefsMessage
  | SetPrefsMessage
  | CompleteOnboardingMessage
  | ReindexMessage
  | ResetDataMessage
  | DebugEmbedMessage
  | DebugOmniboxMessage
  | DebugTopicsMessage
  | DiagLogMessage;

export type PrefsResponse = { ok: boolean; prefs: Prefs };

export type DebugOmniboxResponse = {
  ok: boolean;
  suggestions: { content: string; description: string }[];
};

export type DiagLogResponse = {
  ok: boolean;
  entries: { ts: number; event: string; detail?: string }[];
};

export type BrowseResponse = {
  ok: boolean;
  hits: ScoredHit[];
  /** Unique folder paths for the browse filter control. */
  folders: string[];
};

export type IndexStateResponse = {
  ok: boolean;
  progress?: IndexProgress;
  /** Total records in the local index — the footer's one quiet fact. */
  recordCount?: number;
  /** False until first-run onboarding completes — the popup shows its setup
   * card instead of search, and no index work has started yet. */
  onboarded?: boolean;
};
export type RankedSearchResponse = {
  ok: boolean;
  hits: ScoredHit[];
  /** True when semantic scoring wasn't ready in time — UI may re-query. */
  semanticPending?: boolean;
  progress?: IndexProgress;
};

export type DebugEmbedResponse = {
  ok: boolean;
  dim?: number;
  warmUpMs?: number;
  embedMs?: number;
  sample?: number[];
  error?: string;
};

export type SearchHit = { id: string; title: string; url: string };

export type PingResponse = { ok: boolean; pong: boolean; version: string };
export type SearchResponse = { ok: boolean; hits: SearchHit[] };
