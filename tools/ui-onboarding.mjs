// Onboarding-page checks for the ONE guided path: hero copy → "Here's what
// I'll learn" chooser (folder checklist + crawl consent as the MAIN flow) →
// learning progress + pin-me card → "All set." + Try-it-now handoff. Also:
// prefs writing through the SW, exclusion actually purging records (and
// re-inclusion restoring them via ?customize), and chrome.action.openPopup()
// working from an extension tab on this Chromium. Seeds a disposable folder +
// bookmark and cleans them up. Usage: node tools/ui-onboarding.mjs [--dark]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const dark = process.argv.includes('--dark');
const PAGE_VIEW = { width: 1000, height: 700 };
const SETTLE_MS = 400;
const APPLY_TIMEOUT_MS = 20000;
const SEED_FOLDER_TITLE = 'BSS Onboarding Test';
const SEED_URL = 'https://bss-onboarding-test.invalid/';

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

const connect = async (url) => {
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
  const clickCenter = async (selector) => {
    const pt = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!pt) throw new Error(`no element for ${selector}`);
    const base = { x: pt.x, y: pt.y, button: 'left', clickCount: 1 };
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  };
  return { tab, c, evaluate, clickCenter };
};

const until = async (fn, timeoutMs = APPLY_TIMEOUT_MS, stepMs = 500) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await cdp.sleep(stepMs);
  }
};

const shoot = async (entry, name) => {
  mkdirSync(resolve(CONFIG.root, 'tools/screenshots'), { recursive: true });
  const file = resolve(
    CONFIG.root,
    `tools/screenshots/onboarding-${name}-${dark ? 'dark' : 'light'}.png`,
  );
  const shot = await entry.c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`shot  ${file}`);
};

// Probe: an extension page with chrome.* APIs, used for seeding + assertions.
const probe = await connect(`chrome-extension://${ext.id}/popup.html`);
const getPrefs = async () =>
  (await probe.evaluate(`chrome.runtime.sendMessage({ type: 'get-prefs' })`)).prefs;
const browseHasSeed = () =>
  probe.evaluate(
    `chrome.runtime.sendMessage({ type: 'browse', sort: 'recent' })
       .then((r) => r.hits.some((h) => h.url === ${JSON.stringify(SEED_URL)}))`,
  );

const closeTabQuiet = async (entry) => {
  try {
    entry.c.close();
    await cdp.closeTab(entry.tab.id);
  } catch {
    /* the ?customize page closes itself after Save — already gone is fine */
  }
};

