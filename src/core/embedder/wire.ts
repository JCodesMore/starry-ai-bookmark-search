// Wire types for SW ↔ offscreen embedding calls. Kept dependency-free so both
// bundles (background.js, offscreen.js) can import without dragging code across.

export type WarmupRequest = { target: 'offscreen'; type: 'warmup' };
export type WarmupResponse = { ok: boolean; error?: string };

export type EmbedRequest = {
  target: 'offscreen';
  type: 'embed';
  /** 'query' applies the retrieval QUERY_PREFIX; 'documents' embeds as-is. */
  kind: 'documents' | 'query';
  texts: string[];
};
export type EmbedResponse = { ok: boolean; vectors?: number[][]; error?: string };

/** Broadcast by offscreen during first-run model download (0–100). */
export type EmbedProgressEvent = { type: 'embed-progress'; pct: number };

// --- offscreen ↔ embed-worker protocol ---
// The engine lives in a dedicated worker (all extension pages share ONE
// renderer main thread — inference on any of them janks every surface). The
// worker has no chrome.*, so the offscreen document relays requests in and
// progress out.

export type WorkerCall =
  { type: 'warmup' } | { type: 'embed'; kind: 'documents' | 'query'; texts: string[] };
export type WorkerRequest = WorkerCall & { id: number };

export type WorkerResult = { type: 'result'; id: number } & EmbedResponse;
export type WorkerResponse = { type: 'progress'; pct: number } | WorkerResult;
