import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  lexicalScore,
  normalizeMagnitude,
  browseResults,
  folderPaths,
  rankQuality,
  rankResults,
  tokenize,
} from './search';
import { FETCH_STATUS, MATCH_REASON, type BookmarkRecord } from './types';

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
    compositeText: '',
    contentHash: '',
    tags: [],
    modelVersion: null,
    updatedAt: 0,
    ...overrides,
  };
}

describe('tokenize', () => {
  it('lowercases, splits on non-alphanumerics, dedupes, drops single chars', () => {
    expect(tokenize('GitHub — the/GitHub place! a')).toEqual(['github', 'the', 'place']);
  });
});

describe('lexicalScore', () => {
  it('scores a full phrase match in title at 1', () => {
    const r = rec('1', { title: 'AI Chat playground' });
    const { score, reason } = lexicalScore('ai chat', tokenize('ai chat'), r);
    expect(score).toBeGreaterThanOrEqual(1);
    expect(reason).toBe(MATCH_REASON.Title);
  });

  it('scores prefix token hits ("git" matches "github")', () => {
    const r = rec('1', { title: 'GitHub repos' });
    const { score } = lexicalScore('git', tokenize('git'), r);
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(1);
  });

  it('uses tag reason when tags are the dominant evidence', () => {
    const r = rec('1', { title: 'Untitled', tags: ['ai-chat'] });
    const { reason } = lexicalScore('chat', tokenize('chat'), r);
    expect(reason).toBe(MATCH_REASON.Tag);
  });

  it('scores url tokens when title has no hits', () => {
    const r = rec('1', { title: 'Untitled', canonicalUrl: 'https://cursor.sh/features' });
    const { score, reason } = lexicalScore('cursor', tokenize('cursor'), r);
    expect(score).toBeGreaterThan(0.4);
    expect(reason).toBe(MATCH_REASON.Url);
  });

  it('gives folder matches the folder reason', () => {
    const r = rec('1', { title: 'Untitled', folderPath: 'Bookmarks bar / Recipes' });
    const { reason } = lexicalScore('recipes', tokenize('recipes'), r);
    expect(reason).toBe(MATCH_REASON.Folder);
  });

  it('scores crawled description/headings when no other field matches', () => {
    // merchants.to shape: marketing title, but the meta description names the topic.
    const r = rec('1', {
      title: 'Find The Best Deals On The Market',
      signals: {
        metaDescription: 'Compare prices and reviews in the Runescape gold market.',
        headings: ['Why use us?'],
      },
    });
    const { score, reason } = lexicalScore('gold prices', tokenize('gold prices'), r);
    expect(score).toBeGreaterThan(0.3);
    expect(reason).toBe(MATCH_REASON.Description);
  });

  it('keeps description evidence weaker than a title hit for the same query', () => {
    const titleHit = lexicalScore(
      'gold prices',
      tokenize('gold prices'),
      rec('1', { title: 'Gold prices today' }),
    );
    const descriptionHit = lexicalScore(
      'gold prices',
      tokenize('gold prices'),
      rec('2', { title: 'Untitled', signals: { metaDescription: 'Gold prices today' } }),
    );
    expect(descriptionHit.score).toBeGreaterThan(0);
    expect(descriptionHit.score).toBeLessThan(titleHit.score);
  });

  it('ignores the body excerpt for lexical scoring', () => {
    const r = rec('1', {
      title: 'Untitled',
      signals: { excerpt: 'gold prices appear only in the body text' },
    });
    const { score } = lexicalScore('gold prices', tokenize('gold prices'), r);
    expect(score).toBe(0);
  });
});

describe('rankQuality', () => {
  it('gives rank 1 the full signal and decays with rank', () => {
    expect(rankQuality(1, 15)).toBe(1);
    expect(rankQuality(3, 15)).toBeCloseTo(16 / 18, 5);
    expect(rankQuality(300, 15)).toBeLessThan(0.06);
  });

  it('sharpens the top-rank advantage as k shrinks', () => {
    const dropAtSmallK = rankQuality(1, 5) - rankQuality(10, 5);
    const dropAtLargeK = rankQuality(1, 60) - rankQuality(10, 60);
    expect(dropAtSmallK).toBeGreaterThan(dropAtLargeK);
  });
});

