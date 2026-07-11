// SW-side client for the offscreen document (the extension's DOM + ML host).
// The SW cannot parse DOM and cannot dynamic-import (so no ORT WASM either) —
// both capabilities live offscreen; this module is the only bridge.

const OFFSCREEN_URL = 'offscreen.html';

let creating: Promise<void> | null = null;

export async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  // createDocument throws if called twice concurrently — funnel through one promise.
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification:
        'Parse fetched bookmark pages and run the local embedding model (DOM + dynamic import are unavailable in the service worker).',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

// The two shapes Chrome throws when the receiving context died mid-call.
const CHANNEL_DIED_PATTERN = /message channel closed|receiving end does not exist/i;

export async function callOffscreen<TRequest extends { target: 'offscreen' }, TResponse>(
  request: TRequest,
): Promise<TResponse> {
  await ensureOffscreenDocument();
  try {
    return (await chrome.runtime.sendMessage(request)) as TResponse;
  } catch (err) {
    // The offscreen document can die under a call (crash under WASM load, or
    // torn down while work was in flight). Every offscreen op is idempotent
    // (parse / warmup / embed), so recreate the document and retry once —
    // a mid-pass death heals in place instead of failing the whole chunk.
    const text = err instanceof Error ? err.message : String(err);
    if (!CHANNEL_DIED_PATTERN.test(text)) throw err;
    await ensureOffscreenDocument();
    return (await chrome.runtime.sendMessage(request)) as TResponse;
  }
}
