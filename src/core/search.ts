// Hybrid ranking (decision 003): instant lexical scoring fused with semantic
// cosine scores. Pure functions — no storage, no models — so ranking is fully
// unit-testable and tunable against the golden harness.
import {
  FETCH_STATUS,
  MATCH_REASON,
  type BookmarkRecord,
  type MatchReason,
  type ScoredHit,
} from './types';
import { tokenize } from '../lib/text';

export { tokenize };

export type RankWeights = {
  lexical: number;
  semantic: number;
  /** bge cosines cluster high; scores at/below the floor contribute nothing. */
  semanticFloor: number;
  /** RRF-style k — smaller sharpens the reward for the very top semantic ranks. */
  rankSharpness: number;
  /** Fraction of the semantic channel driven by corpus-relative rank; the rest
   * comes from per-query-normalized cosine magnitude (decision 007). */
  rankBlend: number;
};

// Tuned against tools/goldens.json — change via the harness, not by eye.
// lexical > semantic keeps exact-title hits above pure-vector hits (research:
// embeddings must not override literal-match intuition). The semantic channel
// is distribution-aware (decision 007): a fixed cosine ceiling can't see that
// e.g. 0.674 is the 3rd-best score of 1,346 for this query — rank can.
export const DEFAULT_WEIGHTS: RankWeights = {
  lexical: 0.55,
  semantic: 0.45,
  semanticFloor: 0.5,
  // k=5 from the tools/tune.mjs sweep (21/21 goldens, MRR 0.781): short
  // candidate lists want a small k so the very top ranks stand apart.
  rankSharpness: 5,
  rankBlend: 0.6,
};

/** Substring-phrase evidence only counts for multi-word queries — a single
 * short token as substring is noise ("git" would hit "Digital Trends"). */
const MIN_PHRASE_TOKENS = 2;
const MIN_PHRASE_LENGTH = 2;
/** Description cap: one scannable line at rest, ~3 clamped lines in the
 * hover-expanded detail card (the card clips the rest via CSS). */
const SNIPPET_MAX_CHARS = 240;
const PHRASE_SCORE = 1;
const TITLE_COVERAGE_SCORE = 0.9;
const TAG_COVERAGE_SCORE = 0.65;
const URL_COVERAGE_SCORE = 0.55;
const FOLDER_COVERAGE_SCORE = 0.4;
/** Crawled description/headings/site-name: author-written page summaries, so real
 * literal evidence — but the weakest field, so page marketing copy can never outshout
 * a title/tag/url hit. The body excerpt is deliberately excluded from lexical scoring
 * (too noisy); meaning-level body matches are the semantic channel's job. */
const DESCRIPTION_COVERAGE_SCORE = 0.35;
/** A prefix hit ("git" → "github") is worth most of an exact token hit. */
const PREFIX_HIT_VALUE = 0.8;
/** Small boost when several independent components agree. */
const MULTI_COMPONENT_BONUS = 0.05;
/** Lexical evidence below this is too weak to be the honest "reason". */
const LEXICAL_REASON_THRESHOLD = 0.45;
/** Floor below which a hit carries no real evidence at all. Kept low: the popup
 * renders progressively (infinite scroll), so a browsable evidence-bearing tail
 * beats a hard cliff — ordering still puts the best first. */
const MIN_RESULT_SCORE = 0.05;
/** Max hits returned per search. The popup renders these in chunks as the user
 * scrolls; ranking 1–5k records takes a few ms, so depth is effectively free.
 * Exported so the footer counter can say "Top N" instead of a false total. */
export const SEARCH_LIMIT = 150;

/** 1 for an exact token hit, PREFIX_HIT_VALUE for a prefix hit, else 0. */
function tokenHit(queryToken: string, target: ReadonlySet<string>): number {
  if (target.has(queryToken)) return 1;
  for (const token of target) {
    if (token.startsWith(queryToken)) return PREFIX_HIT_VALUE;
  }
  return 0;
}

