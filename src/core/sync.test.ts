import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBookmarkSync } from './sync';
import * as storage from './storage';
import { FETCH_STATUS, type BookmarkRecord } from './types';

// sync.ts is exercised against an in-memory storage double rather than real IndexedDB: the
// debounce logic under test relies on `vi.useFakeTimers()`, and fake-indexeddb schedules its
// internal callbacks via setImmediate/setTimeout too, which would get tangled up with the very
// timers this suite is trying to control. Mocking storage keeps the fake clock deterministic.
vi.mock('./storage', () => {
  const records = new Map<string, BookmarkRecord>();
  const vectors = new Map<string, ArrayBuffer>();
  return {
    getRecord: async (id: string): Promise<BookmarkRecord | undefined> => records.get(id),
    getAllRecords: async (): Promise<BookmarkRecord[]> => [...records.values()],
    putRecords: async (rows: BookmarkRecord[]): Promise<void> => {
      for (const row of rows) records.set(row.id, row);
    },
    deleteRecord: async (id: string): Promise<void> => {
      records.delete(id);
    },
    getVector: async (id: string): Promise<{ id: string; vector: ArrayBuffer } | undefined> => {
      const vector = vectors.get(id);
      return vector ? { id, vector } : undefined;
    },
    putVectors: async (rows: { id: string; vector: ArrayBuffer }[]): Promise<void> => {
      for (const row of rows) vectors.set(row.id, row.vector);
    },
    deleteVector: async (id: string): Promise<void> => {
      vectors.delete(id);
    },
    closeForTests: (): void => {
      records.clear();
      vectors.clear();
    },
  };
});

const DEBOUNCE_QUIET_MS = 500;
const ADVANCE_PAST_DEBOUNCE_MS = 600;
const BURST_SIZE = 5;

type Listener<Args extends unknown[]> = (...args: Args) => void;

function createFakeEvent<Args extends unknown[]>() {
  const listeners: Listener<Args>[] = [];
  return {
    addListener: (fn: Listener<Args>): void => {
      listeners.push(fn);
    },
    removeListener: (): void => {},
    hasListener: (): boolean => false,
    fire: (...args: Args): void => {
      for (const listener of listeners) listener(...args);
    },
  };
}

type FolderEntry = { title: string; parentId?: string };

