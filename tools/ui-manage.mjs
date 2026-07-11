// Manage checks: the inline hover actions are ONLY open+copy (icon meaning
// never changes under the cursor — bloom included), management lives in the
// custom right-click menu (Open / background / Copy / Reveal / Delete), the
// menu is keyboard-navigable (APG), Escape closes the menu WITHOUT closing
// the popup, Delete offers Undo and Undo really restores, Reveal opens
// Chrome's own manager. Uses a disposable seeded bookmark; cleans up after.
// Usage: node tools/ui-manage.mjs [--dark]
import * as cdp from './cdp.mjs';

const dark = process.argv.includes('--dark');
const POPUP_VIEW = { width: 380, height: 520 };
const TEST_URL = 'https://bss-manage-test.invalid/';
const TEST_TITLE = 'BSS Manage Test Bookmark';
const POLL_MS = 400;
const INDEX_MAX_WAIT_MS = 20000;
const EXPAND_SETTLE_MS = 1300;
const MENU_SETTLE_MS = 250;
const UNDO_APPLY_MS = 2500;
const MENU_LABELS = [
  'Open',
  'Open in background tab',
  'Copy link',
  'Show in Bookmarks Manager',
  'Delete',
];

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

const mouse = (x, y) => c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => {
  const base = { x, y, button: 'left', clickCount: 1 };
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
};
const rightClick = async (x, y) => {
  const base = { x, y, button: 'right', clickCount: 1 };
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
};
const key = async (name, code, vk) => {
  await c.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: name,
    code,
    windowsVirtualKeyCode: vk,
  });
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: name,
    code,
    windowsVirtualKeyCode: vk,
  });
};

const testRowSelector = `[...document.querySelectorAll('#results .row')].find((r) =>
  r.querySelector('.title')?.textContent?.includes(${JSON.stringify(TEST_TITLE)}))`;