/** Fraction of query tokens found in target tokens (exact or prefix). */
function coverage(queryTokens: readonly string[], targetTokens: readonly Set<string>[]): number {
  if (!queryTokens.length) return 0;
  let sum = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const target of targetTokens) {
      best = Math.max(best, tokenHit(qt, target));
      if (best === 1) break;
    }
    sum += best;
  }
  return sum / queryTokens.length;
}

export type LexicalScore = { score: number; reason: MatchReason };

export function lexicalScore(
  query: string,
  queryTokens: readonly string[],
  record: BookmarkRecord,
): LexicalScore {
  const title = record.title.toLowerCase();
  const components: { score: number; reason: MatchReason }[] = [];

  const phrase = query.trim().toLowerCase();
  if (
    queryTokens.length >= MIN_PHRASE_TOKENS &&
    phrase.length >= MIN_PHRASE_LENGTH &&
    title.includes(phrase)
  ) {
    components.push({ score: PHRASE_SCORE, reason: MATCH_REASON.Title });
  }

  const titleTokens = new Set(tokenize(record.title));
  components.push({
    score: coverage(queryTokens, [titleTokens]) * TITLE_COVERAGE_SCORE,
    reason: MATCH_REASON.Title,
  });

  // Learned (cluster-discovered) topics count as tags too — they're the
  // user's own vocabulary, often exactly what they'll type.
  const tagTokens = new Set(
    [...record.tags, ...(record.learnedTags ?? [])].flatMap((t) => tokenize(t)),
  );
  components.push({
    score: coverage(queryTokens, [tagTokens]) * TAG_COVERAGE_SCORE,
    reason: MATCH_REASON.Tag,
  });

  const urlTokens = new Set(tokenize(record.canonicalUrl || record.url));
  components.push({
    score: coverage(queryTokens, [urlTokens]) * URL_COVERAGE_SCORE,
    reason: MATCH_REASON.Url,
  });

  const folderTokens = new Set(tokenize(record.folderPath));
  components.push({
    score: coverage(queryTokens, [folderTokens]) * FOLDER_COVERAGE_SCORE,
    reason: MATCH_REASON.Folder,
  });

  const descriptionTokens = new Set([
    ...tokenize(record.signals.metaDescription ?? ''),
    ...tokenize(record.signals.siteName ?? ''),
    ...(record.signals.headings ?? []).flatMap((h) => tokenize(h)),
  ]);
  components.push({
    score: coverage(queryTokens, [descriptionTokens]) * DESCRIPTION_COVERAGE_SCORE,
    reason: MATCH_REASON.Description,
  });

  let best: { score: number; reason: MatchReason } = { score: 0, reason: MATCH_REASON.Title };
  let hits = 0;
  for (const c of components) {
    if (c.score <= 0) continue;
    hits++;
    if (c.score > best.score) best = c;
  }
  const bonus = hits > 1 ? (hits - 1) * MULTI_COMPONENT_BONUS : 0;
  return { score: Math.min(1, best.score + bonus), reason: best.reason };
}

/** One entry of the semantic ranking: a record id and its raw cosine. */
export type SemanticNeighbor = { id: string; score: number };

/** Corpus-relative rank quality: 1 at rank 1, decaying like weighted RRF.
 * (k+1)/(k+rank) instead of 1/(k+rank) keeps the signal on a [0,1] scale so
 * channel weights stay comparable (research: Qdrant's scale warning). */
export function rankQuality(rank: number, sharpness: number): number {
  return (sharpness + 1) / (sharpness + rank);
}

/** Cosine magnitude normalized against THIS query's best cosine (per-query
 * max, not a fixed ceiling — Bruch et al.'s TM2C2 normalization). */
export function normalizeMagnitude(cosine: number, maxCosine: number, floor: number): number {
  const span = maxCosine - floor;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (cosine - floor) / span));
}

/** Sorted rank lookup (1-based, cosine descending) built defensively so callers
 * need not guarantee input order. Sub-ms at ≤5k entries. */
function semanticRanks(semantic: readonly SemanticNeighbor[]): Map<string, number> {
  const sorted = [...semantic].sort((a, b) => b.score - a.score);
  return new Map(sorted.map((entry, i) => [entry.id, i + 1]));
}