describe('normalizeMagnitude', () => {
  it('normalizes against the per-query max, clamped to [0,1]', () => {
    expect(normalizeMagnitude(0.7, 0.7, 0.5)).toBe(1); // this query's best
    expect(normalizeMagnitude(0.6, 0.7, 0.5)).toBeCloseTo(0.5, 5);
    expect(normalizeMagnitude(0.4, 0.7, 0.5)).toBe(0); // below floor
  });

  it('returns 0 when the whole distribution sits at/below the floor', () => {
    expect(normalizeMagnitude(0.45, 0.45, 0.5)).toBe(0);
  });
});

describe('rankResults', () => {
  it('returns [] for an empty or sub-token query', () => {
    expect(rankResults({ query: '', records: [rec('1')], semantic: [] })).toEqual([]);
    expect(rankResults({ query: 'a', records: [rec('1')], semantic: [] })).toEqual([]);
  });

  it('ranks exact-title matches above pure-semantic matches', () => {
    const records = [
      rec('semanticOnly', { title: 'Unrelated words entirely' }),
      rec('titleHit', { title: 'AI chat tools' }),
    ];
    const semantic = [{ id: 'semanticOnly', score: 0.9 }];
    const hits = rankResults({ query: 'ai chat', records, semantic });
    expect(hits[0]?.id).toBe('titleHit');
    expect(hits[1]?.id).toBe('semanticOnly');
    expect(hits[1]?.reason).toBe(MATCH_REASON.Semantic);
  });

  it('surfaces semantic-only hits that lexical would miss', () => {
    const records = [rec('warmr', { title: 'Warmr Documentation — warm up social posting' })];
    const semantic = [{ id: 'warmr', score: 0.82 }];
    const hits = rankResults({ query: 'warmup iphone ai', records, semantic });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe('warmr');
  });

  it('lifts a top-semantic-rank doc above bare single-token title matches', () => {
    // The merchants.to regression: marketing title, topic named only in the meta
    // description, semantic rank 3 — must beat docs whose only evidence is one
    // literal token in the title.
    const records = [
      rec('merchants', {
        title: 'Find The Best Deals On The Market',
        signals: {
          metaDescription:
            'Compare prices, reviews and payment methods in the Runescape gold market.',
        },
      }),
      ...Array.from({ length: 12 }, (_, i) => rec(`seller${i}`, { title: `Buy cheap gold ${i}` })),
    ];
    const semantic = [
      { id: 'seller0', score: 0.7 },
      { id: 'seller1', score: 0.69 },
      { id: 'merchants', score: 0.674 },
      { id: 'seller2', score: 0.66 },
    ];
    const hits = rankResults({ query: 'gold prices', records, semantic });
    const merchantsRank = hits.findIndex((h) => h.id === 'merchants');
    // Docs that beat it on BOTH channels (title hit + higher semantic rank) may
    // stay ahead; every bare title-token doc with no semantic evidence must not.
    expect(merchantsRank).toBeGreaterThanOrEqual(0);
    expect(merchantsRank).toBeLessThan(4);
    for (const [i, hit] of hits.entries()) {
      if (/^seller([3-9]|1[01])$/.test(hit.id)) expect(i).toBeGreaterThan(merchantsRank);
    }
  });

  it('gives no semantic credit when every cosine sits at/below the floor', () => {
    // "Best of the corpus" for a nonsense query is still irrelevant — rank alone
    // must not manufacture relevance.
    const records = [rec('noise', { title: 'Unrelated words entirely' })];
    const semantic = [{ id: 'noise', score: DEFAULT_WEIGHTS.semanticFloor }];
    expect(rankResults({ query: 'xyzzy plugh', records, semantic })).toEqual([]);
  });
});

