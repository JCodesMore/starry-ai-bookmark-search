// Service-worker entry: wires chrome.* events to core modules. Thin by design —
// logic lives in core/, this file only routes and caches.
import type {
  BrowseMessage,
  BrowseResponse,
  DebugOmniboxResponse,
  IndexStateResponse,
  Message,
  PrefsResponse,
  RankedSearchResponse,
} from './lib/messages';
import { buildSuggestions, type OmniboxSuggestion } from './core/omnibox';
import { debugEmbed } from './core/debug';
import { diag, getDiagLog } from './core/diag';
import { getOffscreenEmbeddingProvider } from './core/embedder/offscreen-proxy';
import {
  abortEnrichment,
  getIndexProgress,
  invalidateIndexing,
  isIndexingActive,
  runEnrichment,
  runFullIndex,
  settleIndexing,
} from './core/indexer';
import { hasCrawlConsent } from './core/crawl-consent';
import { isOnboarded, setOnboarded } from './core/onboarding-state';
import { getPrefs, setPrefs, type Prefs } from './core/prefs';
import { wireCrawlAlarm } from './core/queue';
import { registerBookmarkSync } from './core/sync';
import { syncIcons } from './core/icons';
import { getTopicsSummary } from './core/topics';
import {
  browseResults,
  folderPaths,
  rankResults,
  type RankWeights,
  type SemanticNeighbor,
} from './core/search';
import { sanitizePrefs, sanitizeWeights } from './lib/sanitize';
import { applyClickBoost, clickSignals, normalizeQuery } from './core/feedback';
import {
  addClick,
  clearAll,
  countRecords,
  getAllClicks,
  getAllRecords,
  getClick,
  putClick,
} from './core/storage';
import { VectorIndex } from './core/vectors';
import { tokenize } from './lib/text';
import { INDEX_PHASE, type BookmarkRecord, type ClickRow, type IndexProgress } from './core/types';

/** How long a search waits for the query embedding before serving lexical-only. */
const SEMANTIC_WAIT_MS = 900;

const provider = getOffscreenEmbeddingProvider();

console.log('[Starry] service worker booted');

// --- caches (rebuilt lazily; invalidated by sync events and reindex) ---

let recordsCache: BookmarkRecord[] | null = null;
let vectorIndexPromise: Promise<VectorIndex> | null = null;
let clicksCache: ClickRow[] | null = null;

async function getRecords(): Promise<BookmarkRecord[]> {
  recordsCache ??= await getAllRecords();
  return recordsCache;
}

async function getClicks(): Promise<ClickRow[]> {
  clicksCache ??= await getAllClicks();
  return clicksCache;
}

function getVectorIndex(): Promise<VectorIndex> {
  vectorIndexPromise ??= VectorIndex.load(provider.modelVersion);
  return vectorIndexPromise;
}

function invalidateCaches(): void {
  recordsCache = null;
  vectorIndexPromise = null;
}

// --- index lifecycle ---

/** Runs the full pipeline IF onboarding is complete. Before that, nothing
 * indexes, downloads the model, crawls, or fetches icons — onboarding is where
 * the user chooses what gets indexed and consents to the crawl. */
function ensureIndexed(reason: string): void {
  void isOnboarded()
    .then((ready) => {
      if (!ready) return;
      diag('trigger', reason);
      return (
        runFullIndex(provider)
          .then((progress) => {
            invalidateCaches();
            console.log(
              `[Starry] index pass done: ${progress.processed} embedded, ${progress.failed} failed`,
            );
            // Slow enrichment (page crawl → richer signals) runs after search is live.
            return runEnrichment(provider);
          })
          .then(() => invalidateCaches())
          // Favicon capture rides last — cosmetic, idempotent, never blocks search.
          .then(() => resumeIconSync())
      );
    })
    .catch((err) => {
      console.error('[Starry] index pass failed:', err);
    });
}

// Resumes an interrupted crawl after the SW is reborn.
wireCrawlAlarm(() => {
  void isOnboarded()
    .then((ready) => {
      if (!ready) return;
      return runEnrichment(provider).then(() => invalidateCaches());
    })
    .catch((err) => console.error('[Starry] crawl resume failed:', err));
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Starry] installed');
  // First install opens the welcome page once; updates never re-show it.
  // Index work starts only when onboarding completes (ensureIndexed self-gates)
  // — existing installs are grandfathered by the onboarded latch.
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
  ensureIndexed(`installed (${details.reason})`);
});
chrome.runtime.onStartup.addListener(() => ensureIndexed('browser startup'));

