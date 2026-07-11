// Dev-loop diagnostics that live behind messages (tools/embed-test.mjs).
// Kept out of background.ts so the router stays a thin routing table.
import type { DebugEmbedResponse } from '../lib/messages';
import type { EmbeddingProvider } from './embedder/provider';

const SAMPLE_DIMS = 4;

/** Exercises the embedding engine end-to-end in the SW: warm-up + one query
 * embedding, with timings — the dev loop's latency probe. */
export async function debugEmbed(
  provider: EmbeddingProvider,
  text: string,
): Promise<DebugEmbedResponse> {
  try {
    const start = performance.now();
    await provider.warmUp();
    const warmed = performance.now();
    const vector = await provider.embedQuery(text);
    const embedded = performance.now();
    return {
      ok: true,
      dim: vector.length,
      warmUpMs: Math.round(warmed - start),
      embedMs: Math.round(embedded - warmed),
      sample: Array.from(vector.slice(0, SAMPLE_DIMS)),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? (err.stack ?? err.message) : String(err) };
  }
}
