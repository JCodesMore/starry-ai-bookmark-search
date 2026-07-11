// Persistent, rate-limited crawl queue (decision 002: "crawl etiquette", "the floor, not the
// ceiling"). The service worker is mortal, so queue membership lives in meta (survives SW
// restarts) and a chrome.alarms tick resumes draining it whenever the SW is respawned.
import { buildCompositeText } from './composite';
import { fetchPageSignals, type FetchOutcome } from './fetcher';
import { getMeta, getRecord, putRecords, setMeta } from './storage';
import { FETCH_STATUS, type BookmarkRecord } from './types';
import { hashText } from '../lib/hash';

const CRAWL_QUEUE_META_KEY = 'crawlQueue';

// -- Tunables (decision 002: "~6 global in-flight, max 2 per host ... capped backoff+jitter") --
const GLOBAL_CONCURRENCY_LIMIT = 6;
const HOST_CONCURRENCY_LIMIT = 2;
const MAX_FETCH_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_FACTOR = 4;
const BACKOFF_JITTER_RATIO = 0.2;
// One flush per full concurrency wave: frequent enough to survive an SW death without losing
// much progress, infrequent enough to avoid write-amplifying IndexedDB on a 1,300+ bookmark run.
const PERSIST_BATCH_SIZE = GLOBAL_CONCURRENCY_LIMIT;
// 408 Request Timeout, 425 Too Early, 429 Too Many Requests, 5xx — everything else (403/404/...)
// is a permanent verdict, not worth hammering the site over (decision 002: "never retry 403/404").
const RETRYABLE_DETAIL_PATTERN = /\b(408|425|429|5\d{2})\b/;

const CRAWL_ALARM_NAME = 'bss-crawl';
const CRAWL_ALARM_PERIOD_MINUTES = 1;

export type QueueEntry = { attempts: number; notBefore?: number };
export type CrawlQueueState = { pending: Record<string, QueueEntry> };

export type ProcessQueueDeps = { fetch?: typeof fetchPageSignals; now?: () => number };
export type ProcessQueueOptions = {
  deps?: ProcessQueueDeps;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};
export type ProcessQueueResult = { fetched: number; failed: number; deferred: number };

// -- State persistence --

async function loadQueueState(): Promise<CrawlQueueState> {
  const stored = await getMeta<CrawlQueueState>(CRAWL_QUEUE_META_KEY);
  return stored ?? { pending: {} };
}

function persistQueueState(state: CrawlQueueState): Promise<void> {
  return setMeta(CRAWL_QUEUE_META_KEY, state);
}

/** Adds ids to the queue (attempts 0) if not already pending. Returns the total pending count. */
export async function enqueueFetches(ids: string[]): Promise<number> {
  const state = await loadQueueState();
  let changed = false;
  for (const id of ids) {
    if (state.pending[id]) continue; // already queued — dedupe, don't reset its backoff progress
    state.pending[id] = { attempts: 0 };
    changed = true;
  }
  if (changed) await persistQueueState(state);
  registerCrawlAlarm();
  return Object.keys(state.pending).length;
}

export async function pendingCount(): Promise<number> {
  const state = await loadQueueState();
  return Object.keys(state.pending).length;
}

/** Drops all pending work and disarms the resume alarm. Used when the crawl is
 * turned off — otherwise the alarm would wake the SW every minute forever just
 * to find a disabled crawl. Records keep their Pending fetchStatus, so
 * re-enabling simply re-enqueues them on the next enrichment pass. */
export async function clearQueue(): Promise<void> {
  await persistQueueState({ pending: {} });
  registerCrawlAlarm();
}

// -- Per-host concurrency gate --

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    // Malformed URLs are rare (canonicalizeUrl already validated most of these) — group them
    // under the raw string so they still get *some* per-host throttling rather than skipping it.
    return url;
  }
}

function createHostGate(limit: number) {
  const counts = new Map<string, number>();
  return {
    canStart(host: string): boolean {
      return (counts.get(host) ?? 0) < limit;
    },
    start(host: string): void {
      counts.set(host, (counts.get(host) ?? 0) + 1);
    },
    finish(host: string): void {
      const next = (counts.get(host) ?? 1) - 1;
      if (next <= 0) counts.delete(host);
      else counts.set(host, next);
    },
  };
}

type QueueItem = { id: string; record: BookmarkRecord; host: string };

