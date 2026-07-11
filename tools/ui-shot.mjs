// Visual verification: open the popup page, type a query via CDP, screenshot.
// Usage: node tools/ui-shot.mjs [query] [--dark]
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const query =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'warmup iphone ai';
const dark = process.argv.includes('--dark');
const SETTLE_MS = 1600;
const POPUP_VIEW = { width: 380, height: 520 };

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
const c = await cdp.CDP.connect(tab.webSocketDebuggerUrl);
try {
  await c.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
  });
  await c.send('Emulation.setDeviceMetricsOverride', {
    ...POPUP_VIEW,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await c.send('Runtime.evaluate', {
    expression: `(() => { const i = document.querySelector('#query'); i.value = ${JSON.stringify(query)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  });
  await cdp.sleep(SETTLE_MS);
  mkdirSync(resolve(CONFIG.root, 'tools/screenshots'), { recursive: true });
  const file = resolve(CONFIG.root, `tools/screenshots/ui-${dark ? 'dark' : 'light'}.png`);
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(file);
} finally {
  c.close();
  await cdp.closeTab(tab.id);
}
