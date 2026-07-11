import { describe, expect, it } from 'vitest';
import {
  chooseK,
  labelClusters,
  mulberry32,
  needsTopicsRebuild,
  sphericalKMeans,
  topicDocTokens,
} from './topics';
import { normalize } from './vectors';

/** Packs unit vectors around three well-separated directions in R^8: a tight
 * synthetic corpus where the right 3-clustering is unambiguous. */
function syntheticCorpus(perCluster: number): { data: Float32Array; n: number; dim: number } {
  const dim = 8;
  const anchors = [
    [1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0],
  ];
  const rand = mulberry32(7);
  const n = anchors.length * perCluster;
  const data = new Float32Array(n * dim);
  let row = 0;
  for (const anchor of anchors) {
    for (let i = 0; i < perCluster; i++) {
      const v = Float32Array.from(anchor, (x) => x + (rand() - 0.5) * 0.2);
      normalize(v);
      data.set(v, row * dim);
      row++;
    }
  }
  return { data, n, dim };
}

describe('sphericalKMeans', () => {
  it('recovers well-separated clusters and is deterministic', async () => {
    const { data, n, dim } = syntheticCorpus(12);
    const a = await sphericalKMeans(data, n, dim, 3);
    const b = await sphericalKMeans(data, n, dim, 3);
    expect([...a.assignments]).toEqual([...b.assignments]);
    // Every synthetic group must land in ONE cluster (labels may permute).
    for (let g = 0; g < 3; g++) {
      const slice = [...a.assignments.slice(g * 12, (g + 1) * 12)];
      expect(new Set(slice).size).toBe(1);
    }
    // And the three groups must land in DIFFERENT clusters.
    expect(new Set([a.assignments[0], a.assignments[12], a.assignments[24]]).size).toBe(3);
  });
});

describe('chooseK', () => {
  it('scales with corpus size inside sane bounds', () => {
    expect(chooseK(50)).toBe(6); // clamped low
    expect(chooseK(1347)).toBe(26); // sqrt(n/2)
    expect(chooseK(10_000)).toBe(30); // clamped high
  });
});

describe('labelClusters', () => {
  it('names clusters by their distinctive terms, not corpus-wide ones', () => {
    // "software" appears everywhere → distinctive terms must win.
    const gaming = [
      ['runescape', 'botting', 'software'],
      ['runescape', 'gold', 'software'],
      ['botting', 'runescape', 'scripts'],
    ];
    const cooking = [
      ['recipes', 'pasta', 'software'],
      ['recipes', 'baking', 'software'],
      ['pasta', 'recipes', 'dinner'],
    ];
    const { labels } = labelClusters([gaming, cooking]);
    expect(labels[0]).toContain('runescape');
    expect(labels[0]).not.toContain('software');
    expect(labels[1]).toContain('recipes');
    expect(labels[1]).not.toContain('software');
  });

  it('collapses near-duplicate terms and requires multi-doc support', () => {
    const docs = [
      ['proxy', 'proxies', 'residential'],
      ['proxy', 'residential', 'datacenter'],
      ['proxies', 'residential', 'unique1'], // 'unique1' in one doc — never a label
    ];
    const { labels } = labelClusters([docs]);
    expect(labels[0]).toBeTruthy();
    // 'proxy' and 'proxies' share a 4-char prefix — only one may appear.
    const words = (labels[0] as string).split(' ');
    expect(words.filter((w) => w.startsWith('prox')).length).toBe(1);
    expect(labels[0]).not.toContain('unique1');
  });

  it('returns null when no honest label exists', () => {
    const { labels } = labelClusters([[['the', 'and']], [[]]]);
    expect(labels).toEqual([null, null]);
  });

  it('never emits the same label for two clusters', () => {
    const same = [
      ['alpha', 'beta', 'gamma'],
      ['alpha', 'beta', 'delta'],
    ];
    const { labels } = labelClusters([same, same]);
    const named = labels.filter(Boolean);
    expect(new Set(named).size).toBe(named.length);
  });
});

describe('topicDocTokens', () => {
  it('uses title + site name + description, filtered of noise', () => {
    const tokens = topicDocTokens({
      title: 'The Best RuneScape Botting Guide 2024',
      signals: { siteName: 'DreamBot', metaDescription: 'Scripts and automation for OSRS' },
    });
    expect(tokens).toContain('runescape');
    expect(tokens).toContain('botting');
    expect(tokens).toContain('dreambot');
    expect(tokens).not.toContain('the'); // stopword
    expect(tokens).not.toContain('best'); // web-noise stopword
    expect(tokens).not.toContain('2024'); // pure number
  });
});

describe('needsTopicsRebuild', () => {
  const meta = { stamp: 'v1#model-a', embeddedCount: 1000, enrichedCount: 800 };
  it('rebuilds on missing meta or stamp change', () => {
    expect(needsTopicsRebuild(undefined, 'v1#model-a', 1000, 800)).toBe(true);
    expect(needsTopicsRebuild(meta, 'v1#model-b', 1000, 800)).toBe(true);
  });
  it('rebuilds only past the size-drift threshold', () => {
    expect(needsTopicsRebuild(meta, 'v1#model-a', 1000, 800)).toBe(false);
    expect(needsTopicsRebuild(meta, 'v1#model-a', 1050, 800)).toBe(false); // < 10%
    expect(needsTopicsRebuild(meta, 'v1#model-a', 1101, 800)).toBe(true); // ≥ 10%
    expect(needsTopicsRebuild(meta, 'v1#model-a', 880, 800)).toBe(true); // shrink counts too
  });
  it('rebuilds when enrichment materially re-embedded the same corpus', () => {
    // Reset → topics built over baseline vectors (few enriched) → crawl reads
    // 1,100 pages → same record count, very different vectors → must recluster.
    const baseline = { stamp: 'v1#model-a', embeddedCount: 1000, enrichedCount: 0 };
    expect(needsTopicsRebuild(baseline, 'v1#model-a', 1000, 900)).toBe(true);
    expect(needsTopicsRebuild(baseline, 'v1#model-a', 1000, 10)).toBe(false); // tiny wave
  });
  it('rebuilds once when meta predates the enrichedCount field', () => {
    const legacy = { stamp: 'v1#model-a', embeddedCount: 1000 } as unknown as typeof meta;
    expect(needsTopicsRebuild(legacy, 'v1#model-a', 1000, 800)).toBe(true);
  });
});
