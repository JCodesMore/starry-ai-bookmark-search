// End-to-end smoke test: extension loaded → service worker responds → bookmarks
// API works → popup UI search returns results → screenshot for visual check.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  const extra =
    detail === undefined
      ? ''
      : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra}`);
}

if (!(await cdp.isUp())) {
  console.error('Dev browser not running — run `npm run browser` first.');
  process.exit(2);
}

const ext = await cdp.findExtension();
check(
  'extension loaded & enabled',
  ext?.state === 'ENABLED',
  ext ? `v${ext.version} (${ext.id})` : 'not found',
);
if (!ext) process.exit(1);

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
await cdp.sleep(400);

const pong = await cdp.evalOnTarget(tab, `chrome.runtime.sendMessage({ type: 'ping' })`);
check('service worker responds to ping', pong?.pong === true, pong);

const seeded = await cdp.evalOnTarget(
  tab,
  `(async () => {
  const existing = await chrome.bookmarks.search({ title: 'BSS Test Folder' });
  if (existing.length) return 'already-seeded';
  const folder = await chrome.bookmarks.create({ title: 'BSS Test Folder' });
  await chrome.bookmarks.create({ parentId: folder.id, title: 'GitHub — where code lives', url: 'https://github.com/' });
  await chrome.bookmarks.create({ parentId: folder.id, title: 'Hacker News', url: 'https://news.ycombinator.com/' });
  await chrome.bookmarks.create({ parentId: folder.id, title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' });
  return 'seeded';
})()`,
);
check('test bookmarks present', seeded === 'seeded' || seeded === 'already-seeded', seeded);

// The browse-at-rest list is already showing rows, so "some row mentions the
// query" would pass on STALE content. Only a render where the browse controls
// left (search took over) with the expected top hit proves the ranked
// pipeline answered — a hung search once slipped through the looser check.
const hits = await cdp.evalOnTarget(
  tab,
  `(async () => {
  const input = document.querySelector('#query');
  input.value = 'github';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let waited = 0; waited < 5000; waited += 200) {
    await new Promise((r) => setTimeout(r, 200));
    if (document.querySelector('#browse-controls').hidden) break;
  }
  return {
    searchRendered: document.querySelector('#browse-controls').hidden,
    top: document.querySelector('#results .row .title')?.textContent ?? '',
    rows: document.querySelectorAll('#results .row').length,
  };
})()`,
);
check(
  'popup search returns ranked results',
  hits?.searchRendered === true && hits.rows > 0 && hits.top.toLowerCase().includes('github'),
  hits,
);

mkdirSync(resolve(CONFIG.root, 'tools/screenshots'), { recursive: true });
const file = resolve(CONFIG.root, 'tools/screenshots/smoke-popup.png');
await cdp.screenshot(tab, file);
check('screenshot captured', true, file);

await cdp.closeTab(tab.id);

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed.length ? 1 : 0);
