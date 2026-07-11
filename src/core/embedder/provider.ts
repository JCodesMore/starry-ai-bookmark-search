// The embedding seam (decision 001): everything upstream depends on this
// interface only, so the model is a one-time re-embed swap.

export const MODEL_ID = 'Xenova/bge-small-en-v1.5';
export const MODEL_DTYPE = 'q8';
/** Tagged on every stored vector; bump the suffix on any change that invalidates vectors. */
export const MODEL_VERSION = `${MODEL_ID}#${MODEL_DTYPE}#cls@1`;
export const EMBEDDING_DIM = 384;

/**
 * BGE v1.5 retrieval instruction — applied to QUERIES only (never documents).
 * Improves short-query → passage retrieval per the model card.
 */
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

export type ProgressHandler = (pct: number) => void;

export interface EmbeddingProvider {
  readonly modelVersion: string;
  readonly dim: number;
  /** Loads (downloading on first run) and initializes the model. Idempotent. */
  warmUp(onProgress?: ProgressHandler): Promise<void>;
  /** Embeds document composite texts. Returns L2-normalized vectors. */
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  /** Embeds a search query (with QUERY_PREFIX). Returns an L2-normalized vector. */
  embedQuery(text: string): Promise<Float32Array>;
}