// Popup opens a named port on mount: warm the model immediately so the query
// embedding is ready by the time the user finishes typing (latency contract).
// Also the natural resume point for the icon sync — the SW can die mid-pass,
// and the sync is single-flight + idempotent (no-op once complete).
// Pre-onboarding the popup only shows the setup card — warming would download
// the model before the user agreed to anything.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return;
  void isOnboarded()
    .then((ready) => {
      if (!ready) return;
      void provider.warmUp().catch((err) => console.error('[Starry] warm-up failed:', err));
      void resumeIconSync();
    })
    .catch((err) => console.error('[Starry] popup connect failed:', err));
});

let iconSyncInFlight = false;
async function resumeIconSync(): Promise<void> {
  if (iconSyncInFlight) return;
  iconSyncInFlight = true;
  try {
    // Favicon fetches live in the same consent envelope as the page crawl —
    // stored consent AND the live host permission — and like all network work
    // they wait for onboarding.
    if (!(await isOnboarded()) || !(await hasCrawlConsent())) return;
    const { fetched, missing } = await syncIcons(await getRecords());
    if (fetched || missing) console.log(`[Starry] icons: ${fetched} captured, ${missing} absent`);
  } catch (err) {
    console.error('[Starry] icon sync failed:', err);
  } finally {
    iconSyncInFlight = false;
  }
}

registerBookmarkSync((ids) => {
  console.log(`[Starry] bookmarks changed (${ids.length}) — refreshing index`);
  invalidateCaches();
  ensureIndexed(`bookmarks changed (${ids.length})`);
});

// --- search ---

async function semanticScores(query: string): Promise<SemanticNeighbor[] | null> {
  try {
    const index = await getVectorIndex();
    if (!index.size) return [];
    const queryVector = await provider.embedQuery(query);
    // Full-corpus ranking: exact cosine over every embedded record is sub-ms at
    // this scale, and fusion needs true corpus-relative ranks (decision 007).
    return index.search(queryVector, index.size);
  } catch (err) {
    console.error('[Starry] semantic scoring failed (serving lexical-only):', err);
    return null;
  }
}

const SEMANTIC_TIMEOUT = Symbol('semantic-timeout');

async function handleSearch(
  query: string,
  weightsOverride?: Partial<RankWeights>,
  personalized = true,
): Promise<RankedSearchResponse> {
  const records = await getRecords();
  const semanticRace = semanticScores(query);
  const winner = await Promise.race([
    semanticRace,
    new Promise<typeof SEMANTIC_TIMEOUT>((r) =>
      setTimeout(() => r(SEMANTIC_TIMEOUT), SEMANTIC_WAIT_MS),
    ),
  ]);

  const semantic = winner === SEMANTIC_TIMEOUT || winner === null ? [] : winner;
  const semanticPending = winner === SEMANTIC_TIMEOUT;
  let hits = rankResults({ query, records, semantic, weights: sanitizeWeights(weightsOverride) });
  if (personalized) {
    // Re-rank-only: clicks reorder the retrieved hits, never retrieve new ones.
    hits = applyClickBoost(hits, clickSignals(query, await getClicks(), Date.now()));
  }
  const progress = await readProgressHealing();
  return {
    ok: true,
    hits,
    ...(semanticPending ? { semanticPending } : {}),
    ...(progress ? { progress } : {}),
  };
}

// --- click learning (decision 008) ---

/** An opened tab closed again this fast = suspected misclick (Chrome omnibox pattern). */
const BOUNCE_WINDOW_MS = 25_000;

/** tabId → click row key + open time, for bounce detection. Best-effort: the map
 * dies with the SW, which only means an unnoticed bounce keeps its click. */
const openedTabs = new Map<number, { clickKey: number; ts: number }>();

function sweepOpenedTabs(now: number): void {
  for (const [tabId, entry] of openedTabs) {
    if (now - entry.ts > BOUNCE_WINDOW_MS) openedTabs.delete(tabId);
  }
}

/** Records a result activation (and arms bounce-watching when we opened the
 * tab ourselves). Malformed payloads teach nothing — the open still happened.
 * An EMPTY query is a browse-mode open: recorded too, because it feeds the
 * Recent activity timeline — it can never influence ranking (no tokens to
 * match, and clickSignals bails on empty current queries anyway). */
