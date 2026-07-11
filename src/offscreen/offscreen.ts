// Runtime shell for the offscreen document (decision 002 / architecture.md).
// Two roles: (1) DOM parsing/extraction on this thread, (2) relaying embedding
// work to the dedicated engine worker — the SW can do neither (no DOMParser;
// no dynamic import, which ORT WASM needs), and the engine must not run on
// THIS thread either: all extension pages share one renderer main thread, so
// inference here freezes the popup and onboarding UI (measured ~385ms stalls).
import { extractSignals, parseHtml, type ExtractedSignals } from './extract';
import type {
  EmbedRequest,
  EmbedResponse,
  WarmupRequest,
  WarmupResponse,
  WorkerCall,
  WorkerResponse,
} from '../core/embedder/wire';

const OFFSCREEN_TARGET = 'offscreen';
const EXTRACT_MESSAGE_TYPE = 'extract';
const EMBED_MESSAGE_TYPE = 'embed';
const WARMUP_MESSAGE_TYPE = 'warmup';

function broadcastProgress(pct: number): void {
  // Fire-and-forget: the SW stores this for the popup's status line.
  void chrome.runtime.sendMessage({ type: 'embed-progress', pct }).catch(() => undefined);
}

// --- engine worker client (lazy; respawned if it ever crashes) ---

let worker: Worker | null = null;
let nextCallId = 1;
const pending = new Map<number, (res: EmbedResponse) => void>();

function failAllPending(reason: string): void {
  for (const resolve of pending.values()) resolve({ ok: false, error: reason });
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker('embed-worker.js', { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      broadcastProgress(msg.pct);
      return;
    }
    const resolve = pending.get(msg.id);
    pending.delete(msg.id);
    resolve?.(msg);
  };
  worker.onerror = (event) => {
    // A dead engine fails every in-flight call (the index self-heals — failed
    // chunks stay stale); the next request spawns a fresh worker.
    console.error('[Starry] embed worker error:', event.message);
    failAllPending(event.message || 'embed worker crashed');
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function callWorker(request: WorkerCall): Promise<EmbedResponse> {
  const id = nextCallId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ ...request, id });
  });
}

async function handleWarmup(): Promise<WarmupResponse> {
  const res = await callWorker({ type: 'warmup' });
  return res.ok ? { ok: true } : { ok: false, ...(res.error ? { error: res.error } : {}) };
}

function handleEmbed(request: EmbedRequest): Promise<EmbedResponse> {
  return callWorker({ type: 'embed', kind: request.kind, texts: request.texts });
}

export type ExtractRequest = {
  target: typeof OFFSCREEN_TARGET;
  type: typeof EXTRACT_MESSAGE_TYPE;
  html: string;
  url: string;
};

export type ExtractSuccess = { ok: true; signals: PageSignalsOnly; title?: string };
export type ExtractFailure = { ok: false; error: string };
export type ExtractResult = ExtractSuccess | ExtractFailure;

// The wire contract keeps `title` separate from `signals` (title isn't a stored PageSignals
// field — see extract.ts); this is just ExtractedSignals with that field pulled out.
type PageSignalsOnly = Omit<ExtractedSignals, 'title'>;

function isExtractRequest(message: unknown): message is ExtractRequest {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.target === OFFSCREEN_TARGET && candidate.type === EXTRACT_MESSAGE_TYPE;
}

function handleExtract(request: ExtractRequest): ExtractResult {
  try {
    const dom = parseHtml(request.html);
    const { title, ...signals } = extractSignals(request.html, request.url, dom);
    return title === undefined ? { ok: true, signals } : { ok: true, signals, title };
  } catch (err) {
    // Keep the failure diagnosable at the call site (fetcher.ts) without a stack trace round-trip.
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

function isOffscreenRequest(
  message: unknown,
): message is { target: typeof OFFSCREEN_TARGET; type: string } {
  if (typeof message !== 'object' || message === null) return false;
  return (message as Record<string, unknown>).target === OFFSCREEN_TARGET;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOffscreenRequest(message)) return; // not addressed to this document — ignore

  if (isExtractRequest(message)) {
    sendResponse(handleExtract(message));
    return true;
  }
  if (message.type === WARMUP_MESSAGE_TYPE) {
    void handleWarmup().then(sendResponse);
    return true; // async reply — keep the channel open
  }
  if (message.type === EMBED_MESSAGE_TYPE) {
    void handleEmbed(message as EmbedRequest).then(sendResponse);
    return true;
  }
  return undefined;
});

// Reference the type so the import stays honest (WarmupRequest crosses the wire untyped here).
export type { WarmupRequest };
