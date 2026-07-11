import { describe, expect, it } from 'vitest';
import { bookmarkPeeks, topLevelFolders } from './folders';

type Node = chrome.bookmarks.BookmarkTreeNode;

function folder(id: string, title: string, children: Node[] = []): Node {
  return { id, title, children } as Node;
}

function bookmark(id: string): Node {
  return { id, title: `bm ${id}`, url: `https://example.com/${id}` } as Node;
}

/** Chrome's real shape: one root whose children are the containers. */
function tree(...containers: Node[]): Node[] {
  return [folder('0', '', containers)];
}

describe('topLevelFolders', () => {
  it('returns empty for an empty tree', () => {
    expect(topLevelFolders(tree(folder('1', 'Bookmarks bar')))).toEqual([]);
  });

  it('lists container-child folders with recursive counts', () => {
    const bar = folder('1', 'Bookmarks bar', [
      folder('10', 'Dev', [bookmark('100'), folder('11', 'Tools', [bookmark('101')])]),
      bookmark('102'), // loose bookmark — always included, never a choice
    ]);
    const other = folder('2', 'Other bookmarks', [folder('20', 'Recipes', [bookmark('200')])]);
    expect(topLevelFolders(tree(bar, other))).toEqual([
      { id: '10', title: 'Dev', count: 2 },
      { id: '20', title: 'Recipes', count: 1 },
    ]);
  });

  it('omits empty folders — excluding nothing changes nothing', () => {
    const bar = folder('1', 'Bookmarks bar', [
      folder('10', 'Empty'),
      folder('11', 'Full', [bookmark('110')]),
    ]);
    expect(topLevelFolders(tree(bar)).map((c) => c.id)).toEqual(['11']);
  });
});

describe('bookmarkPeeks', () => {
  it('flattens every bookmark, pruning excluded subtrees like ingest does', () => {
    const bar = folder('1', 'Bookmarks bar', [
      folder('10', 'Dev', [bookmark('100'), folder('11', 'Tools', [bookmark('101')])]),
      bookmark('102'), // loose bookmark — always included
      folder('12', 'Secret', [bookmark('120')]),
    ]);
    const peeks = bookmarkPeeks(tree(bar), new Set(['12']));
    expect(peeks.map((p) => p.url)).toEqual([
      'https://example.com/100',
      'https://example.com/101',
      'https://example.com/102',
    ]);
  });

  it('falls back to the url when a bookmark has no title', () => {
    const bar = folder('1', 'Bookmarks bar', [
      { id: '5', title: '', url: 'https://untitled.example/' } as Node,
    ]);
    expect(bookmarkPeeks(tree(bar), new Set())).toEqual([
      { title: 'https://untitled.example/', url: 'https://untitled.example/' },
    ]);
  });
});