async function recordClick(
  query: string,
  recordId: string,
  rank: number,
  tabId: number | undefined,
): Promise<void> {
  const queryNorm = normalizeQuery(query);
  if (!recordId || !Number.isFinite(rank) || rank < 1) return;
  const clickKey = await addClick({
    queryNorm,
    queryTokens: tokenize(query),
    recordId,
    ts: Date.now(),
    rank: Math.floor(rank),
    sat: true,
  });
  clicksCache = null;
  sweepOpenedTabs(Date.now());
  if (tabId !== undefined) openedTabs.set(tabId, { clickKey, ts: Date.now() });
}

async function handleOpenResult(msg: {
  url: string;
  recordId: string;
  query: string;
  rank: number;
  background: boolean;
}): Promise<{ ok: boolean }> {
  if (msg.background) {
    const tab = await chrome.tabs.create({ url: msg.url, active: false });
    await recordClick(msg.query, msg.recordId, msg.rank, tab.id);
    return { ok: true };
  }
  // A plain open NAVIGATES the current tab — like following a link, and like
  // the omnibox's currentTab disposition — instead of spawning tab clutter.
  // No bounce watch: closing a tab that was already the user's own tells us
  // nothing about the result's quality.
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id !== undefined) {
    await chrome.tabs.update(active.id, { url: msg.url });
  } else {
    await chrome.tabs.create({ url: msg.url, active: true }); // no active tab — edge case
  }
  await recordClick(msg.query, msg.recordId, msg.rank, undefined);
  return { ok: true };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  const entry = openedTabs.get(tabId);
  if (!entry) return;
  openedTabs.delete(tabId);
  if (Date.now() - entry.ts >= BOUNCE_WINDOW_MS) return;
  // Tab closed within seconds of opening — mark the click unsatisfying so it
  // never boosts future rankings.
  void getClick(entry.clickKey)
    .then((row) => {
      if (!row) return;
      return putClick({ ...row, sat: false });
    })
    .then(() => {
      clicksCache = null;
    })
    .catch((err) => console.error('[Starry] bounce update failed:', err));
});

// --- omnibox ("bm <query>" in the address bar — the same ranked pipeline) ---

/** url → identity of the last suggested batch, so Enter can teach the ranker
 * exactly like a popup click. Dies with the SW — worst case one unrecorded
 * click, never a wrong navigation (the URL itself is the suggestion content). */
let omniboxSuggested = new Map<string, { recordId: string; rank: number }>();
let omniboxQuery = '';

/** One retry when semantic scoring missed the race — same contract as the
 * popup's 1.2s refine, except the omnibox dropdown can't refresh in place, so
 * we wait for the better ranking BEFORE suggesting. Only bites in the model
 * cold-start window (onInputStarted warms it), never on a warm engine. */
const OMNIBOX_SEMANTIC_RETRY_MS = 1200;

async function omniboxSuggestions(query: string): Promise<OmniboxSuggestion[]> {
  let res = await handleSearch(query);
  if (res.semanticPending) {
    await new Promise((r) => setTimeout(r, OMNIBOX_SEMANTIC_RETRY_MS));
    res = await handleSearch(query);
  }
  omniboxQuery = query;
  omniboxSuggested = new Map();
  res.hits.forEach((hit, i) => {
    if (!omniboxSuggested.has(hit.url)) {
      omniboxSuggested.set(hit.url, { recordId: hit.id, rank: i + 1 });
    }
  });
  return buildSuggestions(res.hits, query);
}

/** What the onInputEntered listener actually receives (the named
 * OnInputEnteredDisposition type in @types/chrome is an enum, not this union). */
type OmniboxDisposition = 'currentTab' | 'newForegroundTab' | 'newBackgroundTab';

async function openOmniboxResult(text: string, disposition: OmniboxDisposition): Promise<void> {
  // Enter on a suggestion hands us its content (the URL); Enter on raw text
  // means "open the best match for what I typed".
  let url = text;
  let chosen = omniboxSuggested.get(text);
  let query = omniboxQuery;
  if (!chosen) {
    query = text.trim();
    const top = query ? (await handleSearch(query)).hits[0] : undefined;
    if (!top) return; // nothing matched — never navigate to garbage
    url = top.url;
    chosen = { recordId: top.id, rank: 1 };
  }
  if (disposition === 'currentTab') {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id !== undefined) await chrome.tabs.update(active.id, { url });
    else await chrome.tabs.create({ url });
    // Not a tab we opened — closing it soon says nothing about the match.
    await recordClick(query, chosen.recordId, chosen.rank, undefined);
    return;
  }
  const tab = await chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
  await recordClick(query, chosen.recordId, chosen.rank, tab.id);
}

