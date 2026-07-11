// Settings-screen checks: the gear swaps the whole search surface for a
// second screen (back chevron + title + grouped rows), the back button and
// Escape both return to search with the input refocused, and nothing from the
// search surface bleeds through. Screenshots the settings screen per theme.
// Usage: node tools/ui-settings.mjs [--dark]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const dark = process.argv.includes('--dark');
const POPUP_VIEW = { width: 380, height: 520 };
// View swap is a 140ms slide — generous slack keeps the checks honest.
const VIEW_SETTLE_MS = 400;

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

// Real left click at the element's center — exercises the actual input path.
const clickCenter = async (selector) => {
  const pt = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!pt) throw new Error(`no element for ${selector}`);
  const base = { x: pt.x, y: pt.y, button: 'left', clickCount: 1 };
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
};

const viewState = () =>
  evaluate(`(() => ({
    searchHidden: document.querySelector('#search-view').hidden,
    settingsHidden: document.querySelector('#settings-view').hidden,
    queryVisible: !!document.querySelector('#query')?.offsetParent,
    closeVisible: !!document.querySelector('#close')?.offsetParent,
    title: document.querySelector('#settings-title')?.textContent ?? '',
    rowNames: [...document.querySelectorAll('#settings .settings-row .name')].map(
      (n) => n.textContent,
    ),
    focused: document.activeElement?.id ?? '',
  }))()`);

const centerOf = (selector) =>
  evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);

try {
  await c.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
  });
  await c.send('Emulation.setDeviceMetricsOverride', {
    ...POPUP_VIEW,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.sleep(VIEW_SETTLE_MS);

  // Gear → settings screen replaces the search surface entirely.
  const gearCenter = await centerOf('#gear');
  await clickCenter('#gear');
  await cdp.sleep(VIEW_SETTLE_MS);
  const open = await viewState();
  check(
    open.searchHidden && !open.settingsHidden && !open.queryVisible,
    'gear swaps to the settings screen (search surface fully leaves)',
    `searchHidden ${open.searchHidden}, queryVisible ${open.queryVisible}`,
  );
  check(
    open.closeVisible && open.title === 'Settings',
    'minimal header: title + close X',
    `title ${JSON.stringify(open.title)}`,
  );
  // The exit must sit in the entrance's pixel slot — zero pointer travel.
  const closeCenter = await centerOf('#close');
  const travel =
    gearCenter && closeCenter
      ? Math.hypot(closeCenter.x - gearCenter.x, closeCenter.y - gearCenter.y)
      : Infinity;
  check(travel <= 1, 'close X occupies the gear’s exact slot', `travel ${travel.toFixed(2)}px`);
  check(
    ['Read page content', 'Included folders', 'Rebuild index', 'Reset data'].every((name) =>
      open.rowNames.includes(name),
    ),
    'settings rows present (prefs mirror + maintenance)',
    open.rowNames.join(', '),
  );
  // The crawl toggle fills its label from stored prefs (async, but fast).
  const crawlLabel = await evaluate(
    `document.querySelector('#settings .settings-row .settings-btn')?.textContent ?? ''`,
  );
  check(
    crawlLabel === 'On' || crawlLabel === 'Off',
    'crawl toggle reflects stored consent',
    JSON.stringify(crawlLabel),
  );

  mkdirSync(resolve(CONFIG.root, 'tools/screenshots'), { recursive: true });
  const file = resolve(CONFIG.root, `tools/screenshots/settings-${dark ? 'dark' : 'light'}.png`);
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`shot  ${file}`);

  // Close X returns to search and refocuses the input.
  await clickCenter('#close');
  await cdp.sleep(VIEW_SETTLE_MS);
  const closed = await viewState();
  check(
    !closed.searchHidden && closed.settingsHidden && closed.queryVisible,
    'close X returns to the search screen',
  );
  check(closed.focused === 'query', 'input refocused on return', `focused #${closed.focused}`);

  // Escape (real key, no input focus — the input is hidden) also returns.
  await clickCenter('#gear');
  await cdp.sleep(VIEW_SETTLE_MS);
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await cdp.sleep(VIEW_SETTLE_MS);
  const escaped = await viewState();
  check(
    !escaped.searchHidden && escaped.settingsHidden,
    'Escape returns to the search screen (popup stays open)',
  );

  // Shell facts on the search screen: identity header + the footer's count.
  const shell = await evaluate(`(() => ({
    name: document.querySelector('#app-name')?.textContent ?? '',
    markVisible: !!document.querySelector('#app-mark'),
    gearVisible: !!document.querySelector('#gear')?.offsetParent,
    count: document.querySelector('#count')?.textContent ?? '',
  }))()`);
  check(
    shell.name === 'Starry' && shell.markVisible && shell.gearVisible,
    'app header shows mark + name + gear',
    shell.name,
  );
  check(
    /^[\d,]+ bookmarks$/.test(shell.count),
    'footer shows the indexed count',
    JSON.stringify(shell.count),
  );
} finally {
  c.close();
  await cdp.closeTab(tab.id);
}

process.exit(failed);
