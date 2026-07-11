import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as storage from './storage';
import {
  applyZeroShotTags,
  buildTagText,
  ensureTaxonomyVectors,
  taggerVersion,
  zeroShotTags,
} from './tagger';
import { TAXONOMY } from './taxonomy';
import { EMBEDDING_DIM } from './embedder/provider';
import { FETCH_STATUS, type BookmarkRecord } from './types';
import type { EmbeddingProvider } from './embedder/provider';

function unitVector(hotIndex: number, dim = EMBEDDING_DIM): Float32Array {
  const v = new Float32Array(dim);
  v[hotIndex] = 1;
  return v;
}

const AXIS_MARKER = /axis(\d+)/;

function fakeProvider(): EmbeddingProvider & { calls: number } {
  const state = {
    modelVersion: 'fake@1',
    dim: EMBEDDING_DIM,
    calls: 0,
    warmUp: async () => undefined,
    // Texts containing "axisN" embed to axis N; otherwise the i-th text of the
    // batch embeds to axis i (so taxonomy description i → axis i, as before).
    embedDocuments: async (texts: string[]) => {
      state.calls++;
      return texts.map((text, i) => {
        const marker = AXIS_MARKER.exec(text);
        return unitVector(marker ? Number(marker[1]) : i);
      });
    },
    embedQuery: async () => unitVector(0),
  };
  return state;
}

function rec(id: string, overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: `Example ${id}`,
    folderPath: 'Bookmarks bar',
    dateAdded: 0,
    fetchStatus: FETCH_STATUS.Baseline,
    signals: {},
    compositeText: 'text',
    contentHash: 'h',
    tags: [],
    modelVersion: 'fake@1',
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

describe('buildTagText', () => {
  it('classifies from title + description + site name, never the excerpt', () => {
    const text = buildTagText(
      rec('1', {
        title: 'Merchants.to',
        signals: {
          metaDescription: 'Runescape gold market comparison.',
          siteName: 'Merchants',
          excerpt: 'Our mission is empowering stakeholders worldwide…',
        },
      }),
    );
    expect(text).toBe('Merchants.to\nRunescape gold market comparison.\nMerchants');
    expect(text).not.toContain('stakeholders');
  });

  it('falls back to composite text when no focused fields exist', () => {
    const text = buildTagText(rec('1', { title: '  ', signals: {}, compositeText: 'baseline' }));
    expect(text).toBe('baseline');
  });
});

describe('ensureTaxonomyVectors', () => {
  it('embeds taxonomy once and caches per model version', async () => {
    const provider = fakeProvider();
    const first = await ensureTaxonomyVectors(provider);
    const second = await ensureTaxonomyVectors(provider);
    expect(first.ids).toEqual(TAXONOMY.map((t) => t.id));
    expect(second.ids).toEqual(first.ids);
    expect(provider.calls).toBe(1);
  });
});

describe('zeroShotTags', () => {
  it('returns tags above threshold ranked by score, capped at topK', () => {
    const taxonomy = {
      ids: ['a', 'b', 'c'],
      vectors: [Array.from(unitVector(0)), Array.from(unitVector(1)), Array.from(unitVector(2))],
    };
    // Query vector leans mostly on axis 1, a bit on axis 0, none on 2.
    const v = new Float32Array(EMBEDDING_DIM);
    v[0] = 0.6;
    v[1] = 0.8;
    expect(zeroShotTags(v, taxonomy, 0.5, 2)).toEqual(['b', 'a']);
    expect(zeroShotTags(v, taxonomy, 0.7, 2)).toEqual(['b']);
  });

  it('skips dimension-mismatched tag vectors instead of throwing', () => {
    const taxonomy = { ids: ['bad'], vectors: [[1, 0]] };
    expect(zeroShotTags(unitVector(0), taxonomy)).toEqual([]);
  });
});

describe('applyZeroShotTags', () => {
  it('replaces stale tags wholesale: fresh heuristics + fresh zero-shot', async () => {
    const provider = fakeProvider();
    await storage.putRecords([
      // Stale wrong zero-shot tag from a previous scheme + a heuristic-known domain.
      rec('r1', {
        canonicalUrl: 'https://github.com/someone/repo',
        title: 'axis1 project',
        tags: ['automotive'],
      }),
    ]);

    const updated = await applyZeroShotTags(provider);
    expect(updated).toBe(1);

    const r1 = await storage.getRecord('r1');
    expect(r1?.tags).toContain('dev-repos'); // heuristic, recomputed
    expect(r1?.tags).toContain(TAXONOMY[1]?.id); // zero-shot from the tag text
    expect(r1?.tags).not.toContain('automotive'); // stale tag is gone
    expect(r1?.tagModelVersion).toBe(taggerVersion(provider));
  });

  it('skips records already stamped with the current tagger version', async () => {
    const provider = fakeProvider();
    await storage.putRecords([rec('r1', { title: 'axis0 thing' })]);

    expect(await applyZeroShotTags(provider)).toBe(1);
    const callsAfterFirst = provider.calls;
    expect(await applyZeroShotTags(provider)).toBe(0);
    expect(provider.calls).toBe(callsAfterFirst); // no re-embedding on the second pass
  });

  it('skips records that yield no tag text at all', async () => {
    const provider = fakeProvider();
    await storage.putRecords([rec('empty', { title: '', signals: {}, compositeText: '' })]);
    expect(await applyZeroShotTags(provider)).toBe(0);
    const empty = await storage.getRecord('empty');
    expect(empty?.tagModelVersion).toBeUndefined();
  });
});
