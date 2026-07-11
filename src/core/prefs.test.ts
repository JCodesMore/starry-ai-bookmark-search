import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, getPrefs, setPrefs } from './prefs';
import * as storage from './storage';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

describe('prefs', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a full prefs object', async () => {
    await setPrefs({ crawlEnabled: false, excludedFolderIds: ['12', '34'] });
    expect(await getPrefs()).toEqual({ crawlEnabled: false, excludedFolderIds: ['12', '34'] });
  });

  it('fills missing fields from defaults (forward-compatible reads)', async () => {
    await storage.setMeta('prefs', { excludedFolderIds: ['9'] });
    expect(await getPrefs()).toEqual({ crawlEnabled: true, excludedFolderIds: ['9'] });
  });
});
