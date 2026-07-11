import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { isOnboarded, setOnboarded } from './onboarding-state';
import * as storage from './storage';
import type { BookmarkRecord } from './types';
import { FETCH_STATUS } from './types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

function record(id: string): BookmarkRecord {
  return {
    id,
    title: 't',
    url: 'https://example.com/',
    canonicalUrl: 'https://example.com/',
    folderPath: '',
    compositeText: 't',
    contentHash: 'h',
    signals: {},
    tags: [],
    fetchStatus: FETCH_STATUS.Pending,
    modelVersion: null,
    dateAdded: 0,
    updatedAt: 0,
  };
}

describe('onboarding state', () => {
  it('is false on a fresh install', async () => {
    expect(await isOnboarded()).toBe(false);
  });

  it('latches true once set', async () => {
    await setOnboarded();
    expect(await isOnboarded()).toBe(true);
  });

  it('grandfathers installs that already have an index', async () => {
    await storage.putRecords([record('1')]);
    expect(await isOnboarded()).toBe(true);
    // The latch persisted — it must survive the records being purged later
    // (e.g. the user excludes every folder), not re-evaluate the count.
    await storage.deleteRecord('1');
    expect(await isOnboarded()).toBe(true);
  });

  it('returns to the fresh-install state after a factory reset', async () => {
    await storage.putRecords([record('1')]);
    await setOnboarded();
    await storage.clearAll();
    expect(await isOnboarded()).toBe(false);
  });
});
