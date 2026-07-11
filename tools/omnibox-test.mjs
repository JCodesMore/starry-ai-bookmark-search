// Omnibox checks: the manifest keyword, and the suggestion pipeline through
// the live SW (CDP cannot drive the real address-bar dropdown — the
// debug-omnibox message exercises the same code path the dropdown uses,
// including the Enter → url→record mapping state).
// Usage: node tools/omnibox-test.mjs
import * as cdp from './cdp.mjs';

const KEYWORD = 'bm';
const QUERY = 'warmup iphone ai';
const MAX_SUGGESTIONS = 6;
const ALLOWED_TAGS = /<\/?(?:match|dim|url)>/g;

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded — run `npm run browser` first.');
  process.exit(2);
}

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = 1;
};

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
const c = await cdp.CDP.connect(tab.webSocketDebuggerUrl);
const evaluate = async (expression) => {
  const res = await c.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return res.result.value;
};

try {
  const keyword = await evaluate(`chrome.runtime.getManifest().omnibox?.keyword ?? ''`);
  check(keyword === KEYWORD, `manifest declares omnibox keyword "${KEYWORD}"`, `got "${keyword}"`);

  const res = await evaluate(
    `chrome.runtime.sendMessage({ type: 'debug-omnibox', query: ${JSON.stringify(QUERY)} })`,
  );
  const suggestions = res?.suggestions ?? [];
  check(
    res?.ok && suggestions.length >= 1 && suggestions.length <= MAX_SUGGESTIONS,
    `suggestion pipeline returns 1–${MAX_SUGGESTIONS} rows`,
    `${suggestions.length} for ${JSON.stringify(QUERY)}`,
  );
  check(
    suggestions.every((s) => /^https?:\/\//.test(s.content)),
    'every suggestion content is a URL (what Enter navigates to)',
  );
  check(
    new Set(suggestions.map((s) => s.content)).size === suggestions.length,
    'contents are unique (omnibox dedupe)',
  );
  const dirty = suggestions.filter((s) => s.description.replace(ALLOWED_TAGS, '').includes('<'));
  check(
    dirty.length === 0,
    'descriptions contain only <match>/<dim>/<url> markup (XML-escaped)',
    dirty[0]?.description ?? '',
  );
  check(
    suggestions.every((s) => s.description.includes('<url>')),
    'every description carries the dimmed URL',
  );
  check(
    (suggestions[0]?.content ?? '').includes('warmr'),
    'top suggestion matches the golden query',
    suggestions[0]?.content ?? '(none)',
  );

  // Parity: the dropdown must show the SAME ranking the popup shows (the
  // omnibox path waits out semanticPending instead of serving lexical-only).
  const popupHits = await evaluate(
    `chrome.runtime.sendMessage({ type: 'search', query: ${JSON.stringify(QUERY)} })`,
  );
  const popupTop = (popupHits?.hits ?? [])
    .map((h) => h.url)
    .filter((url, i, all) => all.indexOf(url) === i)
    .slice(0, suggestions.length);
  check(
    JSON.stringify(suggestions.map((s) => s.content)) === JSON.stringify(popupTop),
    'suggestions match the popup ranking exactly (semantic parity)',
    `omnibox ${suggestions.length} vs popup ${popupTop.length}`,
  );
  console.log(
    `\nfirst row: ${suggestions[0]?.description ?? '(none)'}\n           → ${suggestions[0]?.content ?? ''}`,
  );
} finally {
  c.close();
  await cdp.closeTab(tab.id);
}

process.exit(failed);
