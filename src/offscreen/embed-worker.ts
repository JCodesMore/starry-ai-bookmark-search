// Dedicated worker hosting the embedding engine. Every extension page shares
// ONE renderer main thread, so WASM inference anywhere on it freezes the
// popup and onboarding UI — here it runs on its own thread instead. No
// chrome.* APIs exist in this context; the offscreen document relays requests
// and forwards progress (wire.ts is the contract).
import { getTransformersProvider } from '../core/embedder/transformers';
import type { WorkerRequest, WorkerResponse } from '../core/embedder/wire';

const provider = getTransformersProvider();

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

const reportProgress = (pct: number): void => post({ type: 'progress', pct });

async function handle(req: WorkerRequest): Promise<void> {
  try {
    if (req.type === 'warmup') {
      await provider.warmUp(reportProgress);
      post({ type: 'result', id: req.id, ok: true });
      return;
    }
    // Warm first with progress wired up — an embed call may be the one that
    // triggers the first-run model download, and the UI wants to narrate it.
    await provider.warmUp(reportProgress);
    const vectors =
      req.kind === 'query'
        ? [await provider.embedQuery(req.texts[0] ?? '')]
        : await provider.embedDocuments(req.texts);
    post({ type: 'result', id: req.id, ok: true, vectors: vectors.map((v) => Array.from(v)) });
  } catch (err) {
    post({
      type: 'result',
      id: req.id,
      ok: false,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data);
};
