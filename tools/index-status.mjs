// Poll the extension's index progress until done (or --once for a snapshot).
import * as cdp from './cdp.mjs';

const once = process.argv.includes('--once');
const POLL_MS = 2000;
const MAX_POLLS = 300;

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await cdp.evalOnTarget(tab, `chrome.runtime.sendMessage({ type: 'index-state' })`);
    const p = res?.progress;
    if (!p) {
      console.log('no progress recorded yet');
    } else {
      console.log(
        `${p.phase}  ${p.processed}/${p.total}  failed:${p.failed}  (updated ${new Date(p.updatedAt).toLocaleTimeString()})`,
      );
      if (p.phase === 'done' || once) break;
    }
    if (once) break;
    await cdp.sleep(POLL_MS);
  }
} finally {
  await cdp.closeTab(tab.id);
}
