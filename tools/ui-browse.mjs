// Browse-at-rest checks: the popup lists the library before any keystroke,
// the styled sort/folder dropdowns reshape it, the footer counter mirrors
// what the list shows, typing swaps to ranked results (and hides the
// controls), clearing returns to browse, and browse rows dwell-expand exactly
// like search rows. Screenshots the rest state per theme.
// Usage: node tools/ui-browse.mjs [--dark]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const dark = process.argv.includes('--dark');
const POPUP_VIEW = { width: 380, height: 520 };
const POLL_MS = 300;
const MAX_WAIT_MS = 8000;
const RENDER_SETTLE_MS = 400;
const MENU_SETTLE_MS = 150;
// Pointer dwell (550ms) + expand spring (380ms) + slack.
const EXPAND_SETTLE_MS = 1300;
/** How many leading rows the name-sort order assertion samples. */
const ORDER_SAMPLE = 10;

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
const c = await cdp.CDP.connect(tab.webSocketDebuggerUrl);

const evaluate = async (expression) => {
  const res = await c.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return res.result.value;
};

const rowCount = () => evaluate(`document.querySelectorAll('#results .row').length`);
const footerText = () => evaluate(`document.querySelector('#count')?.textContent ?? ''`);

const waitForRows = async () => {
  for (let waited = 0; waited < MAX_WAIT_MS; waited += POLL_MS) {
    if ((await rowCount()) > 0) return true;
    await cdp.sleep(POLL_MS);
  }
  return false;
};

/** Opens a styled dropdown by clicking its trigger; returns its option labels. */
const openDropdown = async (triggerId) => {
  await evaluate(`document.querySelector('#${triggerId}').click()`);
  await cdp.sleep(MENU_SETTLE_MS);
  return evaluate(
    `[...document.querySelectorAll('.overlay-menu.dropdown .option-label')].map((s) => s.textContent)`,
  );
};

/** Clicks the option whose label matches (dropdown must be open). */
const pickOption = async (label) => {
  await evaluate(
    `(() => {
      const btn = [...document.querySelectorAll('.overlay-menu.dropdown button')].find(
        (b) => b.textContent.trim() === ${JSON.stringify(label)},
      );
      btn?.click();
      return !!btn;
    })()`,
  );
  await cdp.sleep(RENDER_SETTLE_MS);
};

