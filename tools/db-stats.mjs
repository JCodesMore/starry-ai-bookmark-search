// Corpus health snapshot: fetch-status distribution + signal coverage.
import * as cdp from './cdp.mjs';

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}
const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const stats = await cdp.evalOnTarget(
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
      const byStatus = {};
      let withDesc = 0, withExcerpt = 0, embedded = 0, tagged = 0;
      for (const x of all) {
        byStatus[x.fetchStatus] = (byStatus[x.fetchStatus] ?? 0) + 1;
        if (x.signals.metaDescription) withDesc++;
        if (x.signals.excerpt) withExcerpt++;
        if (x.modelVersion) embedded++;
        if (x.tags.length) tagged++;
      }
      return { total: all.length, byStatus, withDesc, withExcerpt, embedded, tagged };
    })()`,
  );
  console.log(JSON.stringify(stats, null, 2));
} finally {
  await cdp.closeTab(tab.id);
}
