// Pure DOM-signal extraction for the offscreen document (decision 002).
// No chrome.* here — this file must stay unit-testable outside a browser context.
import { Readability } from '@mozilla/readability';
import { pickBestIconUrl, type IconLinkCandidate } from '../lib/icon-pick';
import type { PageSignals } from '../core/types';

const MAX_HEADINGS = 5;
const MAX_EXCERPT_WORDS = 300;
const WHITESPACE_PATTERN = /\s+/g;

/** `title` is the resolved best-guess title (og:title, else <title>) — not a PageSignals field. */
export type ExtractedSignals = PageSignals & { title?: string };

/** Collapse any run of whitespace (incl. newlines/tabs) to a single space and trim ends. */
export function collapseWhitespace(text: string): string {
  return text.replace(WHITESPACE_PATTERN, ' ').trim();
}

/** Keep only the first `maxWords` whitespace-delimited words of already-collapsed text. */
export function capWords(text: string, maxWords: number): string {
  const words = text.split(' ').filter((word) => word.length > 0);
  return words.slice(0, maxWords).join(' ');
}

/** First defined, non-blank, trimmed candidate — merges signal sources by priority. */
export function firstNonEmpty(...candidates: Array<string | null | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

/** Trim, drop empties, dedupe case-insensitively (first occurrence wins), cap at maxCount. */
export function dedupeHeadings(headings: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of headings) {
    const trimmed = collapseWhitespace(raw);
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= maxCount) break;
  }
  return result;
}

/** Indirection so callers (and future tests) can swap in a different DOMParser implementation. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function metaContent(dom: Document, selector: string): string | undefined {
  const el = dom.querySelector(selector);
  return el?.getAttribute('content') ?? undefined;
}

function extractHeadings(dom: Document): string[] {
  const nodes = dom.querySelectorAll('h1, h2');
  const texts = [...nodes].map((node) => node.textContent ?? '');
  return dedupeHeadings(texts, MAX_HEADINGS);
}

// DOM harvest of declared-icon candidates; icon-pick.ts owns the "best one" scoring
// (shared with the service worker's regex-based harvest, which has no DOMParser).
function extractIconUrl(dom: Document, url: string): string | undefined {
  const candidates: IconLinkCandidate[] = [...dom.querySelectorAll('link[rel]')].map((el) => {
    const candidate: IconLinkCandidate = {
      href: el.getAttribute('href') ?? '',
      rel: el.getAttribute('rel') ?? '',
    };
    const sizes = el.getAttribute('sizes');
    if (sizes !== null) candidate.sizes = sizes;
    const type = el.getAttribute('type');
    if (type !== null) candidate.type = type;
    return candidate;
  });
  return pickBestIconUrl(candidates, url);
}

// Readability resolves relative hrefs/srcs off the document's base URI; the DOM we're handed
// was parsed standalone (no navigation context), so point it at the real page URL first.
function setBaseHref(doc: Document, url: string): void {
  const existing = doc.querySelector('base');
  const base = existing ?? doc.createElement('base');
  base.setAttribute('href', url);
  if (!existing) doc.head.prepend(base);
}

// Readability.parse() mutates the document it's given — always hand it a clone (per its docs).
function extractReadableExcerpt(dom: Document, url: string): string | undefined {
  const clone = dom.cloneNode(true) as Document;
  setBaseHref(clone, url);
  const article = new Readability(clone).parse();
  if (!article?.textContent) return undefined; // no article found, or an empty one
  const collapsed = collapseWhitespace(article.textContent);
  return collapsed.length > 0 ? capWords(collapsed, MAX_EXCERPT_WORDS) : undefined;
}

export function extractSignals(html: string, url: string, dom: Document): ExtractedSignals {
  // Empty responses (e.g. a redirect resolving to a blank page) carry no meaningful signals —
  // skip DOM work entirely rather than running Readability over an effectively empty document.
  if (html.trim().length === 0) return {};

  const ogTitle = firstNonEmpty(metaContent(dom, 'meta[property="og:title"]'));
  const title = firstNonEmpty(ogTitle, dom.querySelector('title')?.textContent);
  const metaDescription = firstNonEmpty(
    metaContent(dom, 'meta[property="og:description"]'),
    metaContent(dom, 'meta[name="description"]'),
  );
  const siteName = firstNonEmpty(metaContent(dom, 'meta[property="og:site_name"]'));
  const headings = extractHeadings(dom);
  const excerpt = extractReadableExcerpt(dom, url);
  const iconUrl = extractIconUrl(dom, url);

  const signals: ExtractedSignals = {};
  if (ogTitle !== undefined) signals.ogTitle = ogTitle;
  if (title !== undefined) signals.title = title;
  if (metaDescription !== undefined) signals.metaDescription = metaDescription;
  if (siteName !== undefined) signals.siteName = siteName;
  if (headings.length > 0) signals.headings = headings;
  if (excerpt !== undefined) signals.excerpt = excerpt;
  if (iconUrl !== undefined) signals.iconUrl = iconUrl;
  return signals;
}
