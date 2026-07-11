import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueFetches,
  handleCrawlAlarm,
  pendingCount,
  processQueue,
  registerCrawlAlarm,
  wireCrawlAlarm,
} from './queue';
import { buildCompositeText } from './composite';
import * as storage from './storage';
import { FETCH_STATUS, type BookmarkRecord } from './types';
import type { FetchOutcome } from './fetcher';
import { hashText } from '../lib/hash';

const CRAWL_QUEUE_META_KEY = 'crawlQueue';
const CRAWL_ALARM_NAME = 'bss-crawl';
const FIXED_NOW = 1_700_000_000_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_JITTER_RATIO = 0.2;

function makeRecord(id: string, overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: `My Bookmark ${id}`,
    folderPath: 'Bookmarks bar / Test',
    dateAdded: FIXED_NOW,
    fetchStatus: FETCH_STATUS.Pending,
    signals: {},
    compositeText: `My Bookmark ${id}`,
    contentHash: 'placeholder',
    tags: [],
    modelVersion: 'model@1',
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

function baselineOutcome(): FetchOutcome {
  return { status: FETCH_STATUS.Baseline, signals: {} };
}

/** Polls with real timers (never fake — fake timers deadlock alongside fake-indexeddb). */
async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** A fetch double whose promises resolve only when the test releases them, so concurrency
 * caps can be observed mid-flight instead of inferred after the fact. Once
 * `releaseAllAndAutoRelease` is called, any *further* calls resolve immediately — otherwise the
 * next scheduling wave (triggered by releasing this one) would queue up releasers nobody drains. */
function createControlledFetch() {
  const calls: string[] = [];
  const inFlight = new Map<string, number>();
  const maxInFlight = new Map<string, number>();
  let globalInFlight = 0;
  let maxGlobalInFlight = 0;
  const releasers: Array<() => void> = [];
  let autoRelease = false;

  const fetchFn = vi.fn((url: string): Promise<FetchOutcome> => {
    const host = new URL(url).hostname;
    calls.push(url);
    inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
    maxInFlight.set(host, Math.max(maxInFlight.get(host) ?? 0, inFlight.get(host) ?? 0));
    globalInFlight += 1;
    maxGlobalInFlight = Math.max(maxGlobalInFlight, globalInFlight);

    const release = (): FetchOutcome => {
      inFlight.set(host, (inFlight.get(host) ?? 1) - 1);
      globalInFlight -= 1;
      return baselineOutcome();
    };

    if (autoRelease) return Promise.resolve(release());
    return new Promise<FetchOutcome>((resolve) => {
      releasers.push(() => resolve(release()));
    });
  });

  return {
    fetchFn,
    calls,
    maxInFlight: (host: string) => maxInFlight.get(host) ?? 0,
    maxGlobalInFlight: () => maxGlobalInFlight,
    releaseOne(): void {
      releasers.shift()?.();
    },
    releaseAllAndAutoRelease(): void {
      autoRelease = true;
      while (releasers.length > 0) releasers.shift()?.();
    },
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

describe('enqueueFetches', () => {
  it('adds new ids at attempts 0 and dedupes already-pending ones', async () => {
    expect(await enqueueFetches(['a', 'b'])).toBe(2);
    expect(await enqueueFetches(['b', 'c'])).toBe(3);
    expect(await pendingCount()).toBe(3);

    const state = await storage.getMeta<{ pending: Record<string, { attempts: number }> }>(
      CRAWL_QUEUE_META_KEY,
    );
    expect(state?.pending.a).toEqual({ attempts: 0 });
  });
});

describe('processQueue', () => {
  it('drops a queued id whose record no longer exists, without calling fetch', async () => {
    await enqueueFetches(['ghost']);
    const fetchFn = vi.fn();

    const result = await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(await pendingCount()).toBe(0);
    expect(result).toEqual({ fetched: 0, failed: 0, deferred: 0 });
  });

  it('applies a successful outcome: merges signals, sets status, rebuilds composite, nulls a changed hash, drains the queue', async () => {
    const record = makeRecord('1');
    await storage.putRecords([record]);
    await enqueueFetches(['1']);

    const fetchFn = vi.fn(async (): Promise<FetchOutcome> => ({
      status: FETCH_STATUS.Full,
      title: 'Fetched Page Title',
      signals: { metaDescription: 'A great page.', excerpt: 'Body text here.' },
    }));

    const result = await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    expect(result).toEqual({ fetched: 1, failed: 0, deferred: 0 });
    expect(await pendingCount()).toBe(0);

    const updated = await storage.getRecord('1');
    expect(updated?.fetchStatus).toBe(FETCH_STATUS.Full);
    expect(updated?.signals.metaDescription).toBe('A great page.');
    expect(updated?.signals.excerpt).toBe('Body text here.');
    expect(updated?.compositeText).toContain('Body text here');
    expect(updated?.contentHash).not.toBe(record.contentHash);
    expect(updated?.modelVersion).toBeNull();
  });

  it('never overwrites record.title; the fetched title only lands in signals.ogTitle', async () => {
    await storage.putRecords([makeRecord('2', { title: 'My Own Bookmark Name' })]);
    await enqueueFetches(['2']);

    const fetchFn = vi.fn(async (): Promise<FetchOutcome> => ({
      status: FETCH_STATUS.MetaOnly,
      title: 'Some Fetched <title> Tag',
      signals: {},
    }));

    await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    const updated = await storage.getRecord('2');
    expect(updated?.title).toBe('My Own Bookmark Name');
    expect(updated?.signals.ogTitle).toBe('Some Fetched <title> Tag');
  });

  it('leaves modelVersion untouched when the composite text does not change', async () => {
    const base = makeRecord('3', { signals: {} });
    // Prime compositeText/contentHash from the real builder so the fetch below (which
    // contributes no new signals) really does round-trip to an unchanged hash.
    const compositeText = buildCompositeText({
      title: base.title,
      url: base.url,
      folderPath: base.folderPath,
      signals: base.signals,
    });
    const record = { ...base, compositeText, contentHash: hashText(compositeText) };
    await storage.putRecords([record]);
    await enqueueFetches(['3']);

    const fetchFn = vi.fn(async (): Promise<FetchOutcome> => baselineOutcome());
    await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    const updated = await storage.getRecord('3');
    expect(updated?.contentHash).toBe(record.contentHash);
    expect(updated?.modelVersion).toBe('model@1');
  });

  it('a retryable failure (503) sets notBefore backoff and bumps attempts, stays in the queue', async () => {
    await storage.putRecords([makeRecord('4')]);
    await enqueueFetches(['4']);

    const fetchFn = vi.fn(async (): Promise<FetchOutcome> => ({
      status: FETCH_STATUS.Dead,
      signals: {},
      detail: 'HTTP 503 Service Unavailable',
    }));

    const result = await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    expect(result).toEqual({ fetched: 0, failed: 0, deferred: 1 });
    expect(await pendingCount()).toBe(1);

    const state = await storage.getMeta<{
      pending: Record<string, { attempts: number; notBefore?: number }>;
    }>(CRAWL_QUEUE_META_KEY);
    const entry = state?.pending['4'];
    expect(entry?.attempts).toBe(1);
    const minDelay = FIXED_NOW + BACKOFF_BASE_MS;
    const maxDelay = FIXED_NOW + BACKOFF_BASE_MS * (1 + BACKOFF_JITTER_RATIO);
    expect(entry?.notBefore).toBeGreaterThanOrEqual(minDelay);
    expect(entry?.notBefore).toBeLessThan(maxDelay);

    const updated = await storage.getRecord('4');
    expect(updated?.fetchStatus).toBe(FETCH_STATUS.Dead);
  });

  it('a non-retryable failure (404) stays Dead and drops out of the queue', async () => {
    await storage.putRecords([makeRecord('5')]);
    await enqueueFetches(['5']);

    const fetchFn = vi.fn(async (): Promise<FetchOutcome> => ({
      status: FETCH_STATUS.Dead,
      signals: {},
      detail: 'HTTP 404 Not Found',
    }));

    const result = await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    expect(result).toEqual({ fetched: 0, failed: 1, deferred: 0 });
    expect(await pendingCount()).toBe(0);
    expect((await storage.getRecord('5'))?.fetchStatus).toBe(FETCH_STATUS.Dead);
  });

  it('drops the item once retries are exhausted (max 3 attempts), staying Dead', async () => {
    await storage.putRecords([makeRecord('6')]);
    await enqueueFetches(['6']);

    const fetchFn = vi.fn(async (): Promise<FetchOutcome> => ({
      status: FETCH_STATUS.Dead,
      signals: {},
      detail: 'HTTP 500 Internal Server Error',
    }));

    let clock = FIXED_NOW;
    const now = () => clock;
    const JUMP_PAST_BACKOFF_MS = 10 * 60 * 1000;

    const first = await processQueue({ deps: { fetch: fetchFn, now } });
    expect(first.deferred).toBe(1);
    clock += JUMP_PAST_BACKOFF_MS;

    const second = await processQueue({ deps: { fetch: fetchFn, now } });
    expect(second.deferred).toBe(1);
    clock += JUMP_PAST_BACKOFF_MS;

    const third = await processQueue({ deps: { fetch: fetchFn, now } });
    expect(third).toEqual({ fetched: 0, failed: 1, deferred: 0 });

    expect(await pendingCount()).toBe(0);
    expect((await storage.getRecord('6'))?.fetchStatus).toBe(FETCH_STATUS.Dead);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('skips an entry whose notBefore is still in the future, counting it as deferred', async () => {
    await storage.putRecords([makeRecord('7')]);
    const FUTURE_OFFSET_MS = 999_999;
    await storage.setMeta(CRAWL_QUEUE_META_KEY, {
      pending: { '7': { attempts: 1, notBefore: FIXED_NOW + FUTURE_OFFSET_MS } },
    });

    const fetchFn = vi.fn();
    const result = await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, failed: 0, deferred: 1 });
    expect(await pendingCount()).toBe(1);
  });

  it('never runs more than 2 in-flight fetches for the same host', async () => {
    const ids = ['h1', 'h2', 'h3', 'h4', 'h5'];
    await storage.putRecords(
      ids.map((id) =>
        makeRecord(id, {
          url: `https://same-host.example/${id}`,
          canonicalUrl: `https://same-host.example/${id}`,
        }),
      ),
    );
    await enqueueFetches(ids);

    const controlled = createControlledFetch();
    const resultPromise = processQueue({
      deps: { fetch: controlled.fetchFn, now: () => FIXED_NOW },
    });

    await waitUntil(() => controlled.calls.length === 2);
    // A third item on this host must not have been dispatched yet — the host gate holds it back.
    expect(controlled.calls.length).toBe(2);

    controlled.releaseOne();
    await waitUntil(() => controlled.calls.length === 3);
    controlled.releaseAllAndAutoRelease();

    await resultPromise;
    expect(controlled.maxInFlight('same-host.example')).toBeLessThanOrEqual(2);
    expect(controlled.maxInFlight('same-host.example')).toBe(2);
  });

  it('never runs more than 6 in-flight fetches globally, across many distinct hosts', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `g${i}`);
    await storage.putRecords(
      ids.map((id, i) => {
        const host = `host${i % 4}.example`; // 4 hosts, 2 ids each — host cap of 2 never binds
        return makeRecord(id, {
          url: `https://${host}/${id}`,
          canonicalUrl: `https://${host}/${id}`,
        });
      }),
    );
    await enqueueFetches(ids);

    const controlled = createControlledFetch();
    const resultPromise = processQueue({
      deps: { fetch: controlled.fetchFn, now: () => FIXED_NOW },
    });

    await waitUntil(() => controlled.calls.length === 6);
    expect(controlled.calls.length).toBe(6);

    controlled.releaseAllAndAutoRelease();
    await resultPromise;
    expect(controlled.maxGlobalInFlight()).toBe(6);
  });
});

describe('chrome.alarms wiring', () => {
  let chromeStub: {
    alarms: {
      create: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
      onAlarm: { addListener: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    chromeStub = {
      alarms: {
        create: vi.fn(async () => undefined),
        clear: vi.fn(async () => true),
        onAlarm: { addListener: vi.fn() },
      },
    };
    globalThis.chrome = chromeStub as unknown as typeof chrome;
  });

  it('registerCrawlAlarm creates the alarm once work is pending', async () => {
    await enqueueFetches(['a']);
    registerCrawlAlarm();

    await waitUntil(() => chromeStub.alarms.create.mock.calls.length > 0);
    expect(chromeStub.alarms.create).toHaveBeenCalledWith(CRAWL_ALARM_NAME, {
      periodInMinutes: 1,
    });
  });

  it('registerCrawlAlarm clears the alarm once the queue is empty', async () => {
    registerCrawlAlarm();

    await waitUntil(() => chromeStub.alarms.clear.mock.calls.length > 0);
    expect(chromeStub.alarms.clear).toHaveBeenCalledWith(CRAWL_ALARM_NAME);
  });

  it('processQueue clears the alarm once it fully drains the queue', async () => {
    await storage.putRecords([makeRecord('8')]);
    await enqueueFetches(['8']);
    const fetchFn = vi.fn(async (): Promise<FetchOutcome> => baselineOutcome());

    await processQueue({ deps: { fetch: fetchFn, now: () => FIXED_NOW } });

    await waitUntil(() => chromeStub.alarms.clear.mock.calls.length > 0);
    expect(chromeStub.alarms.clear).toHaveBeenCalledWith(CRAWL_ALARM_NAME);
  });

  it("handleCrawlAlarm only invokes process for this queue's own alarm name", () => {
    const process = vi.fn();
    handleCrawlAlarm(
      { name: CRAWL_ALARM_NAME, scheduledTime: 0, persistAcrossSessions: false },
      process,
    );
    expect(process).toHaveBeenCalledTimes(1);

    handleCrawlAlarm(
      { name: 'some-other-alarm', scheduledTime: 0, persistAcrossSessions: false },
      process,
    );
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('wireCrawlAlarm registers a listener that filters by alarm name', () => {
    const process = vi.fn();
    wireCrawlAlarm(process);

    expect(chromeStub.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
    const listener = chromeStub.alarms.onAlarm.addListener.mock.calls[0]?.[0] as (
      alarm: chrome.alarms.Alarm,
    ) => void;

    listener({ name: 'unrelated', scheduledTime: 0, persistAcrossSessions: false });
    expect(process).not.toHaveBeenCalled();

    listener({ name: CRAWL_ALARM_NAME, scheduledTime: 0, persistAcrossSessions: false });
    expect(process).toHaveBeenCalledTimes(1);
  });
});