/**
 * Runs `worker` over `items` with a global concurrency cap and a per-host cap. A free slot always
 * scans for the next item whose host isn't saturated, rather than blocking on FIFO order, so five
 * items on one host never queue up behind each other's global slot for nothing.
 */
async function runWithConcurrency(
  items: QueueItem[],
  worker: (item: QueueItem) => Promise<void>,
  signal: AbortSignal | undefined,
): Promise<void> {
  const hostGate = createHostGate(HOST_CONCURRENCY_LIMIT);
  const remaining = [...items];
  let active = 0;

  await new Promise<void>((resolve) => {
    const settleIfDone = (): void => {
      if (remaining.length === 0 && active === 0) resolve();
    };
    const launch = (): void => {
      if (signal?.aborted) {
        settleIfDone();
        return;
      }
      while (active < GLOBAL_CONCURRENCY_LIMIT) {
        const index = remaining.findIndex((item) => hostGate.canStart(item.host));
        if (index === -1) break; // every remaining item's host is at cap — wait for a slot to free
        const [item] = remaining.splice(index, 1) as [QueueItem];
        hostGate.start(item.host);
        active += 1;
        void worker(item).finally(() => {
          hostGate.finish(item.host);
          active -= 1;
          settleIfDone();
          launch(); // a slot (global and/or host) just freed — see if anything can start now
        });
      }
      settleIfDone();
    };
    launch();
  });
}

// -- Outcome application --

function applyOutcomeToRecord(
  record: BookmarkRecord,
  outcome: FetchOutcome,
  now: () => number,
): BookmarkRecord {
  const signals = { ...record.signals, ...outcome.signals };
  // The fetched title only ever wins inside signals.ogTitle — record.title is the user's own
  // bookmark name and must never be overwritten by anything the crawl discovers (decision 002).
  if (outcome.title !== undefined) signals.ogTitle = outcome.title;

  const compositeText = buildCompositeText({
    title: record.title,
    url: record.url,
    folderPath: record.folderPath,
    signals,
  });
  const contentHash = hashText(compositeText);
  const hashChanged = contentHash !== record.contentHash;

  const updated: BookmarkRecord = {
    ...record,
    signals,
    fetchStatus: outcome.status,
    compositeText,
    contentHash,
    // A changed composite invalidates the stored vector — null marks it stale so the indexer
    // re-embeds it (decision 001); an unchanged composite means the old vector is still valid.
    modelVersion: hashChanged ? null : record.modelVersion,
    updatedAt: now(),
  };
  // Fresh signals also change the tag-input text (title + description) — drop the tagger
  // stamp so the next tagging pass reclassifies this record instead of skipping it.
  if (hashChanged) delete updated.tagModelVersion;
  return updated;
}

function backoffDelayMs(attempts: number): number {
  const base = BACKOFF_BASE_MS * BACKOFF_FACTOR ** (attempts - 1);
  return base + base * BACKOFF_JITTER_RATIO * Math.random();
}

type OutcomeBucket = 'fetched' | 'failed' | 'deferred';

/**
 * Decides what happens to one queue entry after a fetch attempt, mutating `state.pending`
 * in place (drop on done/exhausted, reschedule on retryable failure). Returns the record to
 * persist and which result bucket this attempt counts toward.
 */
function classifyOutcome(
  id: string,
  record: BookmarkRecord,
  outcome: FetchOutcome,
  state: CrawlQueueState,
  now: () => number,
): { record: BookmarkRecord; bucket: OutcomeBucket } {
  const updated = applyOutcomeToRecord(record, outcome, now);

  const isRetryable =
    outcome.status === FETCH_STATUS.Dead &&
    outcome.detail !== undefined &&
    RETRYABLE_DETAIL_PATTERN.test(outcome.detail);

  if (!isRetryable) {
    delete state.pending[id];
    return { record: updated, bucket: outcome.status === FETCH_STATUS.Dead ? 'failed' : 'fetched' };
  }

  const attempts = (state.pending[id]?.attempts ?? 0) + 1;
  if (attempts >= MAX_FETCH_ATTEMPTS) {
    // Retries exhausted — keep the Dead status (decision 002: fetch failure never excludes a
    // bookmark from the index) but stop chasing a page that keeps failing.
    delete state.pending[id];
    return { record: updated, bucket: 'failed' };
  }

  state.pending[id] = { attempts, notBefore: now() + backoffDelayMs(attempts) };
  return { record: updated, bucket: 'deferred' };
}

