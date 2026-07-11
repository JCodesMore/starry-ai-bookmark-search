// First-run onboarding — ONE guided path (docs/design/ux-blueprint.md):
// hero pitch → "here's what I'll learn" (folder checklist + crawl consent as
// the MAIN flow, not a hidden option) → live learning progress with the pin-me
// card → all set + first-search handoff. Doubles as the "choose what to
// include" screen when opened with ?customize (settings links here). The page
// only renders choices and reads the bookmarks tree — every decision is
// written through the SW's messages so there is exactly one prefs writer.
import type {
  CompleteOnboardingMessage,
  GetPrefsMessage,
  IndexStateResponse,
  PrefsResponse,
  SetPrefsMessage,
} from '../lib/messages';
import type { Prefs } from '../core/prefs';
import {
  bookmarkPeeks,
  topLevelFolders,
  type BookmarkPeek,
  type FolderChoice,
} from '../lib/folders';
import { faviconUrl } from '../lib/favicon';
import { releaseCrawlPermission, requestCrawlPermission } from '../lib/crawl-permission';
import { INDEX_PHASE } from '../core/types';
import { settlePinTitle, watchPinState } from './pinCard';

const POLL_MS = 1000;
const DOWNLOAD_DONE_PCT = 100;
const PCT_MAX = 100;
const CLOSE_AFTER_SAVE_MS = 600;
/** How long each "now reading" bookmark stays on the ticker. */
const TICKER_SWAP_MS = 1200;

const headline = document.querySelector<HTMLHeadingElement>('#headline');
const sub = document.querySelector<HTMLParagraphElement>('#sub');
const heroActions = document.querySelector<HTMLDivElement>('#hero-actions');
const start = document.querySelector<HTMLButtonElement>('#start');
const chooser = document.querySelector<HTMLElement>('#chooser');
const folderList = document.querySelector<HTMLDivElement>('#folder-list');
const crawl = document.querySelector<HTMLInputElement>('#crawl');
const begin = document.querySelector<HTMLButtonElement>('#begin');
const progress = document.querySelector<HTMLParagraphElement>('#progress');
const tryNow = document.querySelector<HTMLButtonElement>('#try-now');
const foot = document.querySelector<HTMLParagraphElement>('#foot');
const learnBar = document.querySelector<HTMLDivElement>('#learn-bar');
const learnFill = document.querySelector<HTMLDivElement>('#learn-fill');
const ticker = document.querySelector<HTMLDivElement>('#ticker');
const tickerIcon = document.querySelector<HTMLImageElement>('#ticker-icon');
const tickerText = document.querySelector<HTMLSpanElement>('#ticker-text');
if (
  !headline ||
  !sub ||
  !heroActions ||
  !start ||
  !chooser ||
  !folderList ||
  !crawl ||
  !begin ||
  !progress ||
  !tryNow ||
  !foot ||
  !learnBar ||
  !learnFill ||
  !ticker ||
  !tickerIcon ||
  !tickerText
) {
  throw new Error('onboarding markup missing a required element');
}

/** Settings re-entry: same page, no hero pitch, straight to the chooser. */
const customizing = new URLSearchParams(location.search).has('customize');

// --- prefs plumbing (all through the SW) ---

async function fetchPrefs(): Promise<Prefs> {
  const message: GetPrefsMessage = { type: 'get-prefs' };
  const res = (await chrome.runtime.sendMessage(message)) as PrefsResponse;
  return res.prefs;
}

async function savePrefs(prefs: Prefs): Promise<void> {
  const message: SetPrefsMessage = { type: 'set-prefs', prefs };
  await chrome.runtime.sendMessage(message);
}

/** First-run completion: prefs + the onboarded latch + the first index pass,
 * in one message — the ONLY way index work ever begins on a fresh install. */
async function completeOnboarding(prefs: Prefs): Promise<void> {
  const message: CompleteOnboardingMessage = { type: 'complete-onboarding', prefs };
  await chrome.runtime.sendMessage(message);
}

// --- folder checklist ---

function folderRow(choice: FolderChoice, included: boolean): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'folder-row';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = included;
  box.value = choice.id;
  const title = document.createElement('span');
  title.className = 'folder-title';
  title.textContent = choice.title;
  const count = document.createElement('span');
  count.className = 'folder-count';
  count.textContent = choice.count.toLocaleString();
  row.append(box, title, count);
  return row;
}

