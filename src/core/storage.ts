// Typed IndexedDB wrapper — the only module that touches the database.
// Everything inward works with the typed shapes from types.ts.
import type { BookmarkRecord, ClickRow, IconRow, VectorRow } from './types';

const DB_NAME = 'bss';
// v2: clicks store (personalized re-ranking). v3: icons store (crawl-captured
// favicons, keyed by origin). Upgrades are additive — the onupgradeneeded
// handler only creates stores that don't exist yet.
const DB_VERSION = 3;
/** Click history beyond this is pruned oldest-first; hundreds suffice for frecency. */
const MAX_CLICK_ROWS = 2000;

export const STORE = {
  Records: 'records',
  Vectors: 'vectors',
  Meta: 'meta',
  Clicks: 'clicks',
  Icons: 'icons',
} as const;
type StoreName = (typeof STORE)[keyof typeof STORE];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE.Records)) {
        db.createObjectStore(STORE.Records, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE.Vectors)) {
        db.createObjectStore(STORE.Vectors, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE.Meta)) {
        db.createObjectStore(STORE.Meta);
      }
      if (!db.objectStoreNames.contains(STORE.Clicks)) {
        db.createObjectStore(STORE.Clicks, { keyPath: 'key', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE.Icons)) {
        db.createObjectStore(STORE.Icons, { keyPath: 'origin' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`indexedDB.open(${DB_NAME}) failed`));
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(name, mode);
  const result = await fn(tx.objectStore(name));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`transaction on ${name} failed`));
    tx.onabort = () => reject(tx.error ?? new Error(`transaction on ${name} aborted`));
  });
  return result;
}

// --- records ---

export function getRecord(id: string): Promise<BookmarkRecord | undefined> {
  return withStore(STORE.Records, 'readonly', (s) => promisify(s.get(id)));
}

export function getAllRecords(): Promise<BookmarkRecord[]> {
  return withStore(STORE.Records, 'readonly', (s) => promisify(s.getAll()));
}

export function countRecords(): Promise<number> {
  return withStore(STORE.Records, 'readonly', (s) => promisify(s.count()));
}

export function putRecords(records: BookmarkRecord[]): Promise<void> {
  return withStore(STORE.Records, 'readwrite', async (s) => {
    for (const record of records) s.put(record);
  });
}

export function deleteRecord(id: string): Promise<void> {
  return withStore(STORE.Records, 'readwrite', async (s) => {
    s.delete(id);
  });
}

// --- vectors ---

export function getVector(id: string): Promise<VectorRow | undefined> {
  return withStore(STORE.Vectors, 'readonly', (s) => promisify(s.get(id)));
}

export function getAllVectors(): Promise<VectorRow[]> {
  return withStore(STORE.Vectors, 'readonly', (s) => promisify(s.getAll()));
}

export function putVectors(rows: VectorRow[]): Promise<void> {
  return withStore(STORE.Vectors, 'readwrite', async (s) => {
    for (const row of rows) s.put(row);
  });
}

export function deleteVector(id: string): Promise<void> {
  return withStore(STORE.Vectors, 'readwrite', async (s) => {
    s.delete(id);
  });
}

// --- clicks ---

/** Appends a click row (autoIncrement key), pruning oldest rows past the cap. */
export function addClick(row: Omit<ClickRow, 'key'>): Promise<number> {
  return withStore(STORE.Clicks, 'readwrite', async (s) => {
    const key = await promisify(s.add(row) as IDBRequest<IDBValidKey>);
    const count = await promisify(s.count());
    let toPrune = count - MAX_CLICK_ROWS;
    if (toPrune > 0) {
      // Keys are autoIncrement, so cursor order == insertion order == age.
      await new Promise<void>((resolve, reject) => {
        const cursorReq = s.openCursor();
        cursorReq.onerror = () => reject(cursorReq.error ?? new Error('click prune failed'));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || toPrune <= 0) return resolve();
          cursor.delete();
          toPrune -= 1;
          cursor.continue();
        };
      });
    }
    return key as number;
  });
}

export function getAllClicks(): Promise<ClickRow[]> {
  return withStore(STORE.Clicks, 'readonly', (s) => promisify(s.getAll()));
}

/** Updates an existing click row in place (e.g. marking a bounce unsatisfying). */
export function putClick(row: ClickRow): Promise<void> {
  return withStore(STORE.Clicks, 'readwrite', async (s) => {
    s.put(row);
  });
}

export function getClick(key: number): Promise<ClickRow | undefined> {
  return withStore(STORE.Clicks, 'readonly', (s) => promisify(s.get(key)));
}

// --- icons (crawl-captured favicons, one per origin) ---

export function getIcon(origin: string): Promise<IconRow | undefined> {
  return withStore(STORE.Icons, 'readonly', (s) => promisify(s.get(origin)));
}

/** Lightweight per-origin sync state — the icon bytes themselves stay in the store
 * (a getAll would drag every captured image into memory just to check coverage). */
export type IconMeta = {
  origin: string;
  hasIcon: boolean;
  syncVersion?: number;
  declaredUrl?: string;
};

export function getAllIconMeta(): Promise<IconMeta[]> {
  return withStore(
    STORE.Icons,
    'readonly',
    (s) =>
      new Promise<IconMeta[]>((resolve, reject) => {
        const out: IconMeta[] = [];
        const request = s.openCursor();
        request.onerror = () => reject(request.error as Error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(out);
            return;
          }
          const row = cursor.value as IconRow;
          const meta: IconMeta = { origin: row.origin, hasIcon: row.bytes.byteLength > 0 };
          if (row.syncVersion !== undefined) meta.syncVersion = row.syncVersion;
          if (row.declaredUrl !== undefined) meta.declaredUrl = row.declaredUrl;
          out.push(meta);
          cursor.continue();
        };
      }),
  );
}

export function putIcons(rows: IconRow[]): Promise<void> {
  return withStore(STORE.Icons, 'readwrite', async (s) => {
    for (const row of rows) s.put(row);
  });
}

// --- meta (out-of-line keys) ---

export function getMeta<T>(key: string): Promise<T | undefined> {
  return withStore(STORE.Meta, 'readonly', (s) => promisify(s.get(key) as IDBRequest<T>));
}

export function setMeta<T>(key: string, value: T): Promise<void> {
  return withStore(STORE.Meta, 'readwrite', async (s) => {
    s.put(value, key);
  });
}

export function deleteMeta(key: string): Promise<void> {
  return withStore(STORE.Meta, 'readwrite', async (s) => {
    s.delete(key);
  });
}

// --- lifecycle ---

/** Wipe all stores (settings "reset data"). */
export function clearAll(): Promise<void> {
  return withStore(STORE.Records, 'readwrite', async (s) => {
    s.clear();
  })
    .then(() =>
      withStore(STORE.Vectors, 'readwrite', async (s) => {
        s.clear();
      }),
    )
    .then(() =>
      withStore(STORE.Meta, 'readwrite', async (s) => {
        s.clear();
      }),
    )
    .then(() =>
      withStore(STORE.Clicks, 'readwrite', async (s) => {
        s.clear();
      }),
    )
    .then(() =>
      withStore(STORE.Icons, 'readwrite', async (s) => {
        s.clear();
      }),
    );
}

/** Test-only: drop the cached connection so a fresh DB can be opened. */
export function closeForTests(): void {
  void dbPromise?.then((db) => db.close());
  dbPromise = null;
}
