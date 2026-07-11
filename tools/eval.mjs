// Golden-query evaluation against the REAL corpus in the dev browser.
// Usage: node tools/eval.mjs [--strict]   (--strict exits 1 below minHitRate)
// This is the product's definition-of-quality check (decision 003).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';
import * as cdp from './cdp.mjs';

const strict = process.argv.includes('--strict');
// goldens.local.json (gitignored) holds corpus-personal queries and wins when present;
// goldens.json is the shareable set kept in the repo.
const goldensFile = ['tools/goldens.local.json', 'tools/goldens.json']
  .map((p) => resolve(CONFIG.root, p))
  .find((p) => existsSync(p));
const goldens = JSON.parse(readFileSync(goldensFile, 'utf8'));

if (!(await cdp.isUp())) {
  console.error('Dev browser not running — run `npm run browser` first.');
  process.exit(2);
}
const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
let hitCount = 0;
let mrrSum = 0;
const rows = [];

try {
  for (const { query, expect, k } of goldens.queries) {
    // personalized:false — goldens measure the base ranking; click history from
    // manual testing must never influence the quality gate.
    const res = await cdp.evalOnTarget(
      tab,
      `chrome.runtime.sendMessage({ type: 'search', query: ${JSON.stringify(query)}, personalized: false })`,
    );
    const urls = (res?.hits ?? []).map((h) => h.url.toLowerCase());
    const topK = urls.slice(0, k);
    const rank = urls.findIndex((u) => expect.some((e) => u.includes(e.toLowerCase())));
    const hit = rank !== -1 && rank < k;
    if (hit) hitCount++;
    mrrSum += rank === -1 ? 0 : 1 / (rank + 1);
    // Show the matched URL when there is one; the top-1 result on a miss.
    const shown = rank === -1 ? (topK[0] ?? '(none)') : urls[rank];
    rows.push({ query, hit, rank: rank === -1 ? '—' : rank + 1, top: shown });
  }
} finally {
  await cdp.closeTab(tab.id);
}

const total = goldens.queries.length;
const hitRate = hitCount / total;
const mrr = mrrSum / total;

for (const r of rows) {
  console.log(
    `${r.hit ? 'HIT ' : 'MISS'}  [rank ${String(r.rank).padStart(2)}]  "${r.query}"  → ${r.top}`,
  );
}
console.log(
  `\nhit@k: ${hitCount}/${total} (${(hitRate * 100).toFixed(0)}%)   MRR: ${mrr.toFixed(3)}   threshold: ${(goldens.minHitRate * 100).toFixed(0)}%`,
);

if (strict && hitRate < goldens.minHitRate) {
  console.error('BELOW THRESHOLD — ranking regression.');
  process.exit(1);
}
