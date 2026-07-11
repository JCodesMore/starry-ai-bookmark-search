// Hover-expand checks: a real CDP mouse dwell blooms the detail card, the row
// stays put under the pointer (no scroll, no top-shift), leaving collapses it
// snappily, the exact-date tooltip appears, keyboard selection blooms the same
// way, and overflowing URLs marquee. Screenshots the expanded state per theme.
// Usage: node tools/ui-hover.mjs [query] [--dark]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const query = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'github';
const dark = process.argv.includes('--dark');
/** Poll step / ceiling while waiting for first results (cold SW boots slowly). */
const SEARCH_POLL_MS = 300;
const SEARCH_MAX_WAIT_MS = 8000;
// Pointer dwell (550ms) + expand spring (380ms) + slack.
const EXPAND_SETTLE_MS = 1300;
// Keyboard dwell (260ms) + expand spring (380ms) + slack.
const KEY_SETTLE_MS = 1000;
// Collapse duration (160ms) + hover-recompute slack.
const COLLAPSE_SETTLE_MS = 500;
// Tooltip delay (320ms) + fade + slack.
const TOOLTIP_SETTLE_MS = 700;
const POPUP_VIEW = { width: 380, height: 520 };
/** An expansion that adds less than this many px didn't actually reveal a card. */
const MIN_GROWTH_PX = 30;
/** The hovered row's top edge may not move more than this during the bloom. */
const MAX_TOP_DRIFT_PX = 1;
const ARROW = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 };

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

