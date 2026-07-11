// Send a runtime message to the extension without JSON-quoting pain:
//   node tools/send.mjs ping
//   node tools/send.mjs search "warmup iphone ai"
//   node tools/send.mjs reindex | reset-data | index-state
//   node tools/send.mjs debug-embed "some text"
import * as cdp from './cdp.mjs';

const [type, arg] = process.argv.slice(2);
if (!type) {
  console.error('usage: node tools/send.mjs <type> [arg]');
  process.exit(2);
}
const message =
  type === 'search'
    ? { type, query: arg ?? '' }
    : type === 'debug-embed'
      ? { type, text: arg ?? '' }
      : { type };

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}
const RESULT_PREVIEW_COUNT = 12;

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const res = await cdp.evalOnTarget(tab, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
  if (type === 'search' && Array.isArray(res?.hits)) {
    for (const [i, h] of res.hits.slice(0, RESULT_PREVIEW_COUNT).entries()) {
      console.log(
        `${String(i + 1).padStart(2)}. [${h.reason}] ${h.title.slice(0, 55)} | ${h.url.slice(0, 50)}`,
      );
    }
    if (res.semanticPending) console.log('(semanticPending: lexical-only response)');
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
} finally {
  await cdp.closeTab(tab.id);
}