function makeChromeStub(folders: Record<string, FolderEntry>) {
  return {
    bookmarks: {
      onCreated: createFakeEvent<[string, chrome.bookmarks.BookmarkTreeNode]>(),
      onChanged: createFakeEvent<[string, { title: string; url?: string }]>(),
      onMoved:
        createFakeEvent<
          [string, { parentId: string; index: number; oldParentId: string; oldIndex: number }]
        >(),
      onRemoved:
        createFakeEvent<
          [string, { parentId: string; index: number; node: chrome.bookmarks.BookmarkTreeNode }]
        >(),
      get: (id: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> => {
        const entry = folders[id];
        if (!entry) return Promise.resolve([]);
        const node: chrome.bookmarks.BookmarkTreeNode = { id, title: entry.title, syncing: false };
        if (entry.parentId !== undefined) node.parentId = entry.parentId;
        return Promise.resolve([node]);
      },
    },
  };
}

const FOLDERS: Record<string, FolderEntry> = {
  '0': { title: '' },
  '1': { title: 'Bookmarks bar', parentId: '0' },
  '11': { title: 'Dev', parentId: '1' },
  '12': { title: 'Archive', parentId: '1' },
};

let chromeStub: ReturnType<typeof makeChromeStub>;

beforeEach(() => {
  storage.closeForTests();
  chromeStub = makeChromeStub(FOLDERS);
  globalThis.chrome = chromeStub as unknown as typeof chrome;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeRecord(id: string, overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: `Example ${id}`,
    folderPath: 'Bookmarks bar',
    dateAdded: 1700000000000,
    fetchStatus: FETCH_STATUS.Baseline,
    signals: {},
    compositeText: 'x',
    contentHash: 'x',
    tags: ['dev'],
    modelVersion: 'model@1',
    updatedAt: 1700000000000,
    ...overrides,
  };
}

describe('registerBookmarkSync', () => {
  it('onCreated stores a new record with the computed folder path', async () => {
    const onRecordsChanged = vi.fn();
    registerBookmarkSync(onRecordsChanged);

    chromeStub.bookmarks.onCreated.fire('10', {
      id: '10',
      title: 'GitHub',
      url: 'https://github.com',
      parentId: '11',
      syncing: false,
    });

    await vi.advanceTimersByTimeAsync(ADVANCE_PAST_DEBOUNCE_MS);

    const record = await storage.getRecord('10');
    expect(record?.folderPath).toBe('Bookmarks bar / Dev');
    expect(record?.title).toBe('GitHub');
    expect(onRecordsChanged).toHaveBeenCalledTimes(1);
    expect(onRecordsChanged).toHaveBeenCalledWith(['10']);
  });

  it('ignores onCreated for folders (no url)', async () => {
    const onRecordsChanged = vi.fn();
    registerBookmarkSync(onRecordsChanged);

    chromeStub.bookmarks.onCreated.fire('13', {
      id: '13',
      title: 'New Folder',
      parentId: '1',
      syncing: false,
    });

    await vi.advanceTimersByTimeAsync(ADVANCE_PAST_DEBOUNCE_MS);

    expect(await storage.getAllRecords()).toHaveLength(0);
    expect(onRecordsChanged).not.toHaveBeenCalled();
  });

  it('onChanged updates title/url and preserves signals/tags/modelVersion', async () => {
    await storage.putRecords([
      makeRecord('20', { title: 'Old Title', signals: { siteName: 'Site' } }),
    ]);
    const onRecordsChanged = vi.fn();
    registerBookmarkSync(onRecordsChanged);

    chromeStub.bookmarks.onChanged.fire('20', { title: 'New Title' });
    await vi.advanceTimersByTimeAsync(ADVANCE_PAST_DEBOUNCE_MS);

    const record = await storage.getRecord('20');
    expect(record?.title).toBe('New Title');
    expect(record?.tags).toEqual(['dev']);
    expect(record?.modelVersion).toBe('model@1');
    expect(record?.signals).toEqual({ siteName: 'Site' });
    expect(onRecordsChanged).toHaveBeenCalledWith(['20']);
  });

  it('onChanged is a no-op for an untracked node (e.g. a folder rename)', async () => {
    const onRecordsChanged = vi.fn();
    registerBookmarkSync(onRecordsChanged);

    chromeStub.bookmarks.onChanged.fire('11', { title: 'Renamed Folder' });
    await vi.advanceTimersByTimeAsync(ADVANCE_PAST_DEBOUNCE_MS);

    expect(await storage.getAllRecords()).toHaveLength(0);
    expect(onRecordsChanged).not.toHaveBeenCalled();
  });

  it('onMoved recomputes the folder path', async () => {
    await storage.putRecords([makeRecord('30', { folderPath: 'Bookmarks bar' })]);
    const onRecordsChanged = vi.fn();
    registerBookmarkSync(onRecordsChanged);

    chromeStub.bookmarks.onMoved.fire('30', {
      parentId: '12',
      index: 0,
      oldParentId: '1',
      oldIndex: 0,
    });
    await vi.advanceTimersByTimeAsync(ADVANCE_PAST_DEBOUNCE_MS);

    const record = await storage.getRecord('30');
    expect(record?.folderPath).toBe('Bookmarks bar / Archive');
    expect(onRecordsChanged).toHaveBeenCalledWith(['30']);
  });

  it('onRemoved deletes the record and its vector, including nested folder contents', async () => {
    await storage.putRecords([makeRecord('40'), makeRecord('41')]);
    await storage.putVectors([
      { id: '40', vector: new Float32Array([1]).buffer, modelVersion: 'model@1' },
      { id: '41', vector: new Float32Array([1]).buffer, modelVersion: 'model@1' },
    ]);
    const onRecordsChanged = vi.fn();
    registerBookmarkSync(onRecordsChanged);

    chromeStub.bookmarks.onRemoved.fire('12', {
      parentId: '1',
      index: 0,
      node: {
        id: '12',
        title: 'Archive',
        syncing: false,
        children: [
          { id: '40', title: 'A', url: 'https://example.com/40', syncing: false },
          { id: '41', title: 'B', url: 'https://example.com/41', syncing: false },
        ],
      },
    });

    await vi.advanceTimersByTimeAsync(ADVANCE_PAST_DEBOUNCE_MS);

    expect(await storage.getRecord('40')).toBeUndefined();
    expect(await storage.getRecord('41')).toBeUndefined();
    expect(await storage.getVector('40')).toBeUndefined();
    expect(await storage.getVector('41')).toBeUndefined();
  });

  it('debounces a burst of events into a single callback after the quiet period', async () => {
    const onRecordsChanged = vi.fn();
    registerBookmarkSync(onRecordsChanged);

    for (let i = 0; i < BURST_SIZE; i += 1) {
      chromeStub.bookmarks.onCreated.fire(`b${i}`, {
        id: `b${i}`,
        title: `Bookmark ${i}`,
        url: `https://example.com/${i}`,
        parentId: '1',
        syncing: false,
      });
    }

    // Not flushed yet — still mid quiet-period from the last event in the burst.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_QUIET_MS - 100);
    expect(onRecordsChanged).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(ADVANCE_PAST_DEBOUNCE_MS);

    expect(onRecordsChanged).toHaveBeenCalledTimes(1);
    const [ids] = onRecordsChanged.mock.calls[0] as [string[]];
    expect([...ids].sort()).toEqual(['b0', 'b1', 'b2', 'b3', 'b4']);
    expect(await storage.getAllRecords()).toHaveLength(BURST_SIZE);
  });
});
