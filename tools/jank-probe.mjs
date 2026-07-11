// Measures extension-page main-thread responsiveness while the embedding
// engine is under load — the user-visible "popup feels laggy while indexing"
// number. All extension pages share one renderer main thread, so WASM work
// running on ANY extension page's main thread shows up here as timer drift.
//   node tools/jank-probe.mjs
// Prints idle vs under-load gap stats (ms a 25ms timer arrived late).
import * as cdp from './cdp.mjs';

const MEASURE_MS = 6000;
const TICK_MS = 25;

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}

const measureExpr = `(async () => {
  const gaps = [];
  let last = performance.now();
  const end = last + ${MEASURE_MS};
  while (performance.now() < end) {
    await new Promise((r) => setTimeout(r, ${TICK_MS}));
    const now = performance.now();
    gaps.push(Math.max(0, now - last - ${TICK_MS}));
    last = now;
  }
  gaps.sort((a, b) => a - b);
  const q = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
  const sum = gaps.reduce((a, b) => a + b, 0);
  return {
    samples: gaps.length,
    avgMs: +(sum / gaps.length).toFixed(1),
    p95Ms: +q(0.95).toFixed(1),
    maxMs: +Math.max(...gaps).toFixed(1),
  };
})()`;

// Long text ≈ a crawled page's composite — one embed call is then a single
// hundreds-of-ms WASM burst, the same shape as the indexer's document batches.
const loadExpr = `(async () => {
  const filler = 'a moderately long sentence so the tokenizer and model have real work to chew on during the whole measurement window, over and over again. '.repeat(18);
  const end = performance.now() + ${MEASURE_MS + 500};
  let calls = 0;
  while (performance.now() < end) {
    await chrome.runtime.sendMessage({ type: 'debug-embed', text: calls + ' ' + filler });
    calls++;
  }
  return calls;
})()`;

// Probe = the page whose responsiveness we measure (the user-facing surface);
// loader = a second extension page hammering the embedding engine via the SW.
const probe = await cdp.createTab(`chrome-extension://${ext.id}/onboarding.html?customize`);
const loader = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);

// The probe tab MUST be frontmost: background tabs clamp timers to ~1Hz,
// which would measure Chrome's throttling instead of main-thread contention.
async function frontProbe() {
  const b = await cdp.browser();
  try {
    await b.send('Target.activateTarget', { targetId: probe.id });
  } finally {
    b.close();
  }
}

try {
  // One call up front so warm-up (model load) never pollutes the measurement.
  await cdp.evalOnTarget(
    loader,
    `chrome.runtime.sendMessage({ type: 'debug-embed', text: 'warm' })`,
  );

  await frontProbe();
  const idle = await cdp.evalOnTarget(probe, measureExpr);
  await frontProbe();
  const [underLoad, embedCalls] = await Promise.all([
    cdp.evalOnTarget(probe, measureExpr),
    cdp.evalOnTarget(loader, loadExpr),
  ]);
  console.log(JSON.stringify({ idle, underLoad, embedCalls }, null, 2));
} finally {
  await cdp.closeTab(probe.id);
  await cdp.closeTab(loader.id);
}
