// Popup: keyboard-first command palette (docs/design/ux-blueprint.md is the
// spec — verify changes against its 12 rules). Rendering + keyboard only;
// all ranking/indexing lives behind the message contracts.
import type {
  BrowseMessage,
  BrowseResponse,
  DeleteBookmarkMessage,
  IndexStateResponse,
  OpenResultMessage,
  RankedSearchResponse,
  RevealBookmarkMessage,
  SearchMessage,
} from '../lib/messages';
import { INDEX_PHASE, type IndexProgress, type ScoredHit } from '../core/types';
import { SEARCH_LIMIT } from '../core/search';
import { tokenize } from '../lib/text';
import { initBrowseControls } from './browseControls';
import { closeContextMenu, isMenuOpen, openContextMenu } from './contextMenu';
import { closeDropdown } from './dropdown';
import { describeCount, describeProgress } from './statusLine';
import { buildDetails, setExpanded } from './rowDetails';
import { renderSettings } from './settingsView';
import { showToast, showUndoToast } from './undoToast';
import {
  actionButton,
  applyStoredIcon,
  copyActionButton,
  deadMark,
  domainOf,
  faviconUrl,
  highlight,
  OPEN_ICON,
  reasonChip,
} from './rowBits';

const SEARCH_DEBOUNCE_MS = 120;
const SEMANTIC_RETRY_MS = 1200;
const STATUS_POLL_MS = 2000;
const DOWNLOAD_DONE_PCT = 100;
/** Rows materialized per batch. The full hit list already arrived in one search
 * response — only DOM construction is deferred, so batches append seamlessly. */
const RENDER_CHUNK = 25;
/** Append the next batch this far before the scroll reaches the list bottom. */
const SCROLL_PREFETCH_MARGIN = '120px';
/** Time on a row before it blooms into the detail card. The pointer dwell is
 * deliberately long — expansion should read as an intentional "tell me more",
 * never a side effect of the cursor passing through. Keyboard selection is
 * already explicit intent, so it blooms sooner. Measured from ENTERING the
 * row, not from the last micro-movement on it. */
const POINTER_DWELL_MS = 550;
const KEY_DWELL_MS = 260;
/** Keyboard-opened row menu anchors under the title column (the card's indent). */
const MENU_KEYBOARD_OFFSET_PX = 24;

/** What moved the selection. Pointer intent must never scroll or shift content
 * under the cursor; keyboard intent wants the selection kept in view. */
type IntentSource = 'pointer' | 'keys';

const input = document.querySelector<HTMLInputElement>('#query');
const list = document.querySelector<HTMLUListElement>('#results');
const status = document.querySelector<HTMLDivElement>('#status');
const settings = document.querySelector<HTMLDivElement>('#settings');
const gear = document.querySelector<HTMLButtonElement>('#gear');
const searchView = document.querySelector<HTMLDivElement>('#search-view');
const settingsView = document.querySelector<HTMLDivElement>('#settings-view');
const closeBtn = document.querySelector<HTMLButtonElement>('#close');
const count = document.querySelector<HTMLSpanElement>('#count');
const controls = document.querySelector<HTMLDivElement>('#browse-controls');
const sortBtn = document.querySelector<HTMLButtonElement>('#sort');
const folderBtn = document.querySelector<HTMLButtonElement>('#folder');
const setupView = document.querySelector<HTMLDivElement>('#setup-view');
const setupOpen = document.querySelector<HTMLButtonElement>('#setup-open');
if (
  !input ||
  !list ||
  !status ||
  !settings ||
  !gear ||
  !searchView ||
  !settingsView ||
  !closeBtn ||
  !count ||
  !controls ||
  !sortBtn ||
  !folderBtn ||
  !setupView ||
  !setupOpen
) {
  throw new Error('popup markup missing a required element');
}

// Long-lived port: keeps the SW alive for the session and triggers model warm-up.
chrome.runtime.connect({ name: 'popup' });

// Sort/folder dropdowns (browseControls.ts owns the values + trigger labels).
const browseControls = initBrowseControls({
  sortBtn,
  folderBtn,
  onChange: () => void runBrowse(),
});

let currentQuery = '';
let hits: ScoredHit[] = [];
let selected = 0;
/** How many hits are currently materialized as DOM rows (infinite scroll). */
let rendered = RENDER_CHUNK;
/** Live row elements, index-aligned with hits[0..rendered). Selection and
 * expansion mutate these in place — a full rebuild would restart the CSS
 * transitions mid-animation. */