function toHit(record: BookmarkRecord, score: number, reason: MatchReason): ScoredHit {
  const description = record.signals.metaDescription ?? record.signals.excerpt;
  return {
    id: record.id,
    title: record.title,
    url: record.url,
    score,
    reason,
    // Taxonomy tags first, learned topics after — the card's chip cap trims
    // from the tail, so curated tags keep priority.
    tags: record.learnedTags?.length ? [...record.tags, ...record.learnedTags] : record.tags,
    folderPath: record.folderPath,
    dateAdded: record.dateAdded,
    ...(description ? { description: description.slice(0, SNIPPET_MAX_CHARS) } : {}),
    ...(record.fetchStatus === FETCH_STATUS.Dead ? { dead: true } : {}),
  };
}

export type BrowseSort = 'recent' | 'name';

/** Folder-path separator as ingest writes it ("Other bookmarks / Work"). */
const FOLDER_SEP = ' / ';

/** Browse-at-rest: the whole library as hits — no query, no scoring. Reason
 * Title renders chip-less and score 0 is honest ("listed, not ranked"). */
export function browseResults(args: {
  records: readonly BookmarkRecord[];
  sort: BrowseSort;
  /** Full folderPath — scopes to that folder AND its subtree. */
  folder?: string;
  /** recordId → last time the user OPENED it through the extension. "Recent"
   * is a unified activity timeline: the later of added and last opened —
   * opening a bookmark bumps it to the top, exactly like a recents list. */
  lastOpened?: ReadonlyMap<string, number>;
}): ScoredHit[] {
  const { records, sort, folder, lastOpened } = args;
  const scoped = folder
    ? records.filter((r) => r.folderPath === folder || r.folderPath.startsWith(folder + FOLDER_SEP))
    : [...records];
  const activity = (r: BookmarkRecord): number => Math.max(r.dateAdded, lastOpened?.get(r.id) ?? 0);
  scoped.sort(
    sort === 'name'
      ? (a, b) => a.title.localeCompare(b.title) || b.dateAdded - a.dateAdded
      : (a, b) => activity(b) - activity(a) || a.title.localeCompare(b.title),
  );
  return scoped.map((record) => toHit(record, 0, MATCH_REASON.Title));
}

/** Unique folder paths for the browse filter, alphabetical. */
export function folderPaths(records: readonly BookmarkRecord[]): string[] {
  return [...new Set(records.map((r) => r.folderPath).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function rankResults(args: {
  query: string;
  records: readonly BookmarkRecord[];
  /** Full semantic ranking — every embedded record with its raw cosine (may be empty). */
  semantic: readonly SemanticNeighbor[];
  weights?: RankWeights;
  limit?: number;
}): ScoredHit[] {
  const { query, records, semantic } = args;
  const weights = args.weights ?? DEFAULT_WEIGHTS;
  const limit = args.limit ?? SEARCH_LIMIT;

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const cosineById = new Map(semantic.map((entry) => [entry.id, entry.score]));
  const rankById = semanticRanks(semantic);
  const maxCosine = semantic.length ? Math.max(...semantic.map((entry) => entry.score)) : 0;

  const hits: ScoredHit[] = [];
  for (const record of records) {
    const lex = lexicalScore(query, queryTokens, record);
    const rank = rankById.get(record.id);
    const cosine = cosineById.get(record.id) ?? 0;
    // The absolute floor gates the WHOLE semantic channel: being "rank 1 of the
    // corpus" for a query nothing actually matches must not manufacture relevance.
    const sem =
      rank === undefined || cosine <= weights.semanticFloor
        ? 0
        : weights.rankBlend * rankQuality(rank, weights.rankSharpness) +
          (1 - weights.rankBlend) * normalizeMagnitude(cosine, maxCosine, weights.semanticFloor);
    const score = weights.lexical * lex.score + weights.semantic * sem;
    if (score < MIN_RESULT_SCORE) continue;

    const reason: MatchReason =
      lex.score >= LEXICAL_REASON_THRESHOLD && weights.lexical * lex.score >= weights.semantic * sem
        ? lex.reason
        : MATCH_REASON.Semantic;

    hits.push(toHit(record, score, reason));
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}