let seedFolderId = null;
let onboard = null;
let customizePage = null;
let popupTargetId = null;
try {
  // -- seed a disposable folder (a container child → a chooser row) --
  seedFolderId = await probe.evaluate(`(async () => {
    const found = (await chrome.bookmarks.search({ title: ${JSON.stringify(SEED_FOLDER_TITLE)} }))
      .find((n) => !n.url);
    const folder = found ?? (await chrome.bookmarks.create({ title: ${JSON.stringify(SEED_FOLDER_TITLE)} }));
    const existing = await chrome.bookmarks.search({ url: ${JSON.stringify(SEED_URL)} });
    if (!existing.length) {
      await chrome.bookmarks.create({ parentId: folder.id, title: 'BSS onboarding seed', url: ${JSON.stringify(SEED_URL)} });
    }
    return folder.id;
  })()`);
  check(!!seedFolderId, 'seeded disposable folder + bookmark', `folder ${seedFolderId}`);
  await until(browseHasSeed); // let the sync-triggered pass ingest the seed first

  // -- stage 1, hero: approved copy, ONE primary action, everything else off stage --
  onboard = await connect(`chrome-extension://${ext.id}/onboarding.html`);
  await onboard.c.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
  });
  await onboard.c.send('Emulation.setDeviceMetricsOverride', {
    ...PAGE_VIEW,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.sleep(SETTLE_MS);
  const hero = await onboard.evaluate(`(() => ({
    h1: document.querySelector('#headline')?.textContent ?? '',
    sub: document.querySelector('#sub')?.textContent?.trim() ?? '',
    start: document.querySelector('#start')?.textContent ?? '',
    foot: document.querySelector('#foot')?.textContent ?? '',
    footVisible: !!document.querySelector('#foot')?.offsetParent,
    noCustomizeLink: !document.querySelector('#customize'),
    chooserHidden: !document.querySelector('#chooser').offsetParent,
    progressHidden: !document.querySelector('#progress').offsetParent,
    pinHidden: !document.querySelector('#pin-card').offsetParent,
    tryNowHidden: !document.querySelector('#try-now').offsetParent,
  }))()`);
  check(
    hero.h1 === 'The easiest way to find your bookmarks',
    'headline is the approved copy',
    JSON.stringify(hero.h1),
  );
  check(
    hero.sub === 'Find your bookmarks like a simple Google search. It just works.',
    'subline is the approved copy (store-description variant)',
    JSON.stringify(hero.sub.slice(0, 50)),
  );
  check(
    hero.start === 'Get started' && hero.noCustomizeLink,
    'ONE primary action (chooser is the main flow, not a link)',
  );
  check(
    hero.foot === 'Free · Private · Local' && hero.footVisible,
    'microcopy footer exact and visible on the hero',
    JSON.stringify(hero.foot),
  );
  check(
    hero.chooserHidden && hero.progressHidden && hero.pinHidden && hero.tryNowHidden,
    'later stages start off stage',
  );
  await shoot(onboard, 'hero');

  // -- stage 2, chooser IS the main flow: all included, crawl on, friendly CTA --
  await onboard.clickCenter('#start');
  await cdp.sleep(SETTLE_MS);
  const chooser = await onboard.evaluate(`(() => {
    const rows = [...document.querySelectorAll('#folder-list .folder-row')].map((row) => ({
      id: row.querySelector('input').value,
      title: row.querySelector('.folder-title').textContent,
      count: row.querySelector('.folder-count').textContent,
      checked: row.querySelector('input').checked,
    }));
    return {
      h1: document.querySelector('#headline')?.textContent ?? '',
      heroHidden: !document.querySelector('#hero-actions').offsetParent,
      chooserHidden: !document.querySelector('#chooser').offsetParent,
      footGone: !document.querySelector('#foot').offsetParent,
      rows,
      crawlChecked: document.querySelector('#crawl').checked,
      begin: document.querySelector('#begin')?.textContent ?? '',
    };
  })()`);
  check(
    chooser.h1 === 'Here’s what I’ll learn' && chooser.heroHidden && !chooser.chooserHidden,
    'Get started leads INTO the chooser (headline swaps)',
    JSON.stringify(chooser.h1),
  );
  check(chooser.footGone, 'microcopy footer leaves with the hero (pitch-only)');
  const seedRow = chooser.rows.find((row) => row.id === seedFolderId);
  check(
    chooser.rows.length >= 1 && !!seedRow && seedRow.count === '1',
    'folder checklist lists top-level folders with counts',
    `${chooser.rows.length} rows; seed ${JSON.stringify(seedRow)}`,
  );
  check(
    chooser.rows.every((row) => row.checked) && chooser.crawlChecked,
    'everything included + crawl consent ON by default',
  );
  check(
    chooser.begin === 'Start learning',
    'CTA is personified ("Start learning", never index/scan)',
    JSON.stringify(chooser.begin),
  );
  await shoot(onboard, 'chooser');

  // -- stage 3, learning: exclude the seed folder, start, pin card on stage --
  await onboard.clickCenter(`#folder-list input[value="${seedFolderId}"]`);
  await onboard.clickCenter('#begin');
  await cdp.sleep(SETTLE_MS);
  const learning = await onboard.evaluate(`(async () => ({
    h1: document.querySelector('#headline')?.textContent ?? '',
    chooserGone: !document.querySelector('#chooser').offsetParent,
    pinVisible: !!document.querySelector('#pin-card').offsetParent,
    pinTitle: document.querySelector('#pin-title')?.textContent ?? '',
    barVisible: !!document.querySelector('#learn-bar')?.offsetParent,
    tickerVisible: !!document.querySelector('#ticker')?.offsetParent,
    tickerText: document.querySelector('#ticker-text')?.textContent ?? '',
    tickerIconSet: (document.querySelector('#ticker-icon')?.src ?? '').includes('_favicon'),
    alreadyPinned: (await chrome.action.getUserSettings()).isOnToolbar,
  }))()`);
  check(
    (learning.h1 === 'Learning your bookmarks' || learning.h1 === 'All set.') &&
      learning.chooserGone,
    'Start learning moves to the learning stage (chooser leaves)',
    JSON.stringify(learning.h1),
  );
  check(
    learning.h1 === 'All set.'
      ? // A small pass can be done before this check runs — the show must be over.
        !learning.barVisible && !learning.tickerVisible
      : learning.barVisible &&
          learning.tickerVisible &&
          learning.tickerText.length > 0 &&
          learning.tickerIconSet,
    'learning shows the progress bar + a real bookmark on the ticker (gone once ready)',
    JSON.stringify({
      bar: learning.barVisible,
      ticker: learning.tickerVisible,
      reading: learning.tickerText.slice(0, 40),
    }),
  );
  check(
    learning.alreadyPinned
      ? !learning.pinVisible
      : learning.pinVisible &&
          // Title settles from "While I work…" once learning finishes — a small
          // library can reach "All set." before this check runs.
          (learning.pinTitle.startsWith('While I work') ||
            learning.pinTitle === 'Pin me to your toolbar'),
    'pin-me card shows exactly when unpinned',
    `pinned ${learning.alreadyPinned}, visible ${learning.pinVisible}`,
  );
  await shoot(onboard, 'learning');
  const prefsAfter = await getPrefs();
  check(
    prefsAfter.crawlEnabled && prefsAfter.excludedFolderIds.includes(seedFolderId),
    'complete-onboarding persisted the choices through the SW',
    JSON.stringify(prefsAfter),
  );
  const purged = await until(async () => !(await browseHasSeed()));
  check(!!purged, 'excluded folder leaves the index (record purged)');

  // -- stage 4, ready: All set + Try it now; openPopup verified on this Chromium --
  const ready = await until(
    () =>
      onboard.evaluate(
        `document.querySelector('#headline')?.textContent === 'All set.' &&
         !!document.querySelector('#try-now').offsetParent`,
      ),
    APPLY_TIMEOUT_MS,
  );
  check(!!ready, 'ready stage: "All set." + Try it now on stage');
  // The pin teaching is STICKY: fast learning must not take the card with it.
  const readyPin = await onboard.evaluate(`(async () => ({
    pinVisible: !!document.querySelector('#pin-card').offsetParent,
    pinTitle: document.querySelector('#pin-title')?.textContent ?? '',
    pinned: (await chrome.action.getUserSettings()).isOnToolbar,
    showGone: !document.querySelector('#learn-bar')?.offsetParent &&
      !document.querySelector('#ticker')?.offsetParent,
  }))()`);
  check(
    readyPin.pinned
      ? !readyPin.pinVisible
      : readyPin.pinVisible && readyPin.pinTitle === 'Pin me to your toolbar',
    'pin card persists on "All set." until pinned (settled title)',
    JSON.stringify(readyPin),
  );
  check(readyPin.showGone, 'progress bar + ticker leave once ready');
  await shoot(onboard, 'ready');

  const targetsBefore = (await cdp.listTargets()).map((t) => t.id);
  await onboard.clickCenter('#try-now');
  await cdp.sleep(1200);
  const popupTarget = (await cdp.listTargets()).find(
    (t) => !targetsBefore.includes(t.id) && t.url.endsWith('popup.html'),
  );
  popupTargetId = popupTarget?.id ?? null;
  const fellBack = await onboard.evaluate(
    `document.querySelector('#sub')?.textContent?.includes('toolbar') ?? false`,
  );
  check(
    !!popupTarget || fellBack,
    'Try it now opens the popup (or falls back to pointing at the toolbar)',
    popupTarget ? 'chrome.action.openPopup() worked' : 'fallback path shown',
  );

  // -- settings re-entry (?customize): state round-trips, Save restores --
  customizePage = await connect(`chrome-extension://${ext.id}/onboarding.html?customize`);
  await cdp.sleep(SETTLE_MS);
  const customizeState = await customizePage.evaluate(`(() => ({
    h1: document.querySelector('#headline')?.textContent ?? '',
    heroHidden: !document.querySelector('#hero-actions').offsetParent,
    chooserHidden: !document.querySelector('#chooser').offsetParent,
    pinHidden: !document.querySelector('#pin-card').offsetParent,
    begin: document.querySelector('#begin')?.textContent ?? '',
    seedChecked: document.querySelector('#folder-list input[value="${seedFolderId}"]')?.checked,
  }))()`);
  check(
    customizeState.h1 === 'Choose what to include' &&
      customizeState.heroHidden &&
      !customizeState.chooserHidden &&
      customizeState.pinHidden &&
      customizeState.begin === 'Save',
    '?customize goes straight to the chooser (Save, no hero, no pin card)',
    JSON.stringify(customizeState.h1),
  );
  check(customizeState.seedChecked === false, 'stored exclusion shows as unchecked');
  await customizePage.clickCenter(`#folder-list input[value="${seedFolderId}"]`);
  await customizePage.clickCenter('#begin');
  const restoredPrefs = await until(async () => {
    const prefs = await getPrefs();
    return prefs.excludedFolderIds.length === 0 ? prefs : null;
  });
  check(!!restoredPrefs, 'Save writes the re-inclusion back to prefs');
  const restored = await until(browseHasSeed);
  check(!!restored, 're-included folder returns to the index');
} finally {
  if (seedFolderId) {
    await probe
      .evaluate(`chrome.bookmarks.removeTree(${JSON.stringify(seedFolderId)})`)
      .catch(() => {});
  }
  if (popupTargetId) await cdp.closeTab(popupTargetId).catch(() => {});
  for (const entry of [onboard, customizePage, probe]) {
    if (entry) await closeTabQuiet(entry);
  }
}

process.exit(failed);
