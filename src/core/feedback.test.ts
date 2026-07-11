import { describe, expect, it } from 'vitest';
import {
  applyClickBoost,
  clickSignals,
  normalizeQuery,
  positionWeight,
  querySimilarity,
  recencyDecay,
} from './feedback';
import { MATCH_REASON, type ClickRow, type ScoredHit } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function click(overrides: Partial<ClickRow> = {}): ClickRow {
  return {
    queryNorm: 'gold prices',
    queryTokens: ['gold', 'prices'],
    recordId: 'merchants',
    ts: NOW,
    rank: 5,
    sat: true,
    ...overrides,
  };
}

function hit(id: string, score: number): ScoredHit {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    score,
    reason: MATCH_REASON.Semantic,
    tags: [],
    folderPath: 'Bookmarks bar',
    dateAdded: NOW,
  };
}

describe('normalizeQuery', () => {
  it('is word-order and case insensitive', () => {
    expect(normalizeQuery('Gold Prices')).toBe(normalizeQuery('prices gold'));
  });
});

describe('querySimilarity', () => {
  it('gives exact normalized matches the full signal', () => {
    expect(querySimilarity('gold prices', ['gold', 'prices'], click())).toBe(1);
  });

  it('scales partial overlap by Jaccard and gates dissimilar queries to 0', () => {
    const c = click({ queryNorm: 'gold osrs prices', queryTokens: ['gold', 'osrs', 'prices'] });
    expect(querySimilarity('gold prices', ['gold', 'prices'], c)).toBeCloseTo(2 / 3, 5);
    const other = click({ queryNorm: 'react hooks', queryTokens: ['react', 'hooks'] });
    expect(querySimilarity('gold prices', ['gold', 'prices'], other)).toBe(0);
  });
});

describe('positionWeight', () => {
  it('is neutral for top ranks and grows (capped) for deeper clicks', () => {
    expect(positionWeight(1)).toBe(1);
    expect(positionWeight(3)).toBe(1);
    expect(positionWeight(13)).toBeCloseTo(1.5, 5);
    expect(positionWeight(50)).toBe(1.5);
  });
});

describe('recencyDecay', () => {
  it('halves every 30 days', () => {
    expect(recencyDecay(0)).toBe(1);
    expect(recencyDecay(30 * DAY_MS)).toBeCloseTo(0.5, 5);
    expect(recencyDecay(60 * DAY_MS)).toBeCloseTo(0.25, 5);
  });
});

describe('clickSignals', () => {
  it('ignores bounced (sat=false) clicks entirely', () => {
    const signals = clickSignals('gold prices', [click({ sat: false })], NOW);
    expect(signals.size).toBe(0);
  });

  it('accumulates repeated clicks with log saturation and a hard cap', () => {
    const one = clickSignals('gold prices', [click()], NOW).get('merchants') ?? 0;
    const many = clickSignals(
      'gold prices',
      Array.from({ length: 50 }, () => click()),
      NOW,
    ).get('merchants');
    expect(one).toBeGreaterThan(0);
    expect(many).toBe(1.1); // SIGNAL_CAP — 50 clicks cannot exceed it
  });

  it('weights old clicks down and lets a newer choice for the same query win', () => {
    const clicks = [
      click({ recordId: 'old-favorite', ts: NOW - 90 * DAY_MS }),
      click({ recordId: 'new-favorite', ts: NOW - 1 * DAY_MS }),
    ];
    const signals = clickSignals('gold prices', clicks, NOW);
    expect(signals.get('new-favorite') ?? 0).toBeGreaterThan(signals.get('old-favorite') ?? 0);
  });
});

describe('applyClickBoost', () => {
  it('lifts a repeatedly-chosen mid-list hit above unclicked ones', () => {
    const hits = [hit('a', 0.6), hit('b', 0.55), hit('merchants', 0.5)];
    const signals = clickSignals('gold prices', [click(), click(), click()], NOW);
    const boosted = applyClickBoost(hits, signals);
    expect(boosted[0]?.id).toBe('merchants');
  });

  it('cannot lift a hit past the boost cap (no domination)', () => {
    // Max multiplier is 1 + 0.25·1.1 = 1.275: a strong base lead must survive.
    const hits = [hit('strong', 0.8), hit('merchants', 0.5)];
    const signals = clickSignals(
      'gold prices',
      Array.from({ length: 50 }, () => click()),
      NOW,
    );
    const boosted = applyClickBoost(hits, signals);
    expect(boosted[0]?.id).toBe('strong');
    expect(boosted[1]?.score).toBeLessThanOrEqual(0.5 * 1.275 + 1e-9);
  });

  it('never touches hits without a signal and never adds hits', () => {
    const hits = [hit('a', 0.6), hit('b', 0.55)];
    const boosted = applyClickBoost(hits, clickSignals('gold prices', [click()], NOW));
    expect(boosted).toHaveLength(2);
    expect(boosted.find((h) => h.id === 'a')?.score).toBe(0.6);
  });
});
