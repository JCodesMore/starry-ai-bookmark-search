import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { ingestAllBookmarks } from './ingest';
import * as storage from './storage';

const DATE_ADDED = 1700000000000;

function stubTree(root: chrome.bookmarks.BookmarkTreeNode): void {
  globalThis.chrome = {
    bookmarks: {
      getTree: async (): Promise<chrome.bookmarks.BookmarkTreeNode[]> => [root],
    },
  } as unknown as typeof chrome;
}

function baseTree(): chrome.bookmarks.BookmarkTreeNode {
  return {
    id: '0',
    title: '',
    syncing: false,
    children: [
      {
        id: '1',
        title: 'Bookmarks bar',
        syncing: false,
        children: [
          {
            id: '10',
            title: 'GitHub',
            url: 'https://github.com',
            syncing: false,
            dateAdded: DATE_ADDED,
          },
          {
            id: '11',
            title: 'Dev',
            syncing: false,
            children: [
              {
                id: '110',
                title: 'MDN',
                url: 'https://developer.mozilla.org',
                syncing: false,
                dateAdded: DATE_ADDED,
              },
            ],
          },
        ],
      },
      { id: '2', title: 'Other bookmarks', syncing: false, children: [] },
    ],
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

describe('ingestAllBookmarks', () => {
  it('creates a record per bookmark leaf on a fresh index', async () => {
    stubTree(baseTree());

    const summary = await ingestAllBookmarks();

    expect(summary).toEqual({ created: 2, updated: 0, removedStale: 0 });
    const records = await storage.getAllRecords();
    expect(records.map((r) => r.id).sort()).toEqual(['10', '110']);
  });

  it('computes folderPath from ancestor folder titles', async () => {
    stubTree(baseTree());
    await ingestAllBookmarks();

    const top = await storage.getRecord('10');
    const nested = await storage.getRecord('110');
    expect(top?.folderPath).toBe('Bookmarks bar');
    expect(nested?.folderPath).toBe('Bookmarks bar / Dev');
  });

  it('gives every fresh record a baseline compositeText, contentHash, and pending status', async () => {
    stubTree(baseTree());
    await ingestAllBookmarks();

    const record = await storage.getRecord('10');
    expect(record?.compositeText).toContain('GitHub');
    expect(record?.contentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(record?.fetchStatus).toBe('pending');
    expect(record?.modelVersion).toBeNull();
    expect(record?.tags).toEqual([]);
  });

  it('re-ingest preserves fetched signals/tags/modelVersion and only counts real changes', async () => {
    stubTree(baseTree());
    await ingestAllBookmarks();

    // Simulate the fetch/embed pipeline having enriched this record already.
    const fetched = await storage.getRecord('10');
    if (!fetched) throw new Error('expected record 10 to exist');
    await storage.putRecords([
      {
        ...fetched,
        signals: { ogTitle: 'GitHub', siteName: 'GitHub' },
        tags: ['dev', 'tools'],
        modelVersion: 'bge-small-en-v1.5@1',
        fetchStatus: 'full',
      },
    ]);

    // Re-ingest with one title changed and everything else identical.
    const tree = baseTree();
    const barFolder = tree.children?.[0];
    const githubNode = barFolder?.children?.[0];
    if (!githubNode) throw new Error('fixture missing github node');
    githubNode.title = 'GitHub (renamed)';
    stubTree(tree);

    const summary = await ingestAllBookmarks();

    expect(summary).toEqual({ created: 0, updated: 1, removedStale: 0 });
    const updated = await storage.getRecord('10');
    expect(updated?.title).toBe('GitHub (renamed)');
    expect(updated?.signals).toEqual({ ogTitle: 'GitHub', siteName: 'GitHub' });
    expect(updated?.tags).toEqual(['dev', 'tools']);
    expect(updated?.modelVersion).toBe('bge-small-en-v1.5@1');
    expect(updated?.fetchStatus).toBe('full');

    // The untouched MDN record should not have been rewritten.
    const untouched = await storage.getRecord('110');
    expect(untouched?.title).toBe('MDN');
  });

  it('removes records for bookmarks no longer present, and their vectors', async () => {
    stubTree(baseTree());
    await ingestAllBookmarks();
    await storage.putVectors([
      { id: '10', vector: new Float32Array([1]).buffer, modelVersion: 'v1' },
    ]);

    const tree = baseTree();
    const barFolder = tree.children?.[0];
    if (barFolder) barFolder.children = (barFolder.children ?? []).filter((c) => c.id !== '10');
    stubTree(tree);

    const summary = await ingestAllBookmarks();

    expect(summary).toEqual({ created: 0, updated: 0, removedStale: 1 });
    expect(await storage.getRecord('10')).toBeUndefined();
    expect(await storage.getVector('10')).toBeUndefined();
    expect(await storage.getRecord('110')).toBeDefined();
  });
});
