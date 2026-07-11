// Folder checklist source for onboarding/settings: the top-level folders a
// user can include or exclude from the index. Pure over a bookmarks tree so
// it is unit-testable; callers pass chrome.bookmarks.getTree() output.

export type FolderChoice = { id: string; title: string; count: number };

function countBookmarks(node: chrome.bookmarks.BookmarkTreeNode): number {
  if (node.url) return 1;
  return (node.children ?? []).reduce((sum, child) => sum + countBookmarks(child), 0);
}

/**
 * The immediate child folders of the root containers ("Bookmarks bar",
 * "Other bookmarks", …), each with its recursive bookmark count. These are
 * the units of inclusion — loose bookmarks sitting directly in a container
 * are always indexed, and deep-tree picking is a later refinement. Empty
 * folders are omitted: excluding nothing changes nothing.
 */
export function topLevelFolders(tree: chrome.bookmarks.BookmarkTreeNode[]): FolderChoice[] {
  const choices: FolderChoice[] = [];
  for (const root of tree) {
    for (const container of root.children ?? []) {
      for (const child of container.children ?? []) {
        if (child.url) continue;
        const count = countBookmarks(child);
        if (count > 0) choices.push({ id: child.id, title: child.title, count });
      }
    }
  }
  return choices;
}

export type BookmarkPeek = { title: string; url: string };

/**
 * Every bookmark in the tree EXCEPT those under an excluded folder — the pool
 * the onboarding learning ticker "reads" from. Mirrors ingest's exclusion
 * semantics (an excluded id prunes its whole subtree), so the ticker only ever
 * shows bookmarks that are genuinely being learned.
 */
export function bookmarkPeeks(
  tree: chrome.bookmarks.BookmarkTreeNode[],
  excludedFolderIds: ReadonlySet<string>,
): BookmarkPeek[] {
  const peeks: BookmarkPeek[] = [];
  const walk = (node: chrome.bookmarks.BookmarkTreeNode): void => {
    if (excludedFolderIds.has(node.id)) return;
    if (node.url) {
      peeks.push({ title: node.title || node.url, url: node.url });
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of tree) walk(root);
  return peeks;
}