const shoot = async (name) => {
  mkdirSync(resolve(CONFIG.root, 'tools/screenshots'), { recursive: true });
  const file = resolve(CONFIG.root, `tools/screenshots/${name}-${dark ? 'dark' : 'light'}.png`);
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`shot  ${file}`);
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
  await evaluate(
    `(() => { const i = document.querySelector('#query'); i.value = ${JSON.stringify(query)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );
  // Wait for rows (a just-reloaded SW can take seconds to boot), then a beat
  // more so the semantic re-rank settles and rows stop reordering.
  for (let waited = 0; waited < SEARCH_MAX_WAIT_MS; waited += SEARCH_POLL_MS) {
    if ((await evaluate(`document.querySelectorAll('#results .row').length`)) > 0) break;
    await cdp.sleep(SEARCH_POLL_MS);
  }
  await cdp.sleep(SEARCH_POLL_MS * 3);

  // Target the rendered row with the longest URL so the marquee case is real.
  const target = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('#results .row')];
    if (!rows.length) return null;
    let best = 0;
    rows.forEach((row, i) => {
      const url = row.querySelector('.detail-url-text')?.textContent ?? '';
      const bestUrl = rows[best].querySelector('.detail-url-text')?.textContent ?? '';
      if (url.length > bestUrl.length) best = i;
    });
    rows[best].scrollIntoView({ block: 'center' });
    const r = rows[best].getBoundingClientRect();
    return { index: best, x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top,
             height: r.height,
             url: rows[best].querySelector('.detail-url-text')?.textContent ?? '' };
  })()`);
  check(!!target, 'search returned rows', target ? `hover target row ${target.index}` : '');
  if (!target) process.exit(1);

  // Real mouse dwell over the target row.
  await mouse(target.x, target.y);
  await cdp.sleep(EXPAND_SETTLE_MS);

  const hover = await evaluate(`(() => {
    const expanded = [...document.querySelectorAll('#results .row.expanded')];
    const row = expanded[0];
    if (!row) return { count: 0 };
    const rows = [...document.querySelectorAll('#results .row')];
    const rect = row.getBoundingClientRect();
    return {
      count: expanded.length,
      index: rows.indexOf(row),
      top: rect.top,
      height: rect.height,
      selected: row.classList.contains('selected'),
      url: row.querySelector('.detail-url-text')?.textContent ?? '',
      hasFoot: !!row.querySelector('.detail-foot'),
      added: row.querySelector('.detail-added')?.textContent ?? '',
      exact: row.querySelector('.detail-added')?.dataset.exact ?? '',
      marquee: !!row.querySelector('.detail-url-text.marquee'),
      urlOverflow: (() => {
        const box = row.querySelector('.detail-url');
        const text = row.querySelector('.detail-url-text');
        return box && text ? text.scrollWidth - box.clientWidth : 0;
      })(),
      addedRect: (() => {
        const el = row.querySelector('.detail-added');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })(),
    };
  })()`);
  check(
    hover.count === 1 && hover.index === target.index,
    'mouse dwell blooms the hovered row (and only it)',
    `expanded ${hover.count} row(s), index ${hover.index}`,
  );
  check(hover.selected, 'hover also selects the row (single selection model)');
  check(
    hover.height - target.height >= MIN_GROWTH_PX,
    'card actually reveals content',
    `${Math.round(target.height)}px → ${Math.round(hover.height)}px`,
  );
  // THE pointer-stability guarantee: the bloom grows strictly downward and
  // never scrolls, so the row's top edge stays pinned under the cursor.
  check(
    Math.abs(hover.top - target.top) <= MAX_TOP_DRIFT_PX,
    'row does not move under the pointer while blooming',
    `top ${target.top.toFixed(1)} → ${hover.top.toFixed(1)}`,
  );
  check(hover.url === target.url && hover.hasFoot, 'card shows full URL + folder/date foot');
  check(hover.added.startsWith('Added '), 'date reads as prose', JSON.stringify(hover.added));
  if (hover.urlOverflow >= 12) {
    check(hover.marquee, 'overflowing URL gets the marquee', `overflow ${hover.urlOverflow}px`);
  } else {
    check(!hover.marquee, 'fitting URL stays still', `overflow ${hover.urlOverflow}px`);
  }

  await shoot('hover');

  // Exact-date tooltip: hover the "Added …" text inside the open card.
  if (hover.addedRect) {
    await mouse(hover.addedRect.x, hover.addedRect.y);
    await cdp.sleep(TOOLTIP_SETTLE_MS);
    const tip = await evaluate(`(() => {
      const el = document.querySelector('#results .row.expanded .detail-added');
      if (!el) return null;
      const style = getComputedStyle(el, '::after');
      return { opacity: style.opacity, content: style.content };
    })()`);
    check(
      !!tip && tip.opacity === '1' && tip.content.includes(hover.exact.slice(0, 10)),
      'hovering the date reveals the exact-date tooltip',
      tip ? `opacity ${tip.opacity}, ${tip.content.slice(0, 40)}…` : 'card lost',
    );
    await shoot('hover-tooltip');
  }

  // Leaving the row collapses its card immediately (snappy release).
  await mouse(POPUP_VIEW.width / 2, 40); // up to the input, well clear of rows
  await cdp.sleep(COLLAPSE_SETTLE_MS);
  const afterLeave = await evaluate(`document.querySelectorAll('#results .row.expanded').length`);
  check(afterLeave === 0, 'pointer leaving the row collapses the card', `${afterLeave} expanded`);

  // Scrolling is navigation: the wheel collapses the card instantly, and the
  // synthetic hover Chrome fires after a scroll (same client coords — the
  // pointer did not move) must not re-arm the bloom.
  await mouse(target.x, target.y);
  await cdp.sleep(EXPAND_SETTLE_MS);
  await c.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: target.x,
    y: target.y,
    deltaX: 0,
    deltaY: 120,
  });
  await cdp.sleep(300);
  const afterWheel = await evaluate(`document.querySelectorAll('#results .row.expanded').length`);
  check(afterWheel === 0, 'wheel scroll collapses the card', `${afterWheel} expanded`);
  await cdp.sleep(900); // > pointer dwell — a phantom hover would have bloomed
  const afterWait = await evaluate(`document.querySelectorAll('#results .row.expanded').length`);
  check(
    afterWait === 0,
    'no phantom re-bloom under a stationary pointer after scroll',
    `${afterWait} expanded`,
  );

  // Keyboard parity: two ArrowDowns from the (still selected) row → the bloom
  // follows the selection.
  await evaluate(`(() => { document.querySelector('#query').focus(); return true; })()`);
  for (let i = 0; i < 2; i++) {
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ARROW.key,
      code: ARROW.code,
      windowsVirtualKeyCode: ARROW.keyCode,
      nativeVirtualKeyCode: ARROW.keyCode,
    });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ARROW.key, code: ARROW.code });
  }
  await cdp.sleep(KEY_SETTLE_MS);
  const keyed = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('#results .row')];
    const expanded = rows.filter((r) => r.classList.contains('expanded'));
    return {
      count: expanded.length,
      expandedIsSelected: expanded[0]?.classList.contains('selected') ?? false,
      index: rows.indexOf(expanded[0]),
    };
  })()`);
  const wantIndex =
    (target.index + 2) % (await evaluate(`document.querySelectorAll('#results .row').length`));
  check(
    keyed.count === 1 && keyed.expandedIsSelected && keyed.index === wantIndex,
    'keyboard selection blooms the same way (old card closes)',
    `expanded ${keyed.count} row(s) at index ${keyed.index}, want ${wantIndex}`,
  );
} finally {
  c.close();
  await cdp.closeTab(tab.id);
}

process.exit(failed);
