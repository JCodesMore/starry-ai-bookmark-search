// Diagnostic: exercises the embedding engine inside the live SW via debug-embed.
// Usage: node tools/embed-test.mjs [text]
import * as cdp from './cdp.mjs';

const text = process.argv[2] ?? 'warmup iphone ai';

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const res = await cdp.evalOnTarget(
    tab,
    `chrome.runtime.sendMessage({ type: 'debug-embed', text: ${JSON.stringify(text)} })`,
  );
  console.log(JSON.stringify(res, null, 2));
  process.exitCode = res?.ok ? 0 : 1;
} finally {
  await cdp.closeTab(tab.id);
}