/** Bookmarks in the whole library — 0 means a brand-new profile, which gets
 * its own gentler flow (nothing to choose, no learning stage to flash by). */
let libraryCount = 0;

/** The bookmarks tree, cached at load — the learning ticker samples it. */
let cachedTree: chrome.bookmarks.BookmarkTreeNode[] = [];

/** Filled eagerly on load so revealing the chooser is instant. */
async function fillChooser(): Promise<void> {
  const [prefs, tree] = await Promise.all([fetchPrefs(), chrome.bookmarks.getTree()]);
  cachedTree = tree;
  if (!crawl || !folderList) return;
  crawl.checked = prefs.crawlEnabled;
  const excluded = new Set(prefs.excludedFolderIds);
  const choices = topLevelFolders(tree);
  libraryCount = choices.reduce((sum, choice) => sum + choice.count, 0);
  if (!libraryCount) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = 'No bookmarks yet — I’ll learn each one automatically as you save it.';
    folderList.replaceChildren(note);
    if (begin && !customizing) begin.textContent = 'Sounds good';
    return;
  }
  folderList.replaceChildren(
    ...choices.map((choice) => folderRow(choice, !excluded.has(choice.id))),
  );
}

function chosenPrefs(): Prefs {
  const excludedFolderIds = folderList
    ? [...folderList.querySelectorAll<HTMLInputElement>('input')]
        .filter((box) => !box.checked)
        .map((box) => box.value)
    : [];
  return { crawlEnabled: crawl?.checked ?? true, excludedFolderIds };
}

// --- the learning show (progress bar + a ticker of real bookmarks being read
// — the wait should feel like watching it work, not staring at a number) ---

/** Shuffled sample of the bookmarks this pass is learning (exclusions pruned). */
let tickerPool: BookmarkPeek[] = [];
let tickerIndex = 0;
let tickerTimer: ReturnType<typeof setInterval> | undefined;

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

function advanceTicker(): void {
  if (!ticker || !tickerIcon || !tickerText || !tickerPool.length) return;
  const peek = tickerPool[tickerIndex++ % tickerPool.length] as BookmarkPeek;
  tickerIcon.src = faviconUrl(peek.url);
  tickerText.textContent = peek.title;
  // Restart the file-in animation: remove, force reflow, re-add.
  ticker.classList.remove('swap');
  void ticker.offsetWidth;
  ticker.classList.add('swap');
}

function startTicker(): void {
  tickerPool = shuffle(bookmarkPeeks(cachedTree, new Set(chosenPrefs().excludedFolderIds)));
  if (!tickerPool.length || !ticker) return;
  ticker.hidden = false;
  advanceTicker();
  tickerTimer = setInterval(advanceTicker, TICKER_SWAP_MS);
}

function stopLearningShow(): void {
  clearInterval(tickerTimer);
  tickerTimer = undefined;
  if (ticker) ticker.hidden = true;
  if (learnBar) learnBar.hidden = true;
}

/** Bar fill: a percent, or null for "working, amount unknown" (indeterminate). */
function setBar(pct: number | null): void {
  if (!learnBar || !learnFill) return;
  learnBar.classList.toggle('indeterminate', pct === null);
  if (pct === null) learnFill.style.removeProperty('width');
  else learnFill.style.width = `${Math.min(PCT_MAX, Math.max(0, pct))}%`;
}

// --- steps (progressive disclosure: exactly one act on stage at a time) ---

function showChooser(): void {
  if (!headline || !sub || !heroActions || !chooser || !foot) return;
  headline.textContent = libraryCount ? 'Here’s what I’ll learn' : 'Nothing to learn just yet';
  sub.textContent = libraryCount
    ? 'Untick anything you’d rather keep out. Everything stays on your computer.'
    : 'That’s fine. Finish setup and I’ll pick up every bookmark you save from now on.';
  heroActions.hidden = true;
  chooser.hidden = false;
  foot.hidden = true; // the reassurance belongs to the pitch, not every screen
}

function showLearning(): void {
  if (!headline || !sub || !chooser || !progress || !learnBar) return;
  headline.textContent = 'Learning your bookmarks';
  sub.hidden = true;
  chooser.hidden = true;
  progress.hidden = false;
  learnBar.hidden = false;
  setBar(null); // indeterminate until the pass reports real numbers
  startTicker();
  watchPinState();
  void pollProgress();
}

