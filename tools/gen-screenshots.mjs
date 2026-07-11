// Chrome Web Store screenshots (1280x800) into docs/store/assets/.
//   shot-1-search-light.png  popup, ranked results, top result's card bloomed
//   shot-2-search-dark.png   ranked list, dark
//   shot-3-onboarding.png    the first-run hero, captured at store size directly
// Popup surfaces are captured at 2x and composited centered on a soft canvas
// (raw UI, no marketing text — CWS wants the actual experience).
// Search shots WAIT for ranked results (expected top hit + browse controls
// gone) instead of sleeping — a cold model once lost that race and froze
// browse-at-rest rows into the committed PNG. They throw rather than write a
// wrong-state image.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const OUT = resolve(CONFIG.root, 'docs/store/assets');
const CANVAS = { width: 1280, height: 800 };
const POPUP_VIEW = { width: 380, height: 520 };
const POLL_MS = 300;
const RESULTS_MAX_WAIT_MS = 30000;
/** After first rows land: semantic re-rank + favicon fill-in settle. */
const SETTLE_MS = 1500;
/** Pointer dwell (550ms) + expand spring (380ms) + slack. */
const EXPAND_SETTLE_MS = 1400;
const POPUP_TARGET_HEIGHT = 720;
const CORNER_RADIUS = 24;

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

async function capture(url, { view, scale, dark, query, expectTop, hoverTop }) {
  const tab = await cdp.createTab(url);
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
  try {
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
    });
    await c.send('Emulation.setDeviceMetricsOverride', {
      ...view,
      deviceScaleFactor: scale,
      mobile: false,
    });
    if (query) {
      // An input event dispatched before popup.js attaches its listener is
      // simply lost — the popup then initializes into browse-at-rest and stays
      // there (the cause of a once-committed wrong screenshot). So: keep
      // re-typing (idempotent) until the UI is actually in search mode
      // (browse controls gone), then wait for the expected top hit to rank.
      const type = `(() => { const i = document.querySelector('#query'); if (!i) return false; i.value = ${JSON.stringify(query)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
      const read = `(() => ({
        searching: document.querySelector('#browse-controls').hidden &&
          document.querySelectorAll('#results .row').length > 0,
        hit: [...document.querySelectorAll('#results .row .detail-url-text')].slice(0, 3)
          .some((el) => el.textContent.includes(${JSON.stringify(expectTop)})),
      }))()`;
      await evaluate(type);
      let ok = false;
      for (let waited = 0; waited < RESULTS_MAX_WAIT_MS && !ok; waited += POLL_MS) {
        const state = await evaluate(read);
        ok = state.searching && state.hit;
        if (!ok) {
          if (!state.searching) await evaluate(type);
          await cdp.sleep(POLL_MS);
        }
      }
      if (!ok) throw new Error(`search "${query}" never ranked ${expectTop} into the top rows`);
      await cdp.sleep(SETTLE_MS);
      if (hoverTop) {
        const point = await evaluate(`(() => {
          const r = document.querySelector('#results .row')?.getBoundingClientRect();
          return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
        })()`);
        if (!point) throw new Error('no first row to hover');
        await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
        await cdp.sleep(EXPAND_SETTLE_MS);
        const expanded = await evaluate(
          `document.querySelectorAll('#results .row.expanded').length`,
        );
        if (expanded !== 1) throw new Error(`expected 1 bloomed card, saw ${expanded}`);
      }
    } else {
      await cdp.sleep(SETTLE_MS);
    }
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  } finally {
    c.close();
    await cdp.closeTab(tab.id);
  }
}

function canvasSvg(dark) {
  const [top, bottom] = dark ? ['#1d2634', '#12161f'] : ['#eef2f9', '#dde5f2'];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/>
    </linearGradient></defs>
    <rect width="1280" height="800" fill="url(#g)"/>
  </svg>`);
}

async function popupShot(name, options) {
  const raw = await capture(`chrome-extension://${ext.id}/popup.html`, {
    view: POPUP_VIEW,
    scale: 2,
    ...options,
  });
  const meta = await sharp(raw).metadata();
  const height = POPUP_TARGET_HEIGHT;
  const width = Math.round((meta.width / meta.height) * height);
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${CORNER_RADIUS}"/></svg>`,
  );
  const panel = await sharp(raw)
    .resize(width, height)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const file = resolve(OUT, name);
  const out = await sharp(canvasSvg(options.dark))
    .composite([
      {
        input: panel,
        left: Math.round((CANVAS.width - width) / 2),
        top: Math.round((CANVAS.height - height) / 2),
      },
    ])
    .png()
    .toBuffer();
  writeFileSync(file, out);
  console.log(file);
}

await popupShot('shot-1-search-light.png', {
  dark: false,
  query: 'ai agent',
  expectTop: 'botpress.com',
  hoverTop: true,
});
await popupShot('shot-2-search-dark.png', {
  dark: true,
  query: 'ai chat',
  expectTop: 'lmarena.ai',
});

const hero = await capture(`chrome-extension://${ext.id}/onboarding.html`, {
  view: CANVAS,
  scale: 1,
  dark: false,
});
writeFileSync(resolve(OUT, 'shot-3-onboarding.png'), hero);
console.log(resolve(OUT, 'shot-3-onboarding.png'));
