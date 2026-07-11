// The status line's phase copy and the footer's count line — pure, so the
// wording is testable and stays consistent with the blueprint's copy voice.
import { INDEX_PHASE, type IndexProgress } from '../core/types';

const PERCENT_SCALE = 100;

/** One calm phase-specific line, in the personified voice ("learning", never
 * "indexing") — and never a raw "N / M bookmarks" whose M is a pass subset
 * that would contradict the footer's library count. The pipeline runs several
 * passes (baseline learn → page read → re-learn what changed); naming each
 * phase is what keeps it from reading as one job stuck in a loop. */
export function describeProgress(progress: IndexProgress): string {
  switch (progress.phase) {
    case INDEX_PHASE.Ingesting:
      return 'Reading your library…';
    case INDEX_PHASE.Fetching:
      return progress.total
        ? `Reading pages… ${progress.processed.toLocaleString()} of ${progress.total.toLocaleString()}`
        : 'Reading pages…';
    case INDEX_PHASE.Embedding: {
      if (!progress.total) return 'Learning your bookmarks…';
      const pct = Math.round((progress.processed / progress.total) * PERCENT_SCALE);
      return `Learning your bookmarks… ${pct}%`;
    }
    case INDEX_PHASE.Tagging:
      return 'Tagging what I learned…';
    default:
      return '';
  }
}

/** The footer's one quiet fact, context-aware: what the list is SHOWING —
 * result count while searching, scope while folder-filtered, library size at
 * rest. Empty string hides the footer entirely (nothing worth saying yet, or
 * zero matches — the list's own empty-state line already explains that). */
export function describeCount(args: {
  query: string;
  shown: number;
  total: number;
  scopedToFolder: boolean;
  /** Result set hit the search cap — the honest phrasing is "Top N", not a total. */
  atLimit: boolean;
}): string {
  const { query, shown, total, scopedToFolder, atLimit } = args;
  if (!total) return '';
  if (query) {
    if (!shown) return '';
    if (atLimit) return `Top ${shown.toLocaleString()} results`;
    return shown === 1 ? '1 result' : `${shown.toLocaleString()} results`;
  }
  if (scopedToFolder) return `${shown.toLocaleString()} of ${total.toLocaleString()}`;
  return `${total.toLocaleString()} bookmarks`;
}
