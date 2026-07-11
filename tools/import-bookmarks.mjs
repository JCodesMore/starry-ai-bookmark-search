// Import real bookmarks from a Comet profile into the dev browser for realistic
// testing. Reads the profile's Bookmarks JSON from disk (read-only — never
// touches the source profile) and recreates the tree via chrome.bookmarks.
// Idempotent: re-running replaces the previous import folder.
//
// Usage: node tools/import-bookmarks.mjs [profile display name; defaults to the Default profile]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cdp from './cdp.mjs';

const profileArg = process.argv[2] || 'Default';
const userData = join(process.env.LOCALAPPDATA, 'Perplexity/Comet/User Data');

const cache = JSON.parse(readFileSync(join(userData, 'Local State'), 'utf8')).profile.info_cache;
const dir = Object.keys(cache).find((d) => cache[d].name === profileArg) ?? profileArg;
const roots = JSON.parse(readFileSync(join(userData, dir, 'Bookmarks'), 'utf8')).roots;

const simplify = (n) =>
  n.type === 'url'
    ? { title: n.name, url: n.url }
    : { title: n.name, children: (n.children ?? []).map(simplify) };
const tree = ['bookmark_bar', 'other', 'synced']
  .map((k) => roots[k])
  .filter((r) => r?.children?.length)
  .map(simplify);

if (!(await cdp.isUp())) {
  console.error('Dev browser not running — run `npm run browser` first.');
  process.exit(2);
}
const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

const folderName = 'Imported bookmarks';
const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const result = await cdp.evalOnTarget(
    tab,
    `(async () => {
    // Replace ANY previous import folder, current or legacy naming (idempotency
    // survives folder-name changes; removeTree on an already-removed child throws).
    for (const o of await chrome.bookmarks.search('Imported')) {
      if (!o.url && /^Imported\\b/.test(o.title)) {
        try { await chrome.bookmarks.removeTree(o.id); } catch {}
      }
    }
    const importRoot = await chrome.bookmarks.create({ title: ${JSON.stringify(folderName)} });
    let urls = 0, folders = 0, skipped = 0;
    async function add(parentId, node) {
      if (node.url) {
        try {
          await chrome.bookmarks.create({ parentId, title: node.title, url: node.url });
          urls++;
        } catch { skipped++; } // unsupported schemes (javascript:, etc.)
      } else {
        const f = await chrome.bookmarks.create({ parentId, title: node.title });
        folders++;
        for (const c of node.children ?? []) await add(f.id, c);
      }
    }
    for (const rootNode of ${JSON.stringify(tree)}) await add(importRoot.id, rootNode);
    return { urls, folders, skipped };
  })()`,
  );
  console.log(
    JSON.stringify(
      { status: 'imported', from: `${profileArg} (${dir})`, folder: folderName, ...result },
      null,
      2,
    ),
  );
} finally {
  await cdp.closeTab(tab.id);
}