describe('browseResults', () => {
  const library = [
    rec('old', { title: 'Alpha guide', dateAdded: 100 }),
    rec('new', { title: 'Zulu notes', dateAdded: 300 }),
    rec('mid', { title: 'Mango recipes', dateAdded: 200, folderPath: 'Bookmarks bar / Work' }),
    rec('deep', {
      title: 'Deep doc',
      dateAdded: 250,
      folderPath: 'Bookmarks bar / Work / Q3',
    }),
    rec('decoy', {
      title: 'Decoy',
      dateAdded: 150,
      // Name-prefix sibling: "Work" scope must NOT include "Workspace".
      folderPath: 'Bookmarks bar / Workspace',
    }),
  ];

  it('sorts newest-first by default', () => {
    const ids = browseResults({ records: library, sort: 'recent' }).map((h) => h.id);
    expect(ids).toEqual(['new', 'deep', 'mid', 'decoy', 'old']);
  });

  it('Recent is an activity timeline: opening an old bookmark bumps it to the top', () => {
    const lastOpened = new Map([
      ['old', 500], // opened after everything else was added — tops the list
      ['mid', 120], // opened before it was even re-added — the later dateAdded wins
    ]);
    const ids = browseResults({ records: library, sort: 'recent', lastOpened }).map((h) => h.id);
    expect(ids).toEqual(['old', 'new', 'deep', 'mid', 'decoy']);
  });

  it('name sort ignores activity (alphabetical is alphabetical)', () => {
    const lastOpened = new Map([['new', 999]]);
    const ids = browseResults({ records: library, sort: 'name', lastOpened }).map((h) => h.id);
    expect(ids).toEqual(['old', 'decoy', 'deep', 'mid', 'new']);
  });

  it('sorts by title when asked', () => {
    const ids = browseResults({ records: library, sort: 'name' }).map((h) => h.id);
    expect(ids).toEqual(['old', 'decoy', 'deep', 'mid', 'new']);
  });

  it('scopes a folder to itself and its subtree — never name-prefix siblings', () => {
    const ids = browseResults({
      records: library,
      sort: 'recent',
      folder: 'Bookmarks bar / Work',
    }).map((h) => h.id);
    expect(ids).toEqual(['deep', 'mid']);
  });

  it('marks dead-fetch records so the UI can show the quiet indicator', () => {
    const hits = browseResults({
      records: [
        rec('gone', { fetchStatus: FETCH_STATUS.Dead, dateAdded: 2 }),
        rec('fine', { dateAdded: 1 }),
      ],
      sort: 'recent',
    });
    expect(hits[0]?.dead).toBe(true);
    expect(hits[1]?.dead).toBeUndefined();
  });

  it('produces chip-less unranked hits with the row snippet fields intact', () => {
    const [hit] = browseResults({
      records: [rec('x', { signals: { metaDescription: 'A page about things.' } })],
      sort: 'recent',
    });
    expect(hit?.reason).toBe(MATCH_REASON.Title);
    expect(hit?.score).toBe(0);
    expect(hit?.description).toBe('A page about things.');
  });
});

describe('folderPaths', () => {
  it('dedupes and sorts, dropping empty paths', () => {
    const records = [
      rec('1', { folderPath: 'Other bookmarks' }),
      rec('2', { folderPath: 'Bookmarks bar' }),
      rec('3', { folderPath: 'Bookmarks bar' }),
      rec('4', { folderPath: '' }),
    ];
    expect(folderPaths(records)).toEqual(['Bookmarks bar', 'Other bookmarks']);
  });

  it('drops records below the minimum score', () => {
    const hits = rankResults({
      query: 'zzz qqq',
      records: [rec('1', { title: 'Nothing relevant' })],
      semantic: [],
    });
    expect(hits).toEqual([]);
  });

  it('respects the limit and sorts by score', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      rec(String(i), { title: `github item ${i}` }),
    );
    const hits = rankResults({ query: 'github', records, semantic: [], limit: 5 });
    expect(hits).toHaveLength(5);
    const scores = hits.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
