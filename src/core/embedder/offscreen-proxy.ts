// EmbeddingProvider that proxies to the offscreen document, where the real
// transformers.js engine runs (MV3 SWs disallow the dynamic import ORT needs).
// Vectors cross the message boundary as number[] (Float32Array doesn't survive
// structured-clone-to-JSON in runtime messages).
import { callOffscreen } from '../offscreen-client';
import { EMBEDDING_DIM, MODEL_VERSION, type EmbeddingProvider } from './provider';
import type { EmbedRequest, EmbedResponse, WarmupRequest, WarmupResponse } from './wire';

function toFloat32(rows: number[][], context: string): Float32Array[] {
  return rows.map((row, i) => {
    if (row.length !== EMBEDDING_DIM) {
      throw new Error(`${context}: row ${i} has dim ${row.length}, expected ${EMBEDDING_DIM}`);
    }
    return Float32Array.from(row);
  });
}

function unwrap<T extends { ok: boolean; error?: string }>(res: T | undefined, op: string): T {
  if (!res) throw new Error(`${op}: no response from offscreen document`);
  if (!res.ok) throw new Error(`${op} failed in offscreen: ${res.error ?? 'unknown'}`);
  return res;
}

export function getOffscreenEmbeddingProvider(): EmbeddingProvider {
  return {
    modelVersion: MODEL_VERSION,
    dim: EMBEDDING_DIM,

    async warmUp(): Promise<void> {
      const req: WarmupRequest = { target: 'offscreen', type: 'warmup' };
      unwrap(await callOffscreen<WarmupRequest, WarmupResponse>(req), 'warmUp');
    },

    async embedDocuments(texts: string[]): Promise<Float32Array[]> {
      if (!texts.length) return [];
      const req: EmbedRequest = { target: 'offscreen', type: 'embed', kind: 'documents', texts };
      const res = unwrap(await callOffscreen<EmbedRequest, EmbedResponse>(req), 'embedDocuments');
      return toFloat32(res.vectors ?? [], 'embedDocuments');
    },

    async embedQuery(text: string): Promise<Float32Array> {
      const req: EmbedRequest = {
        target: 'offscreen',
        type: 'embed',
        kind: 'query',
        texts: [text],
      };
      const res = unwrap(await callOffscreen<EmbedRequest, EmbedResponse>(req), 'embedQuery');
      const [vector] = toFloat32(res.vectors ?? [], 'embedQuery');
      if (!vector) throw new Error('embedQuery: offscreen returned no vector');
      return vector;
    },
  };
}