let rowEls: HTMLLIElement[] = [];
/** Index of the one bloomed row, -1 when none. */
let expandedIndex = -1;
/** Row the pending dwell timer belongs to (-1 = none armed). */
let dwellIndex = -1;
/** Last real pointer position — distinguishes genuine movement from the
 * synthetic hover updates Chrome emits when content scrolls under the cursor. */
let lastPointerX = -1;
let lastPointerY = -1;
let dwellTimer: ReturnType<typeof setTimeout> | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let modelDownloadPct: number | null = null;
/** Fingerprint of the last-rendered result set — lets refresh paths (the
 * semantic retry) skip the destructive rebuild when nothing actually changed,
 * so an open detail card survives the refresh. render() keeps it current. */
let lastRenderKey = '';

// --- status line (visible only while work is happening — rule 6) ---

function renderStatus(progress?: IndexProgress): void {
  if (!status) return;
  if (modelDownloadPct !== null && modelDownloadPct < DOWNLOAD_DONE_PCT) {
    status.textContent = `Preparing search… ${modelDownloadPct}%`;
    return;
  }
  status.textContent = progress ? describeProgress(progress) : '';
}

/** Library size from the last index-state poll — the footer's denominator. */
let totalRecords = 0;

/** The footer's one quiet fact, recomputed whenever the list or the library
 * changes: result count while searching, scope while filtered, size at rest. */
function renderCount(recordCount?: number): void {
  if (typeof recordCount === 'number') totalRecords = recordCount;
  if (!count) return;
  count.textContent = describeCount({
    query: currentQuery,
    shown: hits.length,
    total: totalRecords,
    scopedToFolder: browseControls.isScoped(),
    atLimit: !!currentQuery && hits.length >= SEARCH_LIMIT,
  });
}

async function pollStatus(): Promise<IndexStateResponse> {
  const res = (await chrome.runtime.sendMessage({ type: 'index-state' })) as IndexStateResponse;
  renderStatus(res.progress);
  renderCount(res.recordCount);
  const phase = res.progress?.phase;
  if (phase && phase !== INDEX_PHASE.Done && phase !== INDEX_PHASE.Idle) {
    setTimeout(() => void pollStatus(), STATUS_POLL_MS);
  }
  return res;
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const m = msg as { type?: string; pct?: number };
  if (m.type === 'embed-progress' && typeof m.pct === 'number') {
    modelDownloadPct = m.pct;
    renderStatus();
  }
});

// --- search ---

input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_MS);
});

async function runSearch(): Promise<void> {
  if (!input) return;
  currentQuery = input.value.trim();
  clearTimeout(retryTimer);
  if (!currentQuery) {
    void runBrowse();
    return;
  }
  const message: SearchMessage = { type: 'search', query: currentQuery };
  const query = currentQuery;
  const res = (await chrome.runtime.sendMessage(message)) as RankedSearchResponse;
  if (query !== currentQuery) return; // stale response — a newer keystroke won
  if (isMenuOpen()) {
    // An open menu is an in-progress user intention — a refresh would yank the
    // rows (and the menu with them) out from under it. Try again after it closes.
    retryTimer = setTimeout(() => void runSearch(), SEMANTIC_RETRY_MS);
    return;
  }
  // Identical results skip the rebuild: render() replaces every row, which
  // destroys an open detail card mid-hover — during indexing the semantic
  // retry fires every 1.2s and would blink any bloomed card shut (and the
  // synthetic-hover guard rightly blocks a stationary pointer from re-arming).
  if (JSON.stringify(res.hits) !== lastRenderKey) {
    hits = res.hits;
    selected = 0;
    rendered = RENDER_CHUNK;
    render();
  }
  renderStatus(res.progress);
  if (res.semanticPending) {
    // Lexical-only served instantly; refine once the model is warm.
    retryTimer = setTimeout(() => void runSearch(), SEMANTIC_RETRY_MS);
  }
}

// --- browse (rest is the library — same row pipeline as search) ---

async function runBrowse(): Promise<void> {
  const message: BrowseMessage = {
    type: 'browse',
    sort: browseControls.sort(),
    ...(browseControls.folder() ? { folder: browseControls.folder() } : {}),
  };
  const res = (await chrome.runtime.sendMessage(message)) as BrowseResponse;
  if (currentQuery) return; // the user typed meanwhile — ranked results win
  hits = res.hits;
  selected = 0;
  rendered = RENDER_CHUNK;
  browseControls.setFolders(res.folders);
  render();
}

