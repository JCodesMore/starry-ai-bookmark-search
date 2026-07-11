// transformers.js implementation of EmbeddingProvider (decision 001).
// Runs inside the dedicated embed worker (offscreen/embed-worker.ts) — the one
// context whose main-thread time is free. ORT runtime files are copied into
// dist/ by tools/build.mjs and resolved relative to the extension root.
import { env, pipeline } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import {
  EMBEDDING_DIM,
  MODEL_DTYPE,
  MODEL_ID,
  MODEL_VERSION,
  QUERY_PREFIX,
  type EmbeddingProvider,
  type ProgressHandler,
} from './provider';

// BGE models are trained for CLS pooling (research: embeddings report §2).
const POOLING = 'cls';
// Extension pages are not cross-origin isolated → no SharedArrayBuffer →
// single WASM thread (also dodges ORT's Blob-worker proxy, which extension
// CSP blocks).
const WASM_THREADS = 1;
const EMBED_BATCH_SIZE = 16;
const PERCENT = 100;

type HubProgress = { status: string; progress?: number; file?: string };

let pipePromise: Promise<FeatureExtractionPipeline> | null = null;

function configureEnv(): void {
  env.allowLocalModels = false;
  const wasmEnv = env.backends.onnx.wasm;
  if (!wasmEnv) throw new Error('ORT wasm backend env missing — onnxruntime-web not bundled?');
  // ORT loads its .mjs/.wasm runtime relative to this base URL at runtime.
  // chrome.* APIs don't exist in workers — derive the extension root from the
  // worker script's own URL instead (same origin, same directory).
  wasmEnv.wasmPaths = new URL('.', self.location.href).href;
  wasmEnv.numThreads = WASM_THREADS;
}

function loadPipeline(onProgress?: ProgressHandler): Promise<FeatureExtractionPipeline> {
  if (!pipePromise) {
    configureEnv();
    pipePromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: MODEL_DTYPE,
      progress_callback: (info: HubProgress) => {
        // Weights dominate download time; surface only real progress events.
        if (info.status === 'progress' && typeof info.progress === 'number' && onProgress) {
          onProgress(Math.min(PERCENT, Math.round(info.progress)));
        }
      },
    }) as Promise<FeatureExtractionPipeline>;
    pipePromise.catch(() => {
      // Allow retry after a failed load (e.g. offline first run).
      pipePromise = null;
    });
  }
  return pipePromise;
}

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const pipe = await loadPipeline();
  const output = await pipe(texts, { pooling: POOLING, normalize: true });
  const [rows, dim] = output.dims;
  if (rows !== texts.length || dim !== EMBEDDING_DIM) {
    throw new Error(
      `embed shape mismatch: got ${String(rows)}x${String(dim)}, expected ${texts.length}x${EMBEDDING_DIM}`,
    );
  }
  const data = output.data as Float32Array;
  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Float32Array.from(data.subarray(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)));
  }
  return vectors;
}

export function getTransformersProvider(): EmbeddingProvider {
  return {
    modelVersion: MODEL_VERSION,
    dim: EMBEDDING_DIM,

    async warmUp(onProgress?: ProgressHandler): Promise<void> {
      await loadPipeline(onProgress);
    },

    async embedDocuments(texts: string[]): Promise<Float32Array[]> {
      const vectors: Float32Array[] = [];
      // Bounded batches keep peak memory flat on large corpora (prior art: Pinbot).
      for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
        vectors.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH_SIZE))));
      }
      return vectors;
    },

    async embedQuery(text: string): Promise<Float32Array> {
      const [vector] = await embedBatch([QUERY_PREFIX + text]);
      if (!vector) throw new Error('embedQuery produced no vector');
      return vector;
    },
  };
}
