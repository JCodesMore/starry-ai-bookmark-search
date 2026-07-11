// Bookmark-tree ingestion: builds/updates BookmarkRecord rows from chrome.bookmarks.getTree(),
// preserving previously-fetched signals so re-ingesting never throws away crawl work already
// done (decision 002 — fetch results are expensive; the composite/hash always get refreshed).
import { buildCompositeText } from './composite';
import * as storage from './storage';
import { FETCH_STATUS, type BookmarkRecord } from './types';
import { hashText } from '../lib/hash';
import { canonicalizeUrl } from '../lib/url';

/** Ancestor folder titles are joined with this to form e.g. "Bookmarks bar / Dev / Tools". */
export const FOLDER_PATH_SEPARATOR = ' / ';

export type IngestSummary = { created: number; updated: number; removedStale: number };

/**
 * Builds a BookmarkRecord for a single bookmark leaf node, carrying forward the fetched
 * signals/tags/modelVersion/fetchStatus of an existing record. Shared with sync.ts so
 * single-event updates stay consistent with the bulk crawl.
 */
export function buildRecord(
  node: chrome.bookmarks.BookmarkTreeNode,
  folderPath: string,
  existing: BookmarkRecord | undefined,
): BookmarkRecord {
  if (!node.url) {
    throw new Error(`buildRecord: bookmark node ${node.id} has no url`);
  }
  const signals = existing?.signals ?? {};
  const compositeText = buildCompositeText({
    title: node.title,
    url: node.url,
    folderPath,
    signals,
  });
  const contentHash = hashText(compositeText);
  const record: BookmarkRecord = {
    id: node.id,
    url: node.url,
    canonicalUrl: canonicalizeUrl(node.url),
    title: node.title,
    folderPath,
    dateAdded: node.dateAdded ?? existing?.dateAdded ?? Date.now(),
    fetchStatus: existing?.fetchStatus ?? FETCH_STATUS.Pending,
    signals,
    compositeText,
    contentHash,
    tags: existing?.tags ?? [],
    modelVersion: existing?.modelVersion ?? null,
    updatedAt: Date.now(),
  };
  // Tags stay valid only while the text they were computed from is unchanged; a renamed
  // bookmark (or changed composite) must be reclassified by the next tagging pass.
  if (existing?.tagModelVersion !== undefined && existing.title === node.title) {
    record.tagModelVersion = existing.tagModelVersion;
  }
  return record;
}

/** Walks up the folder chain from `parentId` to the root, building "A / B / C". */
export async function computeFolderPath(parentId: string | undefined): Promise<string> {
  const titles: string[] = [];
  let currentId = parentId;
  while (currentId) {
    const [node] = await chrome.bookmarks.get(currentId);
    if (!node) break;
    if (node.title) titles.unshift(node.title);
    currentId = node.parentId;
  }
  return titles.join(FOLDER_PATH_SEPARATOR);
}

// Only these fields can drift out from under an existing record between ingests;
// signals/tags/modelVersion/fetchStatus are preserved and never compared here.
function recordDiffers(existing: BookmarkRecord, candidate: BookmarkRecord): boolean {
  return (
    existing.url !== candidate.url ||
    existing.canonicalUrl !== candidate.canonicalUrl ||
    existing.title !== candidate.title ||
    existing.folderPath !== candidate.folderPath ||
    existing.contentHash !== candidate.contentHash
  );
}

/**
 * Full-corpus crawl: walks the entire bookmark tree, creating/updating records and removing
 * ones whose bookmark id no longer exists. Runs on install and can be re-run any time to
 * reconcile drift; single-record updates in the meantime are sync.ts's job.
 */
export async function ingestAllBookmarks(
  excludedFolderIds: ReadonlySet<string> = new Set(),
): Promise<IngestSummary> {
  const [tree, existingRecords] = await Promise.all([
    chrome.bookmarks.getTree(),
    storage.getAllRecords(),
  ]);
  const existingById = new Map(existingRecords.map((record) => [record.id, record]));
  const seenIds = new Set<string>();
  const toPersist: BookmarkRecord[] = [];
  let created = 0;
  let updated = 0;

  const walk = (node: chrome.bookmarks.BookmarkTreeNode, ancestorTitles: string[]): void => {
    // An excluded folder's whole subtree never enters seenIds, so the stale
    // cleanup below purges any records it used to have — exclusion IS removal.
    if (excludedFolderIds.has(node.id)) return;
    if (node.url) {
      seenIds.add(node.id);
      const folderPath = ancestorTitles.join(FOLDER_PATH_SEPARATOR);
      const existing = existingById.get(node.id);
      const record = buildRecord(node, folderPath, existing);
      if (!existing) {
        created += 1;
        toPersist.push(record);
      } else if (recordDiffers(existing, record)) {
        updated += 1;
        toPersist.push(record);
      }
      return;
    }
    // Root node's title is '' and must not become a leading " / " segment.
    const nextAncestors = node.title ? [...ancestorTitles, node.title] : ancestorTitles;
    for (const child of node.children ?? []) walk(child, nextAncestors);
  };

  for (const root of tree) walk(root, []);

  const staleIds = existingRecords
    .filter((record) => !seenIds.has(record.id))
    .map((record) => record.id);

  if (toPersist.length > 0) await storage.putRecords(toPersist);
  // A stale bookmark's vector is dead weight (never reachable again) — drop both.
  await Promise.all(staleIds.flatMap((id) => [storage.deleteRecord(id), storage.deleteVector(id)]));

  return { created, updated, removedStale: staleIds.length };
}