const rowCenter = () =>
  evaluate(`(() => {
    const r = (${testRowSelector}).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);

const menuItemCenter = (label) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll('#ctx-menu button')]
      .find((b) => b.textContent === ${JSON.stringify(label)});
    if (!el || !el.offsetParent) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);

const openMenuOnRow = async () => {
  const at = await rowCenter();
  await rightClick(at.x, at.y);
  await cdp.sleep(MENU_SETTLE_MS);
  return evaluate(`!!document.querySelector('#ctx-menu')`);
};

try {
  await c.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
  });
  await c.send('Emulation.setDeviceMetricsOverride', {
    ...POPUP_VIEW,
    deviceScaleFactor: 2,
    mobile: false,
  });

  // Seed a disposable bookmark (idempotent), then search for it. The row must
  // be bound to the LIVE bookmark id — a back-to-back run can briefly serve a
  // zombie record from the previous run's cleanup (same title/url, dead id),
  // whose Reveal/Delete would then no-op against Chrome.
  const liveId = await evaluate(`(async () => {
    const found = await chrome.bookmarks.search({ url: ${JSON.stringify(TEST_URL)} });
    if (found.length) return found[0].id;
    const node = await chrome.bookmarks.create({ title: ${JSON.stringify(TEST_TITLE)}, url: ${JSON.stringify(TEST_URL)} });
    return node.id;
  })()`);
  await evaluate(
    `(() => { const i = document.querySelector('#query'); i.value = 'BSS Manage Test'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );
  let seen = false;
  for (let waited = 0; waited < INDEX_MAX_WAIT_MS; waited += POLL_MS) {
    if (await evaluate(`(${testRowSelector})?.dataset.id === ${JSON.stringify(liveId)}`)) {
      seen = true;
      break;
    }
    // Keystroke retriggers search against the (re)indexing corpus.
    await evaluate(
      `(() => { const i = document.querySelector('#query'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    );
    await cdp.sleep(POLL_MS);
  }
  check(seen, 'seeded test bookmark is searchable under its live id');
  if (!seen) process.exit(1);
  // Let the semantic re-rank retry land — a later re-render would replace rows.
  await cdp.sleep(1800);

  // Inline actions are exactly open+copy, collapsed AND bloomed — the icon
  // under the cursor must never change meaning when the card expands.
  const collapsedActions = await evaluate(
    `(${testRowSelector}).querySelectorAll('.actions button').length`,
  );
  check(collapsedActions === 2, 'collapsed row has exactly open+copy', `${collapsedActions}`);

  const at = await rowCenter();
  await mouse(at.x, at.y);
  await cdp.sleep(EXPAND_SETTLE_MS);
  const bloomed = await evaluate(`(() => {
    const row = ${testRowSelector};
    return {
      expanded: row.classList.contains('expanded'),
      actionCount: row.querySelectorAll('.actions button').length,
    };
  })()`);
  check(
    bloomed.expanded && bloomed.actionCount === 2,
    'bloomed card keeps the same two actions',
    JSON.stringify(bloomed),
  );

  // Right-click opens the custom menu with all five actions, first item focused.
  check(await openMenuOnRow(), 'right-click opens the context menu');
  const menuState = await evaluate(`(() => ({
    labels: [...document.querySelectorAll('#ctx-menu button')].map((b) => b.textContent),
    role: document.querySelector('#ctx-menu')?.getAttribute('role'),
    focusedFirst: document.activeElement === document.querySelector('#ctx-menu button'),
  }))()`);
  check(
    JSON.stringify(menuState.labels) === JSON.stringify(MENU_LABELS),
    'menu lists all five actions in order',
    JSON.stringify(menuState.labels),
  );
  check(menuState.role === 'menu', 'menu has role=menu');
  check(menuState.focusedFirst, 'first menu item receives focus (APG)');
  await cdp.screenshot(tab, `tools/screenshots/manage-menu${dark ? '-dark' : ''}.png`);

  // Arrow moves focus; Escape closes the MENU but the popup survives.
  await key('ArrowDown', 'ArrowDown', 40);
  const secondFocused = await evaluate(
    `document.activeElement === document.querySelectorAll('#ctx-menu button')[1]`,
  );
  check(secondFocused, 'ArrowDown moves menu focus');
  await key('Escape', 'Escape', 27);
  await cdp.sleep(MENU_SETTLE_MS);
  const afterEscape = await evaluate(`(() => ({
    menuGone: !document.querySelector('#ctx-menu'),
    popupAlive: !!document.querySelector('#query'),
    inputFocused: document.activeElement === document.querySelector('#query'),
  }))()`);
  check(
    afterEscape.menuGone && afterEscape.popupAlive,
    'Escape closes the menu, not the popup',
    JSON.stringify(afterEscape),
  );
  check(afterEscape.inputFocused, 'focus returns to the search input');

  // Reveal via the menu opens Chrome's own manager.
  const before = (await cdp.listTargets()).filter((t) => t.url.startsWith('chrome://bookmarks'));
  check(await openMenuOnRow(), 'menu reopens for Reveal');
  const revealAt = await menuItemCenter('Show in Bookmarks Manager');
  await click(revealAt.x, revealAt.y);
  await cdp.sleep(900);
  const managers = (await cdp.listTargets()).filter((t) => t.url.startsWith('chrome://bookmarks'));
  check(managers.length === before.length + 1, 'Reveal opens the Bookmarks Manager');
  for (const m of managers) await cdp.closeTab(m.id);

  // Delete via the menu: always danger-red (no hover needed), row leaves,
  // toast offers Undo.
  check(await openMenuOnRow(), 'menu reopens for Delete');
  const delAt = await menuItemCenter('Delete');
  const dangerColor = await evaluate(`(() => {
    const el = [...document.querySelectorAll('#ctx-menu button')].find((b) => b.textContent === 'Delete');
    return el.classList.contains('danger') ? getComputedStyle(el).color : 'no-danger-class';
  })()`);
  const dangerRgb = dark ? 'rgb(255, 69, 58)' : 'rgb(215, 0, 21)';
  check(dangerColor === dangerRgb, 'Delete reads danger-red at rest', dangerColor);
  await mouse(delAt.x, delAt.y);
  await cdp.sleep(MENU_SETTLE_MS);
  await click(delAt.x, delAt.y);
  await cdp.sleep(800);
  const afterDelete = await evaluate(`(() => ({
    rowGone: !(${testRowSelector}),
    menuGone: !document.querySelector('#ctx-menu'),
    toast: document.querySelector('#toast')?.textContent ?? '',
  }))()`);
  check(afterDelete.rowGone && afterDelete.menuGone, 'delete removes the row and the menu');
  check(
    afterDelete.toast.startsWith('Removed') && afterDelete.toast.endsWith('Undo'),
    'undo toast appears',
    JSON.stringify(afterDelete.toast),
  );
  const reallyGone = await evaluate(
    `chrome.bookmarks.search({ url: ${JSON.stringify(TEST_URL)} }).then((r) => r.length === 0)`,
  );
  check(reallyGone, 'bookmark actually deleted from Chrome');

  // Undo: the bookmark comes back.
  const undoCenter = await evaluate(`(() => {
    const el = document.querySelector('#toast button');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await click(undoCenter.x, undoCenter.y);
  await cdp.sleep(UNDO_APPLY_MS);
  const restored = await evaluate(
    `chrome.bookmarks.search({ url: ${JSON.stringify(TEST_URL)} }).then((r) => r.length === 1)`,
  );
  check(restored, 'Undo restores the bookmark in Chrome');
  const toastGone = await evaluate(`!document.querySelector('#toast')`);
  check(toastGone, 'toast leaves once Undo is taken');
} finally {
  // Leave the corpus exactly as found.
  await evaluate(`(async () => {
    const found = await chrome.bookmarks.search({ url: ${JSON.stringify(TEST_URL)} });
    for (const node of found) await chrome.bookmarks.remove(node.id);
    return true;
  })()`).catch(() => undefined);
  c.close();
  await cdp.closeTab(tab.id);
}

process.exit(failed);