// --- rendering ---

function buildRow(hit: ScoredHit, index: number): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'row' + (index === selected ? ' selected' : '');
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', String(index === selected));
  li.dataset.id = hit.id;
  // No title tooltip: the dwell-expanded card shows the full URL properly — a
  // native tooltip would float on top of it.

  const queryTokens = tokenize(currentQuery);

  const favicon = document.createElement('img');
  favicon.className = 'favicon';
  favicon.alt = '';
  favicon.src = faviconUrl(hit.url);
  applyStoredIcon(favicon, hit.url);

  const main = document.createElement('div');
  main.className = 'main';
  const title = document.createElement('span');
  title.className = 'title';
  title.appendChild(highlight(hit.title || hit.url, queryTokens));
  const meta = document.createElement('div');
  meta.className = 'meta';
  const chipText = reasonChip(hit);
  if (chipText) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = chipText;
    meta.appendChild(chip);
  }
  const domain = document.createElement('span');
  domain.className = 'domain';
  domain.textContent = domainOf(hit.url);
  meta.appendChild(domain);
  if (hit.dead) meta.appendChild(deadMark());
  if (hit.description) {
    const snippet = document.createElement('span');
    snippet.className = 'snippet';
    snippet.appendChild(highlight(hit.description, queryTokens));
    meta.appendChild(snippet);
  }
  main.append(title, meta);

  // Only the two harmless quick actions live inline — adding more on bloom
  // used to shift which icon sat under the cursor (copy became delete).
  // Management actions are behind an explicit right-click (openRowMenu).
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    actionButton(OPEN_ICON, 'Open in background tab', () => openHit(hit, { background: true })),
    copyActionButton(hit.url),
  );

  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = '↵';

  const head = document.createElement('div');
  head.className = 'row-head';
  head.append(favicon, main, actions, hint);
  li.append(
    head,
    buildDetails(hit, (text) => highlight(text, queryTokens)),
  );
  li.addEventListener('click', () => openHit(hit, { background: false }));
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    updateSelection(index, 'pointer'); // right-click selects, like every native list
    openRowMenu(hit, index, e.clientX, e.clientY);
  });
  li.addEventListener('mousemove', (e) => {
    // While the context menu is up, the list beneath is inert — selection
    // moves or blooms under the overlay would just be noise.
    if (isMenuOpen()) return;
    // Chrome re-fires mousemove after a scroll to refresh hover. Same client
    // coords mean the POINTER didn't move — the content slid under it. Rows
    // arriving under a stationary cursor must not steal selection or arm a
    // bloom (pointer-stability invariant).
    if (e.clientX === lastPointerX && e.clientY === lastPointerY) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    updateSelection(index, 'pointer');
  });
  // Leaving a row closes ITS card immediately (snappy) and cancels its pending
  // bloom. A card bloomed elsewhere (keyboard) is not this row's to close.
  li.addEventListener('mouseleave', () => {
    if (dwellIndex === index) clearDwell();
    if (expandedIndex === index) collapseExpanded();
  });
  return li;
}

// Scrolling is navigation: the open card collapses at once and no bloom may
// arm until the pointer genuinely moves again. `wheel` (not `scroll`) so the
// keyboard flow's programmatic scrollIntoView never trips it.
list.addEventListener(
  'wheel',
  () => {
    clearDwell();
    if (expandedIndex !== -1) collapseExpanded();
  },
  { passive: true },
);

// Reveals the next batch when the sentinel row nears the viewport (infinite scroll).
const scrollObserver = new IntersectionObserver(
  (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    if (rendered < hits.length) appendBatch();
  },
  { root: list, rootMargin: SCROLL_PREFETCH_MARGIN },
);

/** Full rebuild — ONLY for a new result set. Selection/expansion changes must
 * go through updateSelection/expandRow so live CSS transitions survive. */
