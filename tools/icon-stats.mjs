// Scratch: count captured icons in the live extension's IndexedDB.
import * as cdp from './cdp.mjs';

const ext = await cdp.findExtension();
const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
const c = await cdp.CDP.connect(tab.webSocketDebuggerUrl);

try {
  const res = await c.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const req = indexedDB.open('bss');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('icons')) return resolve({ icons: 'no store' });
        const tx = db.transaction('icons', 'readonly');
        const store = tx.objectStore('icons');
        const countReq = store.count();
        countReq.onsuccess = () => {
          const all = store.getAll();
          all.onsuccess = () => {
            const rows = all.result;
            resolve({
              total: rows.length,
              real: rows.filter((r) => r.bytes.byteLength > 0).length,
              empty: rows.filter((r) => !r.bytes.byteLength).length,
            });
          };
        };
      };
      req.onerror = () => resolve({ error: String(req.error) });
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(JSON.stringify(res.result.value));
} finally {
  c.close();
  await cdp.closeTab(tab.id);
}
