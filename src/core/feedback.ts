// Personalized re-ranking from the user's own result clicks (decision 008).
// Modeled on Chrome's omnibox shortcuts + Firefox frecency: exponential recency
// decay, log-saturated counts, position-debiased (deep clicks are deliberate
// choices), gated by query similarity. Pure functions — storage lives in
// storage.ts, wiring in background.ts.
//
// Safety-by-construction: the boost is MULTIPLICATIVE and CAPPED, and applies
// only to already-retrieved hits — a record with no base relevance stays at
// ~zero and can never be resurrected by clicks, which also breaks the
// rich-get-richer feedback loop.
import type { ClickRow, ScoredHit } from './types';
import { tokenize } from '../lib/text';

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 30;
/** Recency half-life: a click loses half its weight every 30 days (Firefox NewFrecency). */
const HALF_LIFE_MS = HALF_LIFE_DAYS * DAY_MS;
const DECAY_BASE = 0.5;
/** Token-overlap (Jaccard) below this means a different intent — no boost at all. */
const MIN_PARTIAL_SIMILARITY = 0.5;
/** Clicks at ranks 1..N carry no position bonus; deeper clicks earn one. */
const POSITION_NEUTRAL_RANKS = 3;
/** Extra weight per rank below the neutral zone (cascade model: user rejected everything above). */
const POSITION_WEIGHT_SLOPE = 0.05;
const POSITION_WEIGHT_MAX = 1.5;
/** Saturation ceiling for one record's accumulated click signal (≈ ln(1 + 2 strong clicks)). */
const SIGNAL_CAP = 1.1;
/** Boost strength β: max multiplier = 1 + β·SIGNAL_CAP ≈ 1.28 — reorders, never dominates. */
const BOOST_STRENGTH = 0.25;

/** Canonical query form: token-sorted, so "prices gold" ≡ "gold prices". */
export function normalizeQuery(query: string): string {
  return tokenize(query).sort().join(' ');
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let intersection = 0;
  for (const token of new Set(a)) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/** 1 for the same normalized query, partial Jaccard above the gate, else 0. */
export function querySimilarity(
  queryNorm: string,
  queryTokens: readonly string[],
  click: Pick<ClickRow, 'queryNorm' | 'queryTokens'>,
): number {
  if (click.queryNorm === queryNorm) return 1;
  const overlap = jaccard(queryTokens, click.queryTokens);
  return overlap >= MIN_PARTIAL_SIMILARITY ? overlap : 0;
}

/** Deeper clicks are stronger evidence — the user rejected everything above. */
export function positionWeight(rank: number): number {
  if (rank <= POSITION_NEUTRAL_RANKS) return 1;
  return Math.min(POSITION_WEIGHT_MAX, 1 + (rank - POSITION_NEUTRAL_RANKS) * POSITION_WEIGHT_SLOPE);
}

export function recencyDecay(ageMs: number): number {
  if (ageMs <= 0) return 1;
  return DECAY_BASE ** (ageMs / HALF_LIFE_MS);
}

/**
 * Aggregates SAT clicks into a per-record signal for this query:
 * `min(ln(1 + Σ sim·pos·decay), cap)`. Bounced (sat=false) clicks teach nothing.
 */
export function clickSignals(
  query: string,
  clicks: readonly ClickRow[],
  now: number,
): Map<string, number> {
  const queryNorm = normalizeQuery(query);
  const queryTokens = tokenize(query);
  if (!queryNorm) return new Map();

  const raw = new Map<string, number>();
  for (const click of clicks) {
    if (!click.sat) continue;
    const similarity = querySimilarity(queryNorm, queryTokens, click);
    if (similarity === 0) continue;
    const weight = similarity * positionWeight(click.rank) * recencyDecay(now - click.ts);
    raw.set(click.recordId, (raw.get(click.recordId) ?? 0) + weight);
  }

  const signals = new Map<string, number>();
  for (const [recordId, sum] of raw) {
    signals.set(recordId, Math.min(Math.log(1 + sum), SIGNAL_CAP));
  }
  return signals;
}

/**
 * Re-orders already-retrieved hits by a capped multiplicative boost. Returns a
 * new array; scores are updated so downstream consumers see the final ordering
 * basis. Hits without a signal keep their base score exactly.
 */
export function applyClickBoost(
  hits: readonly ScoredHit[],
  signals: ReadonlyMap<string, number>,
): ScoredHit[] {
  if (!signals.size) return [...hits];
  const boosted = hits.map((hit) => {
    const signal = signals.get(hit.id);
    if (signal === undefined) return hit;
    return { ...hit, score: hit.score * (1 + BOOST_STRENGTH * signal) };
  });
  boosted.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return boosted;
}
