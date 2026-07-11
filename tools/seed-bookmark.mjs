// Seed a test bookmark into the dev profile (idempotent by URL).
// Usage: node tools/seed-bookmark.mjs <url> "<title>"
import * as cdp from './cdp.mjs';

const [, , url, title] = process.argv;
if (!url) {
  console.error('usage: node tools/seed-bookmark.mjs <url> "<title>"');
  process.exit(2);
}

const ext = await cdp.findExtension();
const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const result = await cdp.evalOnTarget(
    tab,
    `(async () => {
      const url = ${JSON.stringify(url)};
      const existing = await chrome.bookmarks.search({ url });
      if (existing.length) return { status: 'already-exists', id: existing[0].id };
      const node = await chrome.bookmarks.create({ title: ${JSON.stringify(title ?? url)}, url });
      return { status: 'created', id: node.id };
    })()`,
  );
  console.log(JSON.stringify(result));
} finally {
  await cdp.closeTab(tab.id);
}
