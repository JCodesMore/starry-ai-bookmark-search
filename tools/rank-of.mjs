// Ranking diagnostic: where does a given bookmark land for each query?
// Usage: node tools/rank-of.mjs <url-substring> "query 1" ["query 2" ...]
// Prints the full fused hit list with scores, marking the target row.
import * as cdp from './cdp.mjs';

const [, , needle, ...queries] = process.argv;
if (!needle || !queries.length) {
  console.error('usage: node tools/rank-of.mjs <url-substring> "query" ...');
  process.exit(2);
}

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  for (const query of queries) {
    const res = await cdp.evalOnTarget(
      tab,
      `chrome.runtime.sendMessage({ type: 'search', query: ${JSON.stringify(query)} })`,
    );
    const hits = res?.hits ?? [];
    const index = hits.findIndex((h) => h.url.toLowerCase().includes(needle.toLowerCase()));
    const where = index === -1 ? 'NOT in returned hits' : `rank ${index + 1}`;
    const pending = res?.semanticPending ? '  [semantic pending — lexical-only]' : '';
    console.log(`\n"${query}" → target ${where} of ${hits.length}${pending}`);
    hits.forEach((h, i) => {
      const mark = i === index ? '  <<<<' : '';
      console.log(
        `${String(i + 1).padStart(2)}. ${h.score.toFixed(3)} [${h.reason}] ${h.url.slice(0, 72)}${mark}`,
      );
    });
  }
} finally {
  await cdp.closeTab(tab.id);
}
