import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as storage from './storage';
import { dot, normalize, saveVectors, VectorIndex } from './vectors';

const MODEL_A = 'bge-small@1';
const MODEL_B = 'bge-small@0'; // a previous/stale model version, used for filtering tests

beforeEach(() => {
  // Fresh database per test: reset the global factory and drop the cached connection.
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

describe('normalize', () => {
  it('produces a unit vector', () => {
    const v = normalize(new Float32Array([3, 4]));
    expect(v[0]).toBeCloseTo(0.6, 5);
    expect(v[1]).toBeCloseTo(0.8, 5);
    expect(Math.hypot(v[0]!, v[1]!)).toBeCloseTo(1, 5);
  });

  it('mutates in place and returns the same reference', () => {
    const v = new Float32Array([1, 1]);
    expect(normalize(v)).toBe(v);
  });

  it('leaves a zero vector unchanged instead of producing NaN', () => {
    const v = new Float32Array([0, 0, 0]);
    expect(Array.from(normalize(v))).toEqual([0, 0, 0]);
  });
});

describe('dot', () => {
  it('computes the dot product of known values', () => {
    expect(dot(new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6]))).toBeCloseTo(32, 5);
  });

  it('is zero for orthogonal vectors', () => {
    expect(dot(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
  });
});

describe('saveVectors', () => {
  it('normalizes and persists vectors, round-tripping through storage', async () => {
    await saveVectors([{ id: '1', vector: new Float32Array([3, 4]), modelVersion: MODEL_A }]);
    const row = await storage.getVector('1');
    expect(row?.modelVersion).toBe(MODEL_A);
    const bytes = new Float32Array(row!.vector);
    expect(bytes[0]).toBeCloseTo(0.6, 5);
    expect(bytes[1]).toBeCloseTo(0.8, 5);
  });
});

describe('VectorIndex.load', () => {
  it('loads only rows matching modelVersion, ignoring stale rows', async () => {
    await saveVectors([
      { id: 'current', vector: new Float32Array([1, 0]), modelVersion: MODEL_A },
      { id: 'stale', vector: new Float32Array([1, 0]), modelVersion: MODEL_B },
    ]);
    const index = await VectorIndex.load(MODEL_A);
    expect(index.size).toBe(1);
  });

  it('is empty when no rows match', async () => {
    const index = await VectorIndex.load('unknown-version');
    expect(index.size).toBe(0);
    expect(index.search(new Float32Array([1]), 5)).toEqual([]);
  });

  it('throws with the offending record id on dimension mismatch across stored rows', async () => {
    // Bypass saveVectors to simulate corrupted/inconsistent stored data.
    await storage.putVectors([
      { id: 'a', vector: new Float32Array([1, 0]).buffer, modelVersion: MODEL_A },
      { id: 'bad', vector: new Float32Array([1, 0, 0]).buffer, modelVersion: MODEL_A },
    ]);
    await expect(VectorIndex.load(MODEL_A)).rejects.toThrow(/"bad"/);
  });
});

describe('VectorIndex.search', () => {
  async function buildIndex(): Promise<VectorIndex> {
    await saveVectors([
      { id: 'a', vector: new Float32Array([1, 0, 0, 0]), modelVersion: MODEL_A }, // == query
      { id: 'b', vector: new Float32Array([0.9, 0.1, 0, 0]), modelVersion: MODEL_A }, // close
      { id: 'c', vector: new Float32Array([0, 1, 0, 0]), modelVersion: MODEL_A }, // orthogonal
      { id: 'd', vector: new Float32Array([-1, 0, 0, 0]), modelVersion: MODEL_A }, // opposite
    ]);
    return VectorIndex.load(MODEL_A);
  }

  it('ranks by cosine similarity, best first', async () => {
    const index = await buildIndex();
    const results = index.search(new Float32Array([1, 0, 0, 0]), 4);
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(results[0]!.score).toBeCloseTo(1, 5);
    expect(results[2]!.score).toBeCloseTo(0, 5);
    expect(results[3]!.score).toBeCloseTo(-1, 5);
  });

  it('bounds results to topK', async () => {
    const index = await buildIndex();
    const results = index.search(new Float32Array([1, 0, 0, 0]), 2);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('throws when the query dimension does not match the index dimension', async () => {
    const index = await buildIndex();
    expect(() => index.search(new Float32Array([1, 0]), 4)).toThrow();
  });
});

describe('VectorIndex.upsert', () => {
  it('inserts a new id and makes it searchable', async () => {
    const index = await VectorIndex.load(MODEL_A);
    index.upsert('new', new Float32Array([1, 0]), MODEL_A);
    expect(index.size).toBe(1);
    expect(index.search(new Float32Array([1, 0]), 1)[0]?.id).toBe('new');
  });

  it('overwrites an existing id in place without growing the index', async () => {
    const index = await VectorIndex.load(MODEL_A);
    index.upsert('x', new Float32Array([1, 0]), MODEL_A);
    index.upsert('x', new Float32Array([0, 1]), MODEL_A);
    expect(index.size).toBe(1);
    const top = index.search(new Float32Array([0, 1]), 1)[0];
    expect(top?.id).toBe('x');
    expect(top?.score).toBeCloseTo(1, 5);
  });

  it('throws with the record id on dimension mismatch', async () => {
    const index = await VectorIndex.load(MODEL_A);
    index.upsert('x', new Float32Array([1, 0]), MODEL_A);
    expect(() => index.upsert('y', new Float32Array([1, 0, 0]), MODEL_A)).toThrow(/"y"/);
  });

  it('throws when modelVersion does not match the index', async () => {
    const index = await VectorIndex.load(MODEL_A);
    expect(() => index.upsert('x', new Float32Array([1, 0]), MODEL_B)).toThrow();
  });
});

describe('VectorIndex.remove', () => {
  it('removes an id so it no longer appears in search results', async () => {
    const index = await VectorIndex.load(MODEL_A);
    index.upsert('a', new Float32Array([1, 0]), MODEL_A);
    index.upsert('b', new Float32Array([0, 1]), MODEL_A);
    index.remove('a');
    expect(index.size).toBe(1);
    expect(index.search(new Float32Array([1, 0]), 2).map((r) => r.id)).toEqual(['b']);
  });

  it('is a no-op for an id that is not present', async () => {
    const index = await VectorIndex.load(MODEL_A);
    index.upsert('a', new Float32Array([1, 0]), MODEL_A);
    expect(() => index.remove('missing')).not.toThrow();
    expect(index.size).toBe(1);
  });

  it('keeps the packed array consistent after swap-with-last removal', async () => {
    const index = await VectorIndex.load(MODEL_A);
    index.upsert('a', new Float32Array([1, 0]), MODEL_A);
    index.upsert('b', new Float32Array([0, 1]), MODEL_A);
    index.upsert('c', new Float32Array([-1, 0]), MODEL_A);
    index.remove('a'); // drops the first row; 'c' (last) should swap into its slot

    expect(index.size).toBe(2);
    const results = index.search(new Float32Array([-1, 0]), 2);
    expect(results.map((r) => r.id).sort()).toEqual(['b', 'c']);
    expect(results[0]!.id).toBe('c');
    expect(results[0]!.score).toBeCloseTo(1, 5);
  });
});
