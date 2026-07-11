import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as storage from './storage';
import { ICON_SYNC_VERSION, fetchIconBytes, iconOriginOf, syncIcons } from './icons';
import { FETCH_STATUS, type BookmarkRecord, type PageSignals } from './types';

function rec(id: string, url: string, signals: PageSignals = {}): BookmarkRecord {
  return {
    id,
    url,
    canonicalUrl: url,
    title: id,
    folderPath: 'Bookmarks bar',
    dateAdded: 0,
    fetchStatus: FETCH_STATUS.Baseline,
    signals,
    compositeText: '',
    contentHash: '',
    tags: [],
    modelVersion: null,
    updatedAt: 0,
  };
}

const pngResponse = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });

const htmlResponse = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

const notFound = () => new Response('', { status: 404 });

/** Route-table fetch double: exact-URL matches, everything else 404s. */
function routedFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return routes[url]?.() ?? notFound();
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

describe('iconOriginOf', () => {
  it('keys http(s) urls by origin and rejects everything else', () => {
    expect(iconOriginOf('https://www.example.com/deep/path?q=1')).toBe('https://www.example.com');
    expect(iconOriginOf('chrome://settings')).toBeNull();
    expect(iconOriginOf('not a url')).toBeNull();
  });
});

describe('fetchIconBytes', () => {
  it('accepts a small image response', async () => {
    const icon = await fetchIconBytes('https://a.test/favicon.ico', {
      fetchFn: async () => pngResponse(),
    });
    expect(icon?.contentType).toBe('image/png');
    expect(icon?.bytes.byteLength).toBe(4);
  });

  it('rejects non-image bodies, error statuses and network failures', async () => {
    const html = htmlResponse('<html>');
    expect(
      await fetchIconBytes('https://a.test/favicon.ico', { fetchFn: async () => html }),
    ).toBeNull();
    expect(
      await fetchIconBytes('https://a.test/favicon.ico', { fetchFn: async () => notFound() }),
    ).toBeNull();
    const boom = async () => {
      throw new Error('offline');
    };
    expect(await fetchIconBytes('https://a.test/favicon.ico', { fetchFn: boom })).toBeNull();
  });
});

describe('syncIcons', () => {
  it('fetches once per origin, negative-caches misses, never refetches', async () => {
    const records = [
      rec('1', 'https://good.test/a'),
      rec('2', 'https://good.test/b'), // same origin as 1 — one fetch total
      rec('3', 'https://bad.test/x'),
      rec('4', 'chrome://extensions'), // no origin — ignored entirely
    ];
    const { fetchFn, calls } = routedFetch({
      'https://good.test/favicon.ico': pngResponse,
    });

    const first = await syncIcons(records, { fetchFn });
    expect(first).toEqual({ fetched: 1, missing: 1 });
    // bad.test miss also triggers the one-time root-page peek before settling.
    expect(calls).toEqual([
      'https://good.test/favicon.ico',
      'https://bad.test/favicon.ico',
      'https://bad.test/',
    ]);
    expect((await storage.getIcon('https://good.test'))?.bytes.byteLength).toBe(4);
    // The miss is remembered as an empty row so it is never retried.
    const negative = await storage.getIcon('https://bad.test');
    expect(negative?.bytes.byteLength).toBe(0);
    expect(negative?.syncVersion).toBe(ICON_SYNC_VERSION);

    const second = await syncIcons(records, { fetchFn });
    expect(second).toEqual({ fetched: 0, missing: 0 });
    expect(calls).toHaveLength(3); // untouched — fully idempotent
  });

  it('prefers the crawl-declared icon URL over root /favicon.ico', async () => {
    const records = [
      rec('1', 'https://declared.test/page', { iconUrl: 'https://declared.test/img/fav.png' }),
    ];
    const { fetchFn, calls } = routedFetch({
      'https://declared.test/img/fav.png': pngResponse,
    });

    const result = await syncIcons(records, { fetchFn });
    expect(result).toEqual({ fetched: 1, missing: 0 });
    expect(calls).toEqual(['https://declared.test/img/fav.png']); // root ico never touched
  });

  it('discovers a declared icon from the root page when /favicon.ico is missing', async () => {
    const records = [rec('1', 'https://modern.test/deep/page')];
    const { fetchFn, calls } = routedFetch({
      'https://modern.test/': () =>
        htmlResponse('<head><link rel="icon" href="/assets/icon-32.png" sizes="32x32"></head>'),
      'https://modern.test/assets/icon-32.png': pngResponse,
    });

    const result = await syncIcons(records, { fetchFn });
    expect(result).toEqual({ fetched: 1, missing: 0 });
    expect(calls).toEqual([
      'https://modern.test/favicon.ico',
      'https://modern.test/',
      'https://modern.test/assets/icon-32.png',
    ]);
    expect((await storage.getIcon('https://modern.test'))?.bytes.byteLength).toBe(4);
  });

  it('re-arms pre-version negative rows exactly once under the current strategy', async () => {
    await storage.putIcons([
      // A v1-era miss (no syncVersion): the old sync only knew /favicon.ico.
      { origin: 'https://old-miss.test', bytes: new ArrayBuffer(0), contentType: '', updatedAt: 1 },
    ]);
    const records = [rec('1', 'https://old-miss.test/page')];
    const { fetchFn, calls } = routedFetch({
      'https://old-miss.test/': () =>
        htmlResponse('<link rel="shortcut icon" href="fav.ico" type="image/x-icon">'),
      'https://old-miss.test/fav.ico': pngResponse,
    });

    const result = await syncIcons(records, { fetchFn });
    expect(result).toEqual({ fetched: 1, missing: 0 });
    expect(calls[0]).toBe('https://old-miss.test/favicon.ico');
    expect((await storage.getIcon('https://old-miss.test'))?.bytes.byteLength).toBe(4);
  });

  it('re-arms a settled negative row when a crawl finds a NEW declared icon', async () => {
    await storage.putIcons([
      {
        origin: 'https://spa.test',
        bytes: new ArrayBuffer(0),
        contentType: '',
        updatedAt: 1,
        syncVersion: ICON_SYNC_VERSION,
        declaredUrl: '',
      },
    ]);
    const records = [rec('1', 'https://spa.test/app', { iconUrl: 'https://spa.test/v2/fav.svg' })];
    const { fetchFn, calls } = routedFetch({
      'https://spa.test/v2/fav.svg': () =>
        new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }),
    });

    const result = await syncIcons(records, { fetchFn });
    expect(result).toEqual({ fetched: 1, missing: 0 });
    expect(calls[0]).toBe('https://spa.test/v2/fav.svg');

    // Settled again: the same declared URL does not retrigger.
    const again = await syncIcons(records, { fetchFn });
    expect(again).toEqual({ fetched: 0, missing: 0 });
  });
});
