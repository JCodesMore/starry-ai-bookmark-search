// Omnibox integration ("bm <query>" in the address bar): pure suggestion
// building, kept apart from the chrome.omnibox wiring in background.ts so the
// XML handling is unit-testable. Suggestion descriptions are XML — Chrome
// allows only <url>/<match>/<dim> tags, everything else must be escaped.
import { escapeRegExp, tokenize } from '../lib/text';
import type { ScoredHit } from './types';

/** Chrome shows at most a handful of rows; more just get dropped. */
export const OMNIBOX_MAX_SUGGESTIONS = 6;

export type OmniboxSuggestion = { content: string; description: string };

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Title with query-token hits wrapped in <match> — the same word-prefix
 * match model as the popup's highlight — escaping segment by segment so the
 * only markup in the result is the markup we added. */
export function markMatches(text: string, query: string): string {
  const tokens = tokenize(query);
  if (!tokens.length || !text) return escapeXml(text);
  const pattern = new RegExp(`\\b(?:${tokens.map(escapeRegExp).join('|')})[a-z0-9]*`, 'gi');
  let out = '';
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out += escapeXml(text.slice(last, match.index));
    out += `<match>${escapeXml(match[0])}</match>`;
    last = match.index + match[0].length;
  }
  return out + escapeXml(text.slice(last));
}

/**
 * Top hits as omnibox rows: content is the exact URL (what Enter navigates
 * to), description is the marked title + dimmed URL. Deduped by URL — the
 * ranked list can surface the same page twice and duplicate contents are
 * undefined behavior in the omnibox.
 */
export function buildSuggestions(hits: readonly ScoredHit[], query: string): OmniboxSuggestion[] {
  const out: OmniboxSuggestion[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    out.push({
      content: hit.url,
      description: `${markMatches(hit.title || hit.url, query)}<dim> — </dim><url>${escapeXml(hit.url)}</url>`,
    });
    if (out.length >= OMNIBOX_MAX_SUGGESTIONS) break;
  }
  return out;
}
