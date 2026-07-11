// In-memory brute-force cosine search over bookmark embeddings (decision 001).
// Vectors are always L2-normalized before storage/search, so cosine similarity reduces to a
// plain dot product — no separate similarity function is needed.
import { getAllVectors, putVectors } from './storage';
import type { VectorRow } from './types';

const MIN_NORM = 1e-12; // below this, treat the vector as zero — normalizing would divide by ~0

/**
 * L2-normalizes `v` in place and returns it (same reference), so callers can chain without an
 * extra allocation. A zero (or near-zero) vector is returned unchanged rather than producing
 * NaN/Infinity from a divide-by-zero.
 */
export function normalize(v: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < v.length; i++) {
    const value = v[i] ?? 0; // noUncheckedIndexedAccess: i is always in-bounds here
    sumSquares += value * value;
  }

  const norm = Math.sqrt(sumSquares);
  if (norm < MIN_NORM) return v;

  for (let i = 0; i < v.length; i++) {
    v[i] = (v[i] ?? 0) / norm;
  }
  return v;
}

/**
 * Plain-loop dot product (no SIMD — fast enough at this scale, decision 001).
 * Assumes `a.length === b.length`; callers (VectorIndex) own that invariant via their own
 * dimension guards, so this low-level primitive trusts its inputs rather than re-checking
 * (validate at the boundary, trust inward).
 */
export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

export type SaveVectorEntry = { id: string; vector: Float32Array; modelVersion: string };

/** Normalizes each entry's vector, then bulk-persists as VectorRow ArrayBuffers via storage. */
export async function saveVectors(entries: SaveVectorEntry[]): Promise<void> {
  const rows: VectorRow[] = entries.map(({ id, vector, modelVersion }) => ({
    id,
    // Float32Array.from always yields a fresh, whole ArrayBuffer (never a SharedArrayBuffer or
    // an offset view into a larger one), matching VectorRow's ArrayBuffer contract exactly.
    vector: Float32Array.from(normalize(vector)).buffer,
    modelVersion,
  }));
  await putVectors(rows);
}

export type SearchHit = { id: string; score: number };

/**
 * In-memory search structure the service worker keeps alive for the session.
 * Packs every row into one contiguous Float32Array — id `i`'s vector lives at
 * `[i*dim, (i+1)*dim)` — plus a parallel id array, instead of one object per row. Cache-friendly
 * and avoids per-row allocation overhead at up to ~5k rows (decision 001).
 */
export class VectorIndex {
  private constructor(
    private readonly modelVersion: string,
    private dim: number,
    private ids: string[],
    private data: Float32Array,
  ) {}

  /**
   * Bulk-loads all vectors, keeping only rows matching `modelVersion`. Stale-model rows are
   * dropped here — they get re-embedded elsewhere (decision 001), never merged into this index.
   */
  static async load(modelVersion: string): Promise<VectorIndex> {
    const rows = await getAllVectors();
    const matching = rows.filter((row) => row.modelVersion === modelVersion);

    let dim = 0; // 0 = not yet established; index may end up empty
    let data = new Float32Array(0);
    const ids: string[] = [];
    let offset = 0;

    for (const row of matching) {
      const vec = new Float32Array(row.vector);
      if (dim === 0) {
        dim = vec.length;
        data = new Float32Array(matching.length * dim);
      } else if (vec.length !== dim) {
        throw new Error(
          `VectorIndex.load: dimension mismatch for record "${row.id}" (expected ${dim}, got ${vec.length})`,
        );
      }
      data.set(vec, offset);
      ids.push(row.id);
      offset += dim;
    }

    return new VectorIndex(modelVersion, dim, ids, data);
  }

  get size(): number {
    return this.ids.length;
  }

  /**
   * Normalizes `query`, scores it against every row, and returns the top `topK` by score
   * descending. Scores-all-then-sorts rather than a partial-select heap: simplest correct
   * approach, and still sub-ms to few-ms at ≤5k rows (decision 001).
   */
  search(query: Float32Array, topK: number): SearchHit[] {
    if (this.size === 0 || topK <= 0) return [];
    if (query.length !== this.dim) {
      throw new Error(
        `VectorIndex.search: query dimension ${query.length} does not match index dimension ${this.dim}`,
      );
    }

    const normalizedQuery = normalize(query.slice()); // copy: never mutate the caller's query

    const scored: SearchHit[] = [];
    for (const [i, id] of this.ids.entries()) {
      const start = i * this.dim;
      const row = this.data.subarray(start, start + this.dim);
      scored.push({ id, score: dot(normalizedQuery, row) });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Inserts or overwrites `id`'s vector. Existing ids overwrite their row in place (O(1)); new
   * ids grow the packed array by one row (O(n) copy — Float32Array can't be resized). The O(n)
   * cost is fine here: upserts fire on single bookmark sync events, not the search hot path, and
   * the corpus stays ≤~5k rows (decision 001).
   */
  upsert(id: string, vector: Float32Array, modelVersion: string): void {
    if (modelVersion !== this.modelVersion) {
      throw new Error(
        `VectorIndex.upsert: modelVersion "${modelVersion}" does not match index modelVersion "${this.modelVersion}" for record "${id}"`,
      );
    }

    const normalized = normalize(vector.slice()); // copy: never mutate the caller's vector
    if (this.dim === 0) this.dim = normalized.length; // first row establishes the index dimension

    if (normalized.length !== this.dim) {
      throw new Error(
        `VectorIndex.upsert: dimension mismatch for record "${id}" (expected ${this.dim}, got ${normalized.length})`,
      );
    }

    const existingIndex = this.ids.indexOf(id);
    if (existingIndex !== -1) {
      this.data.set(normalized, existingIndex * this.dim);
      return;
    }

    const grown = new Float32Array(this.data.length + this.dim);
    grown.set(this.data);
    grown.set(normalized, this.data.length);
    this.data = grown;
    this.ids.push(id);
  }

  /**
   * Removes `id` if present; no-op otherwise. Swap-with-last: move the final row into the
   * removed slot, then drop the tail — cheaper than shifting every following row, and row order
   * is never meaningful (search always re-sorts by score).
   */
  remove(id: string): void {
    const index = this.ids.indexOf(id);
    if (index === -1) return;

    const lastIndex = this.ids.length - 1;
    const lastStart = lastIndex * this.dim;

    if (index !== lastIndex) {
      const targetStart = index * this.dim;
      this.data.copyWithin(targetStart, lastStart, lastStart + this.dim);
    }
    this.data = this.data.slice(0, lastStart);

    const lastId = this.ids.pop(); // removes the tail; undefined only if ids was empty (can't be — matched above)
    if (index !== lastIndex && lastId !== undefined) {
      this.ids[index] = lastId;
    }
  }
}
