// Dumps the extension's persisted lifecycle diagnostics (index passes, triggers,
// enrichment waves, cancellations) — the SW's story, surviving SW death.
//   node tools/diag.mjs           # formatted timeline
//   node tools/diag.mjs --json    # raw entries
import * as cdp from './cdp.mjs';

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
let res;
try {
  res = await cdp.evalOnTarget(tab, `chrome.runtime.sendMessage({ type: 'diag-log' })`);
} finally {
  await cdp.closeTab(tab.id);
}

if (!res?.ok) {
  console.error('diag-log failed:', JSON.stringify(res));
  process.exit(1);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(res.entries, null, 2));
  process.exit(0);
}

if (!res.entries.length) {
  console.log('(diagnostic log is empty)');
  process.exit(0);
}

for (const { ts, event, detail } of res.entries) {
  const time = new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  console.log(`${time}  ${event.padEnd(22)} ${detail ?? ''}`.trimEnd());
}