function render(): void {
  if (!list) return;
  lastRenderKey = JSON.stringify(hits);
  scrollObserver.disconnect(); // the old sentinel dies with replaceChildren
  clearDwell();
  closeContextMenu(); // its row is about to be replaced — stale actions must die
  closeDropdown(); // its trigger may be about to hide (typing hides the controls)
  expandedIndex = -1;
  rowEls = [];
  list.replaceChildren();
  // Browse controls exist only at rest — ranking owns the order once you type.
  if (controls) controls.hidden = !!currentQuery;
  renderCount(); // the footer mirrors what the list is now showing

  if (!hits.length) {
    // Zero matches only deserves a line when the user actually asked something.
    if (!currentQuery) return;
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No matches — try a looser phrase.';
    list.appendChild(li);
    return;
  }
  appendRows(0, Math.min(rendered, hits.length));
  updateSentinel();
  rowEls[selected]?.scrollIntoView({ block: 'nearest' });
}

function appendRows(from: number, to: number): void {
  if (!list) return;
  hits.slice(from, to).forEach((hit, i) => {
    const row = buildRow(hit, from + i);
    rowEls.push(row);
    list.appendChild(row);
  });
}

function updateSentinel(): void {
  if (!list) return;
  scrollObserver.disconnect();
  list.querySelector('.load-sentinel')?.remove();
  if (rendered >= hits.length) return;
  const sentinel = document.createElement('li');
  sentinel.className = 'load-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  list.appendChild(sentinel);
  scrollObserver.observe(sentinel);
}

function appendBatch(): void {
  const from = rowEls.length;
  rendered = Math.min(rendered + RENDER_CHUNK, hits.length);
  appendRows(from, rendered);
  updateSentinel();
}

/** Move selection in place (no rebuild) and arm the bloom dwell. Only keyboard
 * intent may scroll — a scroll during pointer use moves rows under the cursor,
 * which cascades into phantom hovers. */
function updateSelection(index: number, source: IntentSource): void {
  if (index !== selected) {
    const prev = rowEls[selected];
    prev?.classList.remove('selected');
    prev?.setAttribute('aria-selected', 'false');
    selected = index;
    const row = rowEls[selected];
    row?.classList.add('selected');
    row?.setAttribute('aria-selected', 'true');
    if (source === 'keys') row?.scrollIntoView({ block: 'nearest' });
  }
  if (index === expandedIndex) {
    clearDwell();
    return;
  }
  // Already counting down for this row — micro-movements must not reset the
  // clock, or a reading cursor would postpone the bloom forever.
  if (dwellIndex === index) return;
  clearDwell();
  dwellIndex = index;
  dwellTimer = setTimeout(
    () => expandRow(index, source),
    source === 'pointer' ? POINTER_DWELL_MS : KEY_DWELL_MS,
  );
}

function clearDwell(): void {
  clearTimeout(dwellTimer);
  dwellIndex = -1;
}

function collapseExpanded(): void {
  const row = rowEls[expandedIndex];
  if (row) setExpanded(row, false);
  expandedIndex = -1;
}

/** Swap the bloom: collapse the old card as the new one grows — the two height
 * changes run together, so the list glides instead of jumping. */
