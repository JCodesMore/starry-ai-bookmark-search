// Message-boundary sanitizers: payloads arriving over chrome.runtime messaging
// are untrusted — coerce them to well-formed shapes here so everything inward
// of the service worker's message switch can trust its inputs (messages.ts).
import { DEFAULT_WEIGHTS, type RankWeights } from '../core/search';
import type { Prefs } from '../core/prefs';

// Sanity bounds for message-supplied weight overrides (dev/tuning seam) —
// out-of-range or non-finite values fall back to the shipped defaults.
const MAX_RANK_SHARPNESS = 200;
const WEIGHT_BOUNDS: Record<keyof RankWeights, readonly [number, number]> = {
  lexical: [0, 1],
  semantic: [0, 1],
  semanticFloor: [0, 1],
  rankSharpness: [1, MAX_RANK_SHARPNESS],
  rankBlend: [0, 1],
};

export function sanitizeWeights(override?: Partial<RankWeights>): RankWeights {
  const weights = { ...DEFAULT_WEIGHTS };
  if (!override) return weights;
  for (const key of Object.keys(WEIGHT_BOUNDS) as (keyof RankWeights)[]) {
    const value = override[key];
    const [min, max] = WEIGHT_BOUNDS[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) {
      weights[key] = value;
    }
  }
  return weights;
}

/** Coerce a message payload to a well-formed Prefs shape. */
export function sanitizePrefs(raw: Prefs): Prefs {
  return {
    crawlEnabled: raw.crawlEnabled !== false,
    excludedFolderIds: Array.isArray(raw.excludedFolderIds)
      ? raw.excludedFolderIds.filter((id) => typeof id === 'string')
      : [],
  };
}