// -- Draining the queue --

/** Drains eligible queue entries: fetches, applies outcomes, retries/drops per policy. */
export async function processQueue(opts: ProcessQueueOptions = {}): Promise<ProcessQueueResult> {
  const fetchFn = opts.deps?.fetch ?? fetchPageSignals;
  const now = opts.deps?.now ?? Date.now;
  const { onProgress, signal } = opts;

  const state = await loadQueueState();
  let deferred = 0;
  const eligibleIds: string[] = [];
  for (const id of Object.keys(state.pending)) {
    const entry = state.pending[id];
    if (!entry) continue; // defensive — id came straight from this object's own keys
    if (entry.notBefore !== undefined && entry.notBefore > now()) {
      deferred += 1; // still backing off from an earlier failure — try again next pass
      continue;
    }
    eligibleIds.push(id);
  }

  const loadedRecords = await Promise.all(eligibleIds.map((id) => getRecord(id)));
  const items: QueueItem[] = [];
  for (const [index, id] of eligibleIds.entries()) {
    const record = loadedRecords[index];
    if (!record) {
      delete state.pending[id]; // bookmark was deleted after being queued — nothing to fetch
      continue;
    }
    items.push({ id, record, host: hostnameOf(record.canonicalUrl) });
  }

  const total = items.length;
  let done = 0;
  let fetched = 0;
  let failed = 0;
  const recordUpdates: BookmarkRecord[] = [];
  let sinceFlush = 0;

  const flush = async (force = false): Promise<void> => {
    if (!force && sinceFlush < PERSIST_BATCH_SIZE) return;
    sinceFlush = 0;
    if (recordUpdates.length > 0) await putRecords(recordUpdates.splice(0, recordUpdates.length));
    await persistQueueState(state);
  };

  const worker = async (item: QueueItem): Promise<void> => {
    const outcome = await fetchFn(item.record.url);
    const result = classifyOutcome(item.id, item.record, outcome, state, now);
    recordUpdates.push(result.record);
    if (result.bucket === 'fetched') fetched += 1;
    else if (result.bucket === 'failed') failed += 1;
    else deferred += 1;

    done += 1;
    sinceFlush += 1;
    onProgress?.(done, total);
    await flush();
  };

  await runWithConcurrency(items, worker, signal);
  await flush(true); // always persist whatever's left, even a partial final batch

  registerCrawlAlarm();
  return { fetched, failed, deferred };
}

// -- chrome.alarms resume mechanism --

async function syncCrawlAlarm(): Promise<void> {
  const state = await loadQueueState();
  const entries = Object.values(state.pending);
  if (!entries.length) {
    await chrome.alarms.clear(CRAWL_ALARM_NAME);
    return;
  }
  const now = Date.now();
  const nextDue = entries.reduce(
    (earliest, entry) => Math.min(earliest, entry.notBefore ?? now),
    Infinity,
  );
  // Something is eligible now → short periodic resume. Everything backing off →
  // wake exactly when the earliest retry is due instead of every minute (an
  // 8-minute backoff used to wake the SW eight times for nothing). The period
  // stays on as a backstop in case the SW dies mid-drain after the first fire.
  await chrome.alarms.create(
    CRAWL_ALARM_NAME,
    nextDue <= now
      ? { periodInMinutes: CRAWL_ALARM_PERIOD_MINUTES }
      : { when: nextDue, periodInMinutes: CRAWL_ALARM_PERIOD_MINUTES },
  );
}

/** Arms the resume alarm while work is pending, clears it once drained. Fire-and-forget. */
export function registerCrawlAlarm(): void {
  void syncCrawlAlarm().catch((error: unknown) => {
    console.error('[queue] failed to sync crawl alarm', error);
  });
}

/** Invokes `process` only for this queue's own alarm — chrome.alarms is a shared namespace. */
export function handleCrawlAlarm(alarm: chrome.alarms.Alarm, process: () => void): void {
  if (alarm.name !== CRAWL_ALARM_NAME) return;
  process();
}

export function wireCrawlAlarm(process: () => void): void {
  chrome.alarms.onAlarm.addListener((alarm) => handleCrawlAlarm(alarm, process));
}
