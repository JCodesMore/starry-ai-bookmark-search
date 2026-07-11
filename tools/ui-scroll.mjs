// Infinite-scroll checks: rows materialize in batches as the results list
// scrolls, and the full hit list becomes reachable. Exits non-zero on failure.
// Usage: node tools/ui-scroll.mjs ["query"]   (default: "github" — broad on this corpus)
import * as cdp from './cdp.mjs';

const query = process.argv[2] || 'github';
const SEARCH_SETTLE_MS = 900;
const SCROLL_SETTLE_MS = 350;

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = 1;
};

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const result = await cdp.evalOnTarget(
    tab,
    `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const input = document.querySelector('#query');
      const list = document.querySelector('#results');
      input.value = ${JSON.stringify(query)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(${SEARCH_SETTLE_MS});

      const rows = () => list.querySelectorAll('.row').length;
      const initial = rows();

      // Scroll to the bottom repeatedly until the row count stops growing.
      let last = -1;
      let grew = 0;
      while (rows() !== last) {
        last = rows();
        list.scrollTop = list.scrollHeight;
        await sleep(${SCROLL_SETTLE_MS});
        if (rows() > last) grew += 1;
      }
      return {
        initial,
        final: rows(),
        batchesLoaded: grew,
        sentinelGone: !list.querySelector('.load-sentinel'),
      };
    })()`,
  );

  check(result.initial > 0, 'search returned rows', `initial batch ${result.initial}`);
  check(
    result.final > result.initial,
    'scrolling materializes more rows',
    `${result.initial} → ${result.final} (${result.batchesLoaded} extra batches)`,
  );
  check(result.sentinelGone, 'sentinel removed once the full list is rendered');
} finally {
  await cdp.closeTab(tab.id);
}

process.exit(failed);
