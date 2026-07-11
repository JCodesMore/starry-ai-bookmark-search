import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as storage from './storage';
import { FETCH_STATUS, type BookmarkRecord, type VectorRow } from './types';

function makeRecord(id: string, overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: `Example ${id}`,
    folderPath: 'Bookmarks bar / Test',
    dateAdded: 1700000000000,
    fetchStatus: FETCH_STATUS.Pending,
    signals: {},
    compositeText: '',
    contentHash: '',
    tags: [],
    modelVersion: null,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

beforeEach(() => {
  // Fresh database per test: reset the global factory and drop the cached connection.
  globalThis.indexedDB = new IDBFactory();
  storage.closeForTests();
});

describe('records store', () => {
  it('round-trips a record', async () => {
    const record = makeRecord('1', { tags: ['dev'] });
    await storage.putRecords([record]);
    expect(await storage.getRecord('1')).toEqual(record);
  });

  it('bulk-puts and getAll returns everything', async () => {
    await storage.putRecords([makeRecord('1'), makeRecord('2'), makeRecord('3')]);
    expect((await storage.getAllRecords()).map((r) => r.id).sort()).toEqual(['1', '2', '3']);
  });

  it('put with same id overwrites', async () => {
    await storage.putRecords([makeRecord('1', { title: 'old' })]);
    await storage.putRecords([makeRecord('1', { title: 'new' })]);
    expect((await storage.getRecord('1'))?.title).toBe('new');
    expect(await storage.getAllRecords()).toHaveLength(1);
  });

  it('deletes a record', async () => {
    await storage.putRecords([makeRecord('1')]);
    await storage.deleteRecord('1');
    expect(await storage.getRecord('1')).toBeUndefined();
  });
});

describe('vectors store', () => {
  it('round-trips Float32Array bytes intact', async () => {
    const vector = new Float32Array([0.1, -0.5, 0.25, 1]);
    const row: VectorRow = { id: '1', vector: vector.buffer, modelVersion: 'test@1' };
    await storage.putVectors([row]);
    const loaded = await storage.getVector('1');
    expect(loaded?.modelVersion).toBe('test@1');
    expect(Array.from(new Float32Array(loaded!.vector))).toEqual(Array.from(vector));
  });

  it('getAllVectors returns all rows', async () => {
    const buf = new Float32Array([1]).buffer;
    await storage.putVectors([
      { id: '1', vector: buf, modelVersion: 'test@1' },
      { id: '2', vector: buf, modelVersion: 'test@1' },
    ]);
    expect(await storage.getAllVectors()).toHaveLength(2);
  });

  it('deletes a vector', async () => {
    await storage.putVectors([
      { id: '1', vector: new Float32Array([1]).buffer, modelVersion: 'test@1' },
    ]);
    await storage.deleteVector('1');
    expect(await storage.getVector('1')).toBeUndefined();
  });
});

describe('meta store', () => {
  it('round-trips arbitrary values by key', async () => {
    await storage.setMeta('progress', { phase: 'fetching', processed: 10 });
    expect(await storage.getMeta('progress')).toEqual({ phase: 'fetching', processed: 10 });
  });

  it('returns undefined for missing keys', async () => {
    expect(await storage.getMeta('nope')).toBeUndefined();
  });

  it('deletes by key', async () => {
    await storage.setMeta('k', 1);
    await storage.deleteMeta('k');
    expect(await storage.getMeta('k')).toBeUndefined();
  });
});

describe('clearAll', () => {
  it('wipes every store', async () => {
    await storage.putRecords([makeRecord('1')]);
    await storage.putVectors([
      { id: '1', vector: new Float32Array([1]).buffer, modelVersion: 'v' },
    ]);
    await storage.setMeta('k', 'v');
    await storage.clearAll();
    expect(await storage.getAllRecords()).toHaveLength(0);
    expect(await storage.getAllVectors()).toHaveLength(0);
    expect(await storage.getMeta('k')).toBeUndefined();
  });
});