function expandRow(index: number, source: IntentSource): void {
  dwellIndex = -1;
  if (index === expandedIndex) return;
  collapseExpanded();
  expandedIndex = index;
  const row = rowEls[index];
  if (!row) return;
  setExpanded(row, true);
  // Keyboard blooms nudge the finished card fully into view. Pointer blooms
  // NEVER scroll: the card would slide out from under the stationary cursor
  // (transitionend also never fires under reduced motion — fine, keyboard
  // selection already did a nearest-scroll before expanding).
  if (source !== 'keys') return;
  row.querySelector('.details')?.addEventListener(
    'transitionend',
    () => {
      if (index === expandedIndex) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    { once: true },
  );
}

// --- actions & keyboard ---

/** Delete is intent-gated (it only exists in the right-click menu) and always
 * undoable — the toast is the confirmation, not a dialog. */
async function deleteHit(hit: ScoredHit, index: number): Promise<void> {
  const message: DeleteBookmarkMessage = { type: 'delete-bookmark', recordId: hit.id };
  const res = (await chrome.runtime.sendMessage(message)) as { ok: boolean };
  if (!res.ok) {
    // The bookmark vanished under us (deleted elsewhere; the index hasn't
    // caught up). Refresh so the zombie row leaves instead of no-oping.
    void runSearch();
    return;
  }
  hits = hits.filter((h) => h.id !== hit.id);
  selected = Math.min(index, Math.max(0, hits.length - 1));
  render();
  showUndoToast(hit.title || hit.url, () => void runSearch());
}

/** The right-click menu: every action for a row, management included. The two
 * inline hover icons (open in background, copy) repeat here so the menu is a
 * complete answer to "what can I do with this?". */
function openRowMenu(hit: ScoredHit, index: number, x: number, y: number): void {
  openContextMenu(
    x,
    y,
    [
      { label: 'Open', action: () => openHit(hit, { background: false }) },
      { label: 'Open in background tab', action: () => openHit(hit, { background: true }) },
      {
        label: 'Copy link',
        // The menu closes on activation, so the confirmation lives in a toast.
        action: () =>
          void navigator.clipboard.writeText(hit.url).then(() => showToast('Link copied')),
      },
      {
        label: 'Show in Bookmarks Manager',
        action: () => {
          const message: RevealBookmarkMessage = { type: 'reveal-bookmark', recordId: hit.id };
          void chrome.runtime.sendMessage(message);
        },
      },
      { label: 'Delete', danger: true, action: () => void deleteHit(hit, index) },
    ],
    () => input?.focus(),
  );
}

function openHit(hit: ScoredHit | undefined, opts: { background: boolean }): void {
  if (!hit) return;
  // The SW opens the tab so it can record the choice + watch for a quick bounce
  // (personalized ranking, decision 008) without racing the popup teardown.
  const rank = hits.findIndex((h) => h.id === hit.id) + 1;
  const message: OpenResultMessage = {
    type: 'open-result',
    url: hit.url,
    recordId: hit.id,
    query: currentQuery,
    rank,
    background: opts.background,
  };
  void chrome.runtime.sendMessage(message);
  if (!opts.background) window.close();
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!hits.length) return;
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    // Keyboard-first parity with scroll: arrowing past the last materialized
    // row reveals the next batch instead of wrapping early.
    if (delta === 1 && selected === rendered - 1 && rendered < hits.length) appendBatch();
    const visible = Math.min(rendered, hits.length);
    updateSelection((selected + delta + visible) % visible, 'keys');
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    openHit(hits[selected], { background: e.ctrlKey || e.metaKey });
    return;
  }
  // Keyboard route to the row menu (platform convention: Shift+F10 / Menu key).
  if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
    const hit = hits[selected];
    const row = rowEls[selected];
    if (!hit || !row) return;
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    openRowMenu(hit, selected, rect.left + MENU_KEYBOARD_OFFSET_PX, rect.bottom);
    return;
  }
  if (e.key === 'Escape') {
    window.close();
  }
});

// Settings is its own screen — the input is hidden there, so its keydown
// handler can't hear this Escape; catch it at the document instead.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsOpen) toggleSettings(false);
});

// --- settings (one level down behind the gear — rule 5; rows live in settingsView.ts) ---

let settingsOpen = false;

/** Settings is a second SCREEN, not a mode: the search surface (input, status,
 * results, gear) leaves entirely and a minimal header (back + title) takes
 * over. One surface at a time — progressive disclosure, not accumulation. */
function toggleSettings(open: boolean): void {
  settingsOpen = open;
  if (!searchView || !settingsView) return;
  if (open && settings) {
    renderSettings(settings, {
      pollStatus: () => void pollStatus(),
      closeSettings: () => toggleSettings(false),
    });
  }
  // Arms the slide-back; the animation (re)starts every time the view goes
  // display:none → visible, so setting the class once is enough.
  else searchView.classList.add('returning');
  searchView.hidden = open;
  settingsView.hidden = !open;
  if (open) closeBtn?.focus();
  else input?.focus();
}

gear.addEventListener('click', () => toggleSettings(true));
closeBtn.addEventListener('click', () => toggleSettings(false));

// --- pre-onboarding: the popup has exactly one job — route back to setup ---

function showSetup(): void {
  if (!searchView || !setupView) return;
  searchView.hidden = true;
  setupView.hidden = false;
  setupOpen?.focus();
}

setupOpen.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  window.close();
});

// _execute_action fires no onCommand — unconditional autofocus covers both
// toolbar-click and shortcut opens (research: ux-patterns §1).
input.focus();
void (async () => {
  const state = await pollStatus();
  // No limbo: on first run (or after a factory reset) the popup swaps to the
  // setup card instead of presenting an empty, inert library.
  if (state.onboarded === false) {
    showSetup();
    return;
  }
  // Rest is the library: show it before a single keystroke.
  void runBrowse();
})();
