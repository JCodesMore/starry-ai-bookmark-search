// Diagnostic: zero-shot tag cosines for a live record's tag text.
// Usage: node tools/tag-scores.mjs <url-substring>
import * as cdp from './cdp.mjs';

const needle = (process.argv[2] ?? '').toLowerCase();
const ext = await cdp.findExtension();
const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const out = await cdp.evalOnTarget(
    tab,
    `(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('bss');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const getAll = (store) => new Promise((res, rej) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const getMetaKeys = () => new Promise((res, rej) => {
        const r = db.transaction('meta').objectStore('meta').getAllKeys();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const getMeta = (key) => new Promise((res, rej) => {
        const r = db.transaction('meta').objectStore('meta').get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });

      const records = await getAll('records');
      const record = records.find((x) => x.url.toLowerCase().includes(${JSON.stringify(needle)}));
      if (!record) return { error: 'record not found' };

      const parts = [record.title, record.signals.metaDescription, record.signals.siteName]
        .map((p) => (p ?? '').trim()).filter(Boolean);
      const tagText = parts.length ? parts.join('\\n') : record.compositeText;

      const keys = await getMetaKeys();
      const taxKey = keys.find((k) => String(k).startsWith('taxonomyVectors:'));
      if (!taxKey) return { error: 'no taxonomy vectors cached' };
      const taxonomy = await getMeta(taxKey);

      const resp = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'embed', kind: 'documents', texts: [tagText] });
      if (!resp?.ok) return { error: 'embed failed: ' + resp?.error };
      const v = resp.vectors[0];

      const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
      const scored = taxonomy.ids.map((id, i) => ({ id, cos: +dot(v, taxonomy.vectors[i]).toFixed(4) }));
      scored.sort((a, b) => b.cos - a.cos);
      return { tagText, currentTags: record.tags, top12: scored.slice(0, 12) };
    })()`,
  );
  console.log(JSON.stringify(out, null, 2));
} finally {
  await cdp.closeTab(tab.id);
}
