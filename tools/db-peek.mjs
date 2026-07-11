// Inspect live extension records: node tools/db-peek.mjs <url-substring>
import * as cdp from './cdp.mjs';

const needle = (process.argv[2] ?? 'openai').toLowerCase();

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}
const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const rows = await cdp.evalOnTarget(
    tab,
    `(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('bss');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const all = await new Promise((res, rej) => {
        const r = db.transaction('records').objectStore('records').getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const matches = all
        .filter((x) => x.url.toLowerCase().includes(${JSON.stringify(needle)}))
        .slice(0, 8);
      const iconOf = (url) => new Promise((res) => {
        let origin;
        try { origin = new URL(url).origin; } catch { res('no-origin'); return; }
        const r = db.transaction('icons').objectStore('icons').get(origin);
        r.onsuccess = () => res(r.result ? (r.result.bytes.byteLength ? r.result.contentType + ' ' + r.result.bytes.byteLength + 'B' : 'negative-cached') : 'never-tried');
        r.onerror = () => res('error');
      });
      return Promise.all(matches.map(async (x) => ({
        title: x.title.slice(0, 50),
        url: x.url.slice(0, 60),
        tags: x.tags,
        learnedTags: x.learnedTags,
        status: x.fetchStatus,
        model: x.modelVersion ? 'embedded' : 'stale',
        icon: await iconOf(x.canonicalUrl || x.url),
        declaredIcon: x.signals?.iconUrl?.slice(0, 60),
      })));
    })()`,
  );
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await cdp.closeTab(tab.id);
}