if (chrome.omnibox) {
  chrome.omnibox.setDefaultSuggestion({
    description: 'Search your bookmarks — Enter opens the best match',
  });
  // Typing the keyword IS search intent: warm the model + records before the
  // first query letter lands (the popup's latency contract, same trick).
  // Pre-onboarding there is nothing to search and no consent to warm on.
  chrome.omnibox.onInputStarted.addListener(() => {
    void isOnboarded()
      .then((ready) => {
        if (!ready) return;
        void provider
          .warmUp()
          .catch((err) => console.error('[Starry] omnibox warm-up failed:', err));
        void getRecords();
      })
      .catch((err) => console.error('[Starry] omnibox warm-up failed:', err));
  });
  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    const query = text.trim();
    if (!query) {
      suggest([]);
      return;
    }
    void isOnboarded()
      .then((ready) => (ready ? omniboxSuggestions(query) : []))
      .then(suggest, (err: unknown) => {
        console.error('[Starry] omnibox suggest failed:', err);
        suggest([]);
      });
  });
  chrome.omnibox.onInputEntered.addListener((text, disposition) => {
    void isOnboarded()
      .then(async (ready) => {
        // No limbo: Enter before onboarding routes to the setup page instead
        // of silently doing nothing.
        if (!ready) {
          await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
          return;
        }
        await openOmniboxResult(text, disposition);
      })
      .catch((err: unknown) => console.error('[Starry] omnibox open failed:', err));
  });
}

// --- bookmark management (delete + undo + reveal) ---

/** The last deletion, held for undo. SW death forfeits the undo — acceptable:
 * the toast offering it dies with the popup anyway. */
let lastDeleted: { parentId?: string; index?: number; title: string; url: string } | null = null;

async function handleDeleteBookmark(recordId: string): Promise<{ ok: boolean }> {
  try {
    const [node] = await chrome.bookmarks.get(recordId);
    if (!node?.url) return { ok: false };
    lastDeleted = {
      title: node.title,
      url: node.url,
      ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
      ...(node.index !== undefined ? { index: node.index } : {}),
    };
    await chrome.bookmarks.remove(recordId);
    return { ok: true }; // sync.ts hears onRemoved and cleans record + vector
  } catch (err) {
    console.error('[Starry] delete failed:', err);
    return { ok: false };
  }
}

async function handleUndoDelete(): Promise<{ ok: boolean }> {
  if (!lastDeleted) return { ok: false };
  const gone = lastDeleted;
  lastDeleted = null;
  try {
    await chrome.bookmarks.create(gone);
    return { ok: true };
  } catch {
    // Parent folder vanished meanwhile — restore to the default folder rather
    // than losing the bookmark entirely.
    try {
      await chrome.bookmarks.create({ title: gone.title, url: gone.url });
      return { ok: true };
    } catch (err) {
      console.error('[Starry] undo failed:', err);
      return { ok: false };
    }
  }
}

async function handleRevealBookmark(recordId: string): Promise<{ ok: boolean }> {
  try {
    const [node] = await chrome.bookmarks.get(recordId);
    const folderId = node?.parentId ?? '';
    await chrome.tabs.create({ url: `chrome://bookmarks/?id=${folderId}` });
    return { ok: true };
  } catch (err) {
    console.error('[Starry] reveal failed:', err);
    return { ok: false };
  }
}

async function handleBrowse(msg: BrowseMessage): Promise<BrowseResponse> {
  const [records, clicks] = await Promise.all([getRecords(), getClicks()]);
  // Every open counts as activity (even a suspected misclick — the user's
  // mental model is "I just opened it"; bounce demotion is a RANKING concern).
  const lastOpened = new Map<string, number>();
  for (const click of clicks) {
    if (click.ts > (lastOpened.get(click.recordId) ?? 0)) lastOpened.set(click.recordId, click.ts);
  }
  return {
    ok: true,
    hits: browseResults({
      records,
      sort: msg.sort,
      lastOpened,
      ...(msg.folder ? { folder: msg.folder } : {}),
    }),
    folders: folderPaths(records),
  };
}

// --- prefs (onboarding + settings write through here; SW is the only writer) ---