const setQuery = (text) =>
  evaluate(
    `(() => { const i = document.querySelector('#query'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );

try {
  await c.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
  });
  await c.send('Emulation.setDeviceMetricsOverride', {
    ...POPUP_VIEW,
    deviceScaleFactor: 2,
    mobile: false,
  });

  // 1. Rest is the library: rows + controls with no query at all.
  check(await waitForRows(), 'library rows appear before any keystroke');
  const rest = await evaluate(`(() => ({
    controlsVisible: !document.querySelector('#browse-controls').hidden,
    sortLabel: document.querySelector('#sort-label')?.textContent ?? '',
    chips: document.querySelectorAll('#results .row .row-head .chip').length,
  }))()`);
  check(
    rest.controlsVisible && rest.sortLabel === 'Recent',
    'browse controls visible, Recent is the default sort',
    `sort "${rest.sortLabel}"`,
  );
  check(rest.chips === 0, 'browse rows carry no match chips (nothing was matched)');
  const atRestFooter = await footerText();
  check(
    /^[\d,]+ bookmarks$/.test(atRestFooter),
    'footer shows the library size at rest',
    atRestFooter,
  );

  mkdirSync(resolve(CONFIG.root, 'tools/screenshots'), { recursive: true });
  const file = resolve(CONFIG.root, `tools/screenshots/browse-${dark ? 'dark' : 'light'}.png`);
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`shot  ${file}`);

  // 2. The styled dropdown: opens as a menu, marks the current value.
  const sortOptions = await openDropdown('sort');
  const menuState = await evaluate(`(() => {
    const menu = document.querySelector('.overlay-menu.dropdown');
    if (!menu) return null;
    return {
      role: menu.getAttribute('role'),
      checked: menu.querySelector('button[aria-checked="true"] .option-label')?.textContent ?? '',
      focusedInMenu: menu.contains(document.activeElement),
      expanded: document.querySelector('#sort').getAttribute('aria-expanded'),
    };
  })()`);
  check(
    !!menuState &&
      menuState.role === 'menu' &&
      sortOptions.join('|') === 'Recent|Name' &&
      menuState.checked === 'Recent' &&
      menuState.focusedInMenu &&
      menuState.expanded === 'true',
    'sort dropdown opens as a styled menu with the current value checked + focused',
    JSON.stringify({ options: sortOptions, ...menuState }),
  );

  // 3. Escape closes the dropdown WITHOUT closing the popup.
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await cdp.sleep(MENU_SETTLE_MS);
  const afterEscape = await evaluate(`(() => ({
    menuGone: !document.querySelector('.overlay-menu.dropdown'),
    triggerFocused: document.activeElement === document.querySelector('#sort'),
    expanded: document.querySelector('#sort').getAttribute('aria-expanded'),
  }))()`);
  check(
    afterEscape.menuGone && afterEscape.triggerFocused && afterEscape.expanded === 'false',
    'Escape closes the dropdown and returns focus to its trigger',
    JSON.stringify(afterEscape),
  );

  // 4. Name sort (picked through the dropdown) reorders alphabetically.
  await openDropdown('sort');
  await pickOption('Name');
  const titles = await evaluate(
    `[...document.querySelectorAll('#results .row .title')].slice(0, ${ORDER_SAMPLE}).map((t) => t.textContent)`,
  );
  const sortedOk = titles.every(
    (t, i) => i === 0 || String(titles[i - 1]).localeCompare(String(t)) <= 0,
  );
  check(
    titles.length > 1 && sortedOk,
    'Name sort orders rows alphabetically',
    JSON.stringify(titles.slice(0, 3)),
  );
  const sortLabelNow = await evaluate(`document.querySelector('#sort-label').textContent`);
  check(sortLabelNow === 'Name', 'trigger label mirrors the picked option', sortLabelNow);

  // 5. Folder scope: every rendered row's folder path sits inside the choice,
  // and the footer switches to "N of M".
  const folderOptions = await openDropdown('folder');
  check(
    folderOptions.length > 1,
    'folder dropdown offers real folders',
    `${folderOptions.length} options`,
  );
  const folder = folderOptions[1];
  await pickOption(folder);
  const scope = await evaluate(`(() => {
    const folders = [...document.querySelectorAll('#results .row .folder-text')].map(
      (f) => f.textContent,
    );
    return { total: folders.length, inScope: folders.filter((f) =>
      f === ${JSON.stringify(folder)} || f.startsWith(${JSON.stringify(folder)} + ' / ')).length };
  })()`);
  check(
    scope.total > 0 && scope.inScope === scope.total,
    'folder filter scopes every row to the chosen subtree',
    `${scope.inScope}/${scope.total} in ${JSON.stringify(folder)}`,
  );
  const scopedFooter = await footerText();
  check(
    /^[\d,]+ of [\d,]+$/.test(scopedFooter),
    'footer shows "N of M" while folder-scoped',
    scopedFooter,
  );
  await openDropdown('folder');
  await pickOption('All folders');
  await openDropdown('sort');
  await pickOption('Recent');

  // 6. Typing ends browsing: controls leave, ranked results take over, and the
  // footer counts results instead of the library.
  await setQuery('github');
  await cdp.sleep(1500);
  const typing = await evaluate(`(() => ({
    controlsHidden: document.querySelector('#browse-controls').hidden,
    rows: document.querySelectorAll('#results .row').length,
  }))()`);
  check(
    typing.controlsHidden && typing.rows > 0,
    'typing hides browse controls and shows ranked results',
    `${typing.rows} rows`,
  );
  const searchFooter = await footerText();
  check(
    /^(Top )?[\d,]+ results?$/.test(searchFooter),
    'footer counts results while searching',
    searchFooter,
  );

  // 7. Clearing the query returns to the library (and the library count).
  await setQuery('');
  await cdp.sleep(RENDER_SETTLE_MS * 2);
  const cleared = await evaluate(`(() => ({
    controlsVisible: !document.querySelector('#browse-controls').hidden,
    rows: document.querySelectorAll('#results .row').length,
  }))()`);
  check(
    cleared.controlsVisible && cleared.rows > 0,
    'clearing the query returns to browse',
    `${cleared.rows} rows`,
  );
  check(
    (await footerText()) === atRestFooter,
    'footer returns to the library size',
    await footerText(),
  );

  // 8. Browse rows bloom on dwell exactly like search rows.
  const target = await evaluate(`(() => {
    const row = document.querySelector('#results .row');
    const r = row.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, height: r.height };
  })()`);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y });
  await cdp.sleep(EXPAND_SETTLE_MS);
  const bloom = await evaluate(`(() => {
    const row = document.querySelector('#results .row.expanded');
    return row ? { height: row.getBoundingClientRect().height } : null;
  })()`);
  check(
    !!bloom && bloom.height - target.height >= 30,
    'browse rows dwell-expand into the detail card',
    bloom ? `${Math.round(target.height)}px → ${Math.round(bloom.height)}px` : 'no bloom',
  );

  // 9. Recent is an ACTIVITY timeline: opening a deep bookmark bumps it to #1.
  // Leaves one click row behind (honest feature state; eval runs unpersonalized).
  const browseRes = await evaluate(
    `chrome.runtime.sendMessage({ type: 'browse', sort: 'recent' })`,
  );
  const deepHit = (browseRes?.hits ?? [])[40];
  check(!!deepHit, 'browse offers a deep row to open', deepHit?.title?.slice(0, 40) ?? '(none)');
  const targetsBefore = (await cdp.listTargets()).map((t) => t.id);
  await evaluate(
    `chrome.runtime.sendMessage({ type: 'open-result', url: ${JSON.stringify(deepHit.url)}, recordId: ${JSON.stringify(deepHit.id)}, query: '', rank: 1, background: true })`,
  );
  await cdp.sleep(1200);
  // Close the tab the SW just opened — leave the browser as found. The page
  // may spawn workers/iframe targets that can't be closed (or vanish mid-loop);
  // only real pages matter and a straggler is harmless.
  for (const t of await cdp.listTargets()) {
    if (t.type !== 'page') continue;
    if (!targetsBefore.includes(t.id) && !t.url.startsWith('chrome-extension://')) {
      await cdp.closeTab(t.id).catch(() => {});
    }
  }
  await setQuery(''); // re-runs browse
  await cdp.sleep(RENDER_SETTLE_MS * 2);
  const topId = await evaluate(`document.querySelector('#results .row')?.dataset.id`);
  check(
    topId === deepHit.id,
    'opening a bookmark bumps it to the top of Recent',
    `top ${topId}, want ${deepHit.id}`,
  );
} finally {
  c.close();
  await cdp.closeTab(tab.id);
}

process.exit(failed);
