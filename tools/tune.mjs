// Fusion-weight sweep against the golden suite (uses the search message's
// sanitized weights override — no rebuilds). Prints combos ranked by hit@k, MRR.
// Usage: node tools/tune.mjs
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

// Same goldens resolution as eval.mjs: gitignored goldens.local.json wins when present.
const goldensFile = ['tools/goldens.local.json', 'tools/goldens.json']
  .map((p) => resolve(CONFIG.root, p))
  .find((p) => existsSync(p));
const goldens = JSON.parse(readFileSync(goldensFile, 'utf8'));

const GRID = [];
for (const lexical of [0.5, 0.55, 0.6]) {
  for (const rankBlend of [0.4, 0.5, 0.6, 0.7]) {
    for (const rankSharpness of [5, 10, 15, 25]) {
      GRID.push({ lexical, semantic: +(1 - lexical).toFixed(2), rankBlend, rankSharpness });
    }
  }
}

const ext = await cdp.findExtension();
const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
const results = [];
try {
  for (const weights of GRID) {
    let hits = 0;
    let mrrSum = 0;
    for (const { query, expect, k } of goldens.queries) {
      const res = await cdp.evalOnTarget(
        tab,
        `chrome.runtime.sendMessage({ type: 'search', query: ${JSON.stringify(query)}, personalized: false, weights: ${JSON.stringify(weights)} })`,
      );
      const urls = (res?.hits ?? []).map((h) => h.url.toLowerCase());
      const rank = urls.findIndex((u) => expect.some((e) => u.includes(e.toLowerCase())));
      if (rank !== -1 && rank < k) hits += 1;
      mrrSum += rank === -1 ? 0 : 1 / (rank + 1);
    }
    const row = {
      ...weights,
      hit: `${hits}/${goldens.queries.length}`,
      hits,
      mrr: +(mrrSum / goldens.queries.length).toFixed(4),
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  await cdp.closeTab(tab.id);
}

results.sort((a, b) => b.hits - a.hits || b.mrr - a.mrr);
console.log('\nTOP 8:');
for (const r of results.slice(0, 8)) console.log(JSON.stringify(r));
