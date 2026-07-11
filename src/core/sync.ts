// Keeps BookmarkRecord rows in sync with live chrome.bookmarks.* events. Bulk imports fire
// hundreds of events in a burst, so individual record updates are debounced into a single
// notification once things go quiet (decision 002 — throttle work, don't hammer the pipeline).
import { buildRecord, computeFolderPath } from './ingest';
import * as storage from './storage';
import type { BookmarkRecord } from './types';

const DEBOUNCE_QUIET_MS = 500;

type MoveInfo = { parentId: string; index: number; oldParentId: string; oldIndex: number };
type RemoveInfo = { parentId: string; index: number; node: chrome.bookmarks.BookmarkTreeNode };
type ChangeInfo = { title: string; url?: string };

/** Reconstructs a minimal tree node from a stored record, for reuse with buildRecord(). */
function nodeFromRecord(id: string, record: BookmarkRecord): chrome.bookmarks.BookmarkTreeNode {
  return { id, title: record.title, url: record.url, dateAdded: record.dateAdded, syncing: false };
}

async function handleCreated(bookmark: chrome.bookmarks.BookmarkTreeNode): Promise<boolean> {
  if (!bookmark.url) return false; // folders get no record of their own
  const folderPath = await computeFolderPath(bookmark.parentId);
  await storage.putRecords([buildRecord(bookmark, folderPath, undefined)]);
  return true;
}

async function handleChanged(id: string, changeInfo: ChangeInfo): Promise<boolean> {
  const existing = await storage.getRecord(id);
  if (!existing) return false; // untracked node (folder rename, or a race with onCreated)
  const node = nodeFromRecord(id, existing);
  node.title = changeInfo.title;
  node.url = changeInfo.url ?? existing.url;
  await storage.putRecords([buildRecord(node, existing.folderPath, existing)]);
  return true;
}

async function handleMoved(id: string, moveInfo: MoveInfo): Promise<boolean> {
  const existing = await storage.getRecord(id);
  if (!existing) return false; // not a tracked bookmark (e.g. a folder was moved)
  const folderPath = await computeFolderPath(moveInfo.parentId);
  if (folderPath === existing.folderPath) return false;
  await storage.putRecords([buildRecord(nodeFromRecord(id, existing), folderPath, existing)]);
  return true;
}

/** onRemoved fires once for a whole removed subtree, so walk it to catch every bookmark inside. */
function collectLeafIds(node: chrome.bookmarks.BookmarkTreeNode, out: string[]): void {
  if (node.url) {
    out.push(node.id);
    return;
  }
  for (const child of node.children ?? []) collectLeafIds(child, out);
}

async function handleRemoved(removeInfo: RemoveInfo): Promise<void> {
  const ids: string[] = [];
  collectLeafIds(removeInfo.node, ids);
  await Promise.all(ids.flatMap((id) => [storage.deleteRecord(id), storage.deleteVector(id)]));
}

/**
 * Wires chrome.bookmarks.* listeners to keep records current. `onRecordsChanged` fires with
 * the batch of affected ids after a 500ms quiet period, so the indexer can re-fetch/re-embed
 * without being triggered hundreds of times during a bookmark import.
 */
export function registerBookmarkSync(onRecordsChanged: (ids: string[]) => void): void {
  const pendingIds = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    flushTimer = undefined;
    if (pendingIds.size === 0) return;
    const ids = [...pendingIds];
    pendingIds.clear();
    onRecordsChanged(ids);
  };

  const scheduleFlush = (id: string): void => {
    pendingIds.add(id);
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, DEBOUNCE_QUIET_MS);
  };

  const guard = (id: string, work: Promise<boolean>): void => {
    work
      .then((changed) => {
        if (changed) scheduleFlush(id);
      })
      .catch((error: unknown) => {
        console.error(`[sync] failed to process bookmark ${id}`, error);
      });
  };

  chrome.bookmarks.onCreated.addListener((id, bookmark) => guard(id, handleCreated(bookmark)));
  chrome.bookmarks.onChanged.addListener((id, changeInfo) =>
    guard(id, handleChanged(id, changeInfo)),
  );
  chrome.bookmarks.onMoved.addListener((id, moveInfo) => guard(id, handleMoved(id, moveInfo)));
  chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    void handleRemoved(removeInfo).catch((error: unknown) => {
      console.error(`[sync] failed to remove bookmark ${id}`, error);
    });
  });
}
