// Assembles the ONE composite embedding text per bookmark, in the priority order from
// decision 002: title/og:title -> meta description -> site name + domain -> headings
// -> excerpt -> URL path tokens -> folder path. Every bookmark must yield a useful text
// from title + URL alone (the "baseline floor") even when no signals were ever fetched.
import type { BookmarkRecord } from './types';

const SECTION_SEPARATOR = '\n';
const WORD_SEPARATOR = ' ';
const MAX_HEADINGS = 5;
const EXCERPT_WORD_CAP = 300;
const COMPOSITE_CHAR_CAP = 2000;

// Delimiters for URL tokenization: path separators and common word-joiners in slugs.
const URL_TOKEN_DELIMITER_PATTERN = /[/\-_.]+/;
const NUMERIC_TOKEN_PATTERN = /^\d+$/;
const HEX_TOKEN_PATTERN = /^[0-9a-f]+$/i;
// Hex-looking tokens at or above this length read as content hashes/ids, not words.
const HEX_TOKEN_MIN_LENGTH = 8;
// Long alphanumeric tokens containing a digit read as generated ids (slugs, not words).
const LONG_ID_TOKEN_MIN_LENGTH = 10;
// Hostname labels / path noise that carry no topical signal on their own.
const URL_STOP_TOKENS = new Set([
  'www',
  'com',
  'org',
  'net',
  'io',
  'co',
  'gov',
  'edu',
  'html',
  'htm',
  'php',
]);

type CompositeInput = Pick<BookmarkRecord, 'title' | 'url' | 'folderPath' | 'signals'>;

export function buildCompositeText(record: CompositeInput): string {
  const { title, url, folderPath, signals } = record;
  const seen = new Set<string>();

  // Tracks exact (case-insensitive, trimmed) duplicates across every section so e.g.
  // title === og:title or excerpt containing the meta description only appears once.
  const addUniqueParts = (parts: Array<string | undefined>): string => {
    const kept: string[] = [];
    for (const part of parts) {
      if (!part) continue;
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(trimmed);
    }
    return kept.join(WORD_SEPARATOR);
  };

  const domain = extractDomain(url);
  const headings = dedupeCaseInsensitive(signals.headings ?? []).slice(0, MAX_HEADINGS);
  const excerpt = capWords(signals.excerpt, EXCERPT_WORD_CAP);
  const urlTokens = extractUrlPathTokens(url);

  const sections = [
    addUniqueParts([title, signals.ogTitle]),
    addUniqueParts([signals.metaDescription]),
    addUniqueParts([signals.siteName, domain]),
    addUniqueParts(headings),
    addUniqueParts([excerpt]),
    addUniqueParts([urlTokens.join(WORD_SEPARATOR)]),
    addUniqueParts([folderPath]),
  ].filter((section) => section.length > 0);

  const composite = sections.join(SECTION_SEPARATOR);
  return composite.length > COMPOSITE_CHAR_CAP ? composite.slice(0, COMPOSITE_CHAR_CAP) : composite;
}

function capWords(text: string | undefined, wordCap: number): string | undefined {
  if (!text) return undefined;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= wordCap) return text.trim();
  return words.slice(0, wordCap).join(WORD_SEPARATOR);
}

function dedupeCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function extractDomain(url: string): string {
  const parsed = tryParseUrl(url);
  if (!parsed) return '';
  return parsed.hostname.replace(/^www\./i, '');
}

function extractUrlPathTokens(url: string): string[] {
  const parsed = tryParseUrl(url);
  if (!parsed) return [];
  const raw = `${parsed.hostname}${parsed.pathname}`;
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const rawToken of raw.split(URL_TOKEN_DELIMITER_PATTERN)) {
    if (!rawToken) continue;
    const token = rawToken.toLowerCase();
    if (URL_STOP_TOKENS.has(token)) continue;
    if (NUMERIC_TOKEN_PATTERN.test(token)) continue;
    if (token.length >= HEX_TOKEN_MIN_LENGTH && HEX_TOKEN_PATTERN.test(token)) continue;
    if (token.length >= LONG_ID_TOKEN_MIN_LENGTH && /\d/.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function tryParseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