function showReady(): void {
  if (!headline || !sub || !progress || !tryNow) return;
  stopLearningShow();
  headline.textContent = 'All set.';
  sub.textContent = 'Type what you remember and I’ll find it.';
  sub.hidden = false;
  progress.hidden = true;
  tryNow.hidden = false;
  // The pin card STAYS until actually pinned — learning may finish in seconds
  // on a small library, and the teaching must not vanish with it.
  settlePinTitle();
}

/** Brand-new profile: nothing was learned, so no counts and no "try a search"
 * hand-off — just the pin teaching and a promise about the future. */
function showReadyEmpty(): void {
  if (!headline || !sub || !chooser) return;
  chooser.hidden = true;
  headline.textContent = 'All set.';
  sub.textContent = 'Save a bookmark and I’ll learn it the moment it lands.';
  sub.hidden = false;
  watchPinState();
  settlePinTitle();
}

// --- progress (readiness = search genuinely usable; tagging and the page
// crawl refine results later and never block it) ---

/** Model-download percent, broadcast by the SW while fetching weights. */
let downloadPct: number | null = null;
chrome.runtime.onMessage.addListener((msg: unknown) => {
  const m = msg as { type?: string; pct?: number };
  if (m.type === 'embed-progress' && typeof m.pct === 'number') downloadPct = m.pct;
});

/** The status line + bar fill to show, or null once search is usable. The bar
 * carries the percent, so the line never repeats it. */
function progressView(state: IndexStateResponse): { line: string; pct: number | null } | null {
  if (downloadPct !== null && downloadPct < DOWNLOAD_DONE_PCT) {
    return { line: 'Setting things up…', pct: downloadPct };
  }
  const p = state.progress;
  // No progress yet + empty index = the pass simply hasn't written anything.
  if (!p) return state.recordCount ? null : { line: 'Setting things up…', pct: null };
  if (p.phase === INDEX_PHASE.Ingesting) return { line: 'Reading your library…', pct: null };
  if (p.phase === INDEX_PHASE.Embedding) {
    if (!p.total) return { line: 'Learning your bookmarks…', pct: null };
    return {
      line: `${p.processed.toLocaleString()} of ${p.total.toLocaleString()} learned`,
      pct: (p.processed / p.total) * PCT_MAX,
    };
  }
  return null;
}

async function pollProgress(): Promise<void> {
  const state = (await chrome.runtime.sendMessage({ type: 'index-state' })) as IndexStateResponse;
  const view = progressView(state);
  if (!progress) return;
  if (view === null) {
    // Latched: later enrichment phases must never regress "ready".
    showReady();
    return;
  }
  progress.textContent = view.line;
  setBar(view.pct);
  setTimeout(() => void pollProgress(), POLL_MS);
}

// --- first-search handoff ---

tryNow.addEventListener('click', () => {
  void chrome.action.openPopup().catch(() => {
    // Couldn't anchor the popup (window-state edge case) — point instead.
    if (!tryNow || !sub) return;
    tryNow.hidden = true;
    sub.textContent = 'Click the bookmark icon in your toolbar to start searching.';
  });
});

// --- flows ---

start.addEventListener('click', showChooser);

begin.addEventListener('click', () => {
  begin.disabled = true;
  // Permission FIRST, synchronously in the gesture — user activation does not
  // survive an earlier await. Already-granted (or dev-required) resolves true
  // with no prompt; a decline quietly unticks the crawl choice so the saved
  // prefs always match what the browser will actually allow.
  const wantsCrawl = crawl?.checked ?? true;
  const permission = wantsCrawl ? requestCrawlPermission() : releaseCrawlPermission();
  void permission.then((granted) => {
    if (wantsCrawl && !granted && crawl) crawl.checked = false;
    const prefs = chosenPrefs();
    if (customizing) {
      // Settings re-entry: already onboarded — this is just a prefs edit.
      void savePrefs(prefs).then(() => {
        if (!chooser || !progress) return;
        chooser.hidden = true;
        progress.hidden = false;
        progress.textContent = 'Saved';
        setTimeout(() => window.close(), CLOSE_AFTER_SAVE_MS);
      });
      return;
    }
    void completeOnboarding(prefs).then(() => (libraryCount ? showLearning() : showReadyEmpty()));
  });
});

if (customizing) {
  headline.textContent = 'Choose what to include';
  sub.hidden = true;
  heroActions.hidden = true;
  chooser.hidden = false;
  begin.textContent = 'Save';
  foot.hidden = true; // a settings surface, not the pitch
}
void fillChooser();