async function handleSetPrefs(prefs: Prefs): Promise<PrefsResponse> {
  const before = await getPrefs();
  await setPrefs(prefs);
  // Revoking crawl consent stops in-flight fetches now, not at the next pass.
  if (before.crawlEnabled && !prefs.crawlEnabled) abortEnrichment();
  invalidateCaches();
  // Re-running the pass applies everything else: exclusions purge/restore
  // records, and the enrichment gate enqueues or clears the crawl queue.
  ensureIndexed('prefs changed');
  return { ok: true, prefs };
}

/** Finishing onboarding is the ONE moment index work may begin on a fresh
 * install: persist the choices, latch the flag, start the first pass. */
async function handleCompleteOnboarding(prefs: Prefs): Promise<PrefsResponse> {
  await setPrefs(prefs);
  await setOnboarded();
  invalidateCaches();
  ensureIndexed('onboarding completed');
  return { ok: true, prefs };
}

/** Factory reset: cancel in-flight work FIRST (a chunk landing after the wipe
 * would resurrect a zombie partial index), wipe every store — records, vectors,
 * icons, clicks, prefs, the onboarded latch — then reopen onboarding. Nothing
 * rebuilds until the user walks through it again. */
async function handleResetData(): Promise<{ ok: boolean }> {
  invalidateIndexing();
  await settleIndexing();
  await clearAll();
  invalidateCaches();
  await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  return { ok: true };
}

/** Persisted progress with a non-terminal phase but no pass actually running is
 * an epitaph from a service worker that died mid-pass (MV3 kills idle SWs; only
 * a completed pass writes Done). Without this check the popup would poll the
 * frozen "N / N" forever. Resume the pipeline — it is idempotent and incremental,
 * so it overwrites the epitaph with live progress within seconds. */
async function readProgressHealing(): Promise<IndexProgress | undefined> {
  const progress = await getIndexProgress();
  if (
    progress &&
    progress.phase !== INDEX_PHASE.Done &&
    progress.phase !== INDEX_PHASE.Idle &&
    !isIndexingActive()
  ) {
    ensureIndexed('resuming pass a dead service worker left behind');
  }
  return progress;
}

async function indexState(): Promise<IndexStateResponse> {
  const [progress, recordCount, onboarded] = await Promise.all([
    readProgressHealing(),
    countRecords(),
    isOnboarded(),
  ]);
  return { ok: true, recordCount, onboarded, ...(progress ? { progress } : {}) };
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  switch (msg.type) {
    case 'ping':
      sendResponse({ ok: true, pong: true, version: chrome.runtime.getManifest().version });
      return;
    case 'search':
      void handleSearch(msg.query, msg.weights, msg.personalized !== false).then(sendResponse);
      return true;
    case 'browse':
      void handleBrowse(msg).then(sendResponse);
      return true;
    case 'delete-bookmark':
      void handleDeleteBookmark(msg.recordId).then(sendResponse);
      return true;
    case 'undo-delete':
      void handleUndoDelete().then(sendResponse);
      return true;
    case 'reveal-bookmark':
      void handleRevealBookmark(msg.recordId).then(sendResponse);
      return true;
    case 'open-result':
      void handleOpenResult(msg).then(sendResponse);
      return true;
    case 'index-state':
      void indexState().then(sendResponse);
      return true;
    case 'get-prefs':
      void getPrefs().then((prefs) => sendResponse({ ok: true, prefs }));
      return true;
    case 'set-prefs':
      void handleSetPrefs(sanitizePrefs(msg.prefs)).then(sendResponse);
      return true;
    case 'complete-onboarding':
      void handleCompleteOnboarding(sanitizePrefs(msg.prefs)).then(sendResponse);
      return true;
    case 'reindex':
      ensureIndexed('reindex message');
      sendResponse({ ok: true });
      return;
    case 'diag-log':
      void getDiagLog().then((entries) => sendResponse({ ok: true, entries }));
      return true;
    case 'debug-topics':
      void getTopicsSummary().then((summary) => sendResponse({ ok: true, summary }));
      return true;
    case 'reset-data':
      void handleResetData().then(sendResponse);
      return true;
    case 'debug-embed':
      void debugEmbed(provider, msg.text).then(sendResponse);
      return true;
    case 'debug-omnibox':
      void omniboxSuggestions(msg.query).then((suggestions) => {
        const res: DebugOmniboxResponse = { ok: true, suggestions };
        sendResponse(res);
      });
      return true;
    default:
      return;
  }
});
