// Cluster-discovered topics inspector: what themes the extension learned from
// the live corpus, with live member counts and sample titles.
// Usage: node tools/topics.mjs [--json]
import * as cdp from './cdp.mjs';

const json = process.argv.includes('--json');

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
try {
  const res = await cdp.evalOnTarget(tab, `chrome.runtime.sendMessage({ type: 'debug-topics' })`);
  if (!res?.ok || !res.summary) {
    console.log('No learned topics yet — run an index pass first (npm run import / reindex).');
    process.exit(1);
  }
  if (json) {
    console.log(JSON.stringify(res.summary, null, 2));
  } else {
    const { builtAt, embeddedCount, topics } = res.summary;
    console.log(
      `built ${new Date(builtAt).toISOString()} over ${embeddedCount} embedded records — ${topics.length} topics\n`,
    );
    for (const t of topics) {
      console.log(`${String(t.size).padStart(4)}  ${t.label}  (cohesion ${t.cohesion})`);
      for (const s of t.samples) console.log(`        - ${s.slice(0, 78)}`);
    }
  }
} finally {
  await cdp.closeTab(tab.id);
}
