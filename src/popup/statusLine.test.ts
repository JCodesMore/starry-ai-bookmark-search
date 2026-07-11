import { describe, expect, it } from 'vitest';
import { describeCount, describeProgress } from './statusLine';
import { INDEX_PHASE, type IndexProgress } from '../core/types';

const progress = (overrides: Partial<IndexProgress>): IndexProgress => ({
  phase: INDEX_PHASE.Idle,
  processed: 0,
  total: 0,
  failed: 0,
  startedAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('describeProgress', () => {
  it('names each working phase and stays silent on terminal ones', () => {
    expect(describeProgress(progress({ phase: INDEX_PHASE.Ingesting }))).toBe(
      'Reading your library…',
    );
    expect(describeProgress(progress({ phase: INDEX_PHASE.Tagging }))).toBe(
      'Tagging what I learned…',
    );
    expect(describeProgress(progress({ phase: INDEX_PHASE.Done }))).toBe('');
    expect(describeProgress(progress({ phase: INDEX_PHASE.Idle }))).toBe('');
  });

  it('shows embedding as a percentage, never a raw N/M', () => {
    const line = describeProgress(
      progress({ phase: INDEX_PHASE.Embedding, processed: 50, total: 200 }),
    );
    expect(line).toBe('Learning your bookmarks… 25%');
  });
});

describe('describeCount', () => {
  const base = { query: '', shown: 0, total: 1347, scopedToFolder: false, atLimit: false };

  it('shows the library size at rest', () => {
    expect(describeCount({ ...base, shown: 1347 })).toBe('1,347 bookmarks');
  });

  it('shows the scope while folder-filtered', () => {
    expect(describeCount({ ...base, shown: 212, scopedToFolder: true })).toBe('212 of 1,347');
  });

  it('counts results while searching, with singular handled', () => {
    expect(describeCount({ ...base, query: 'ai', shown: 23 })).toBe('23 results');
    expect(describeCount({ ...base, query: 'ai', shown: 1 })).toBe('1 result');
  });

  it('says "Top N" at the search cap instead of a false total', () => {
    expect(describeCount({ ...base, query: 'ai', shown: 150, atLimit: true })).toBe(
      'Top 150 results',
    );
  });

  it('goes quiet on zero matches (the empty-state line explains) and pre-index', () => {
    expect(describeCount({ ...base, query: 'zzz', shown: 0 })).toBe('');
    expect(describeCount({ ...base, total: 0 })).toBe('');
  });
});
