// Fetches a bookmarked page and turns it into PageSignals (decision 002: fetch-with-floor).
// Runs in the service worker: talks to the network directly (fetch bypasses CORS with host
// permissions) and delegates HTML parsing to the offscreen document, since the SW itself has
// no DOMParser (architecture.md). Every path returns a FetchOutcome — this must never throw,
// because one bad page can't be allowed to break the crawl queue driving it (decision 002).
import { callOffscreen } from './offscreen-client';
import { FETCH_STATUS, type FetchStatus, type PageSignals } from './types';
import type { ExtractRequest, ExtractResult } from '../offscreen/offscreen';

// -- Tunables (decision 002: "crawl etiquette" + "the floor, not the ceiling") --
const FETCH_TIMEOUT_MS = 12_000;
// ~1.5 MB is generous for a real article but small next to a PDF/video blob mislabeled text/html.
const MAX_BODY_BYTES = 1_500_000;
// Meta/OG tags always live in <head>, well inside the first ~200 KB even of a heavy page.
const REGEX_FALLBACK_SCAN_CHARS = 200_000;
const ACCEPT_HEADER_VALUE = 'text/html';

const HTML_CONTENT_TYPE_PATTERN = /\btext\/html\b/i;

export type FetchOutcome = {
  status: FetchStatus;
  title?: string;
  signals: PageSignals;
  /** Diagnostic context for logs (error/timeout detail) — never surfaced to the user. */
  detail?: string;
};

export type FetcherDeps = {
  fetchFn?: typeof fetch;
  extract?: (html: string, url: string) => Promise<ExtractResult>;
};

export async function fetchPageSignals(url: string, deps: FetcherDeps = {}): Promise<FetchOutcome> {
  const fetchFn = deps.fetchFn ?? fetch;
  const extract = deps.extract ?? extractViaOffscreen;

  const attempt = await fetchWithTimeout(fetchFn, url);
  if (!attempt.ok) return { status: FETCH_STATUS.Dead, signals: {}, detail: attempt.detail };

  const { response } = attempt;
  if (!isHtmlResponse(response)) {
    // Nothing extractable (PDF, video, image, ...) — don't bother reading the body at all.
    await response.body?.cancel().catch(() => undefined);
    return { status: FETCH_STATUS.Baseline, signals: {} };
  }

  const html = await readCappedText(response, MAX_BODY_BYTES);
  return extractFromHtml(html, url, extract);
}

// -- Network --

type FetchAttempt = { ok: true; response: Response } | { ok: false; detail: string };

async function fetchWithTimeout(fetchFn: typeof fetch, url: string): Promise<FetchAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: ACCEPT_HEADER_VALUE },
    });
    if (!response.ok) {
      // 408/425/429/5xx are retried by queue.ts, not here — a single attempt either yields
      // signals now or the bookmark keeps its baseline signals until the queue retries it.
      return { ok: false, detail: `HTTP ${response.status} ${response.statusText}`.trim() };
    }
    return { ok: true, response };
  } catch (err) {
    return { ok: false, detail: describeFetchError(err) };
  } finally {
    clearTimeout(timer);
  }
}

function describeFetchError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return `timed out after ${FETCH_TIMEOUT_MS}ms`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? '';
  return HTML_CONTENT_TYPE_PATTERN.test(contentType);
}

// Reads the body up to `capBytes`, cancelling the stream once the cap is hit so a huge or
// slow-drip response can never grow unbounded memory (architecture.md: "memory ceiling is a
// hard requirement"). Falls back to text()+slice for responses without a streaming body (some
// test doubles) — real fetch() responses always take the streaming path. Exported for the
// icon sync's root-page peek (icons.ts), which needs the same bounded-read guarantee.
export async function readCappedText(response: Response, capBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const full = await response.text();
    return full.length > capBytes ? full.slice(0, capBytes) : full;
  }

  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  for (;;) {
    const { done, value } = await reader.read();
    // Check `value` itself (not just `done`) so TS narrows it to defined without relying on
    // cross-field discrimination of the destructured read result.
    if (done || !value) break;
    text += decoder.decode(value, { stream: true });
    bytesRead += value.byteLength;
    if (bytesRead >= capBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text.length > capBytes ? text.slice(0, capBytes) : text;
}

// -- Offscreen extraction + regex fallback --

async function extractViaOffscreen(html: string, url: string): Promise<ExtractResult> {
  const request: ExtractRequest = { target: 'offscreen', type: 'extract', html, url };
  return callOffscreen<ExtractRequest, ExtractResult>(request);
}

type ExtractAttempt =
  { ok: true; signals: PageSignals; title?: string } | { ok: false; detail: string };

async function tryExtract(
  extract: (html: string, url: string) => Promise<ExtractResult>,
  html: string,
  url: string,
): Promise<ExtractAttempt> {
  try {
    const result = await extract(html, url);
    if (!result.ok) return { ok: false, detail: result.error };
    return result.title === undefined
      ? { ok: true, signals: result.signals }
      : { ok: true, signals: result.signals, title: result.title };
  } catch (err) {
    // The offscreen document/DOMParser/Readability threw — fall back to regexes rather than
    // letting one malformed page kill the whole fetch outcome.
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function extractFromHtml(
  html: string,
  url: string,
  extract: (html: string, url: string) => Promise<ExtractResult>,
): Promise<FetchOutcome> {
  const attempt = await tryExtract(extract, html, url);
  if (attempt.ok) {
    const status = attempt.signals.excerpt ? FETCH_STATUS.Full : FETCH_STATUS.MetaOnly;
    return attempt.title === undefined
      ? { status, signals: attempt.signals }
      : { status, signals: attempt.signals, title: attempt.title };
  }
  return { ...regexFallbackOutcome(html), detail: attempt.detail };
}

function regexFallbackOutcome(html: string): FetchOutcome {
  const { signals, title } = regexFallbackExtract(html);
  const hasSignal = Object.keys(signals).length > 0 || title !== undefined;
  const status = hasSignal ? FETCH_STATUS.MetaOnly : FETCH_STATUS.Baseline;
  return title === undefined ? { status, signals } : { status, signals, title };
}

const META_TAG_ATTR_PATTERN = (attrValue: string): RegExp =>
  new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*(?:"${attrValue}"|'${attrValue}')[^>]*>`, 'i');
const OG_TITLE_TAG_PATTERN = META_TAG_ATTR_PATTERN('og:title');
const OG_DESCRIPTION_TAG_PATTERN = META_TAG_ATTR_PATTERN('og:description');
const META_DESCRIPTION_TAG_PATTERN =
  /<meta\b[^>]*name\s*=\s*(?:"description"|'description')[^>]*>/i;
const OG_SITE_NAME_TAG_PATTERN = META_TAG_ATTR_PATTERN('og:site_name');
const TITLE_TAG_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const CONTENT_ATTR_PATTERN = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

const HTML_ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|#39|nbsp);/g;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(HTML_ENTITY_PATTERN, (match, name: string) => HTML_ENTITY_MAP[name] ?? match);
}

// Attribute order in real-world markup varies (`content` before or after `property`/`name`),
// so we match the whole <meta> tag first, then pull `content` out of that tag in a second pass
// rather than relying on a single fixed-order regex.
function findMetaContent(scan: string, tagPattern: RegExp): string | undefined {
  const tagMatch = tagPattern.exec(scan);
  if (!tagMatch) return undefined;
  const contentMatch = CONTENT_ATTR_PATTERN.exec(tagMatch[0]);
  const raw = contentMatch?.[1] ?? contentMatch?.[2];
  if (raw === undefined) return undefined;
  const decoded = decodeHtmlEntities(raw).trim();
  return decoded.length > 0 ? decoded : undefined;
}

function extractTitleTag(scan: string): string | undefined {
  const match = TITLE_TAG_PATTERN.exec(scan);
  if (!match?.[1]) return undefined;
  const decoded = decodeHtmlEntities(match[1]).trim();
  return decoded.length > 0 ? decoded : undefined;
}

// Best-effort meta/OG extraction without a DOM (decision 002: "works even for JS-shell SPAs,
// which usually still ship meta tags"). Only used when the offscreen extractor itself fails.
function regexFallbackExtract(html: string): { signals: PageSignals; title?: string } {
  const scan = html.slice(0, REGEX_FALLBACK_SCAN_CHARS);

  const ogTitle = findMetaContent(scan, OG_TITLE_TAG_PATTERN);
  const metaDescription =
    findMetaContent(scan, OG_DESCRIPTION_TAG_PATTERN) ??
    findMetaContent(scan, META_DESCRIPTION_TAG_PATTERN);
  const siteName = findMetaContent(scan, OG_SITE_NAME_TAG_PATTERN);
  const title = ogTitle ?? extractTitleTag(scan);

  const signals: PageSignals = {};
  if (ogTitle !== undefined) signals.ogTitle = ogTitle;
  if (metaDescription !== undefined) signals.metaDescription = metaDescription;
  if (siteName !== undefined) signals.siteName = siteName;

  return title === undefined ? { signals } : { signals, title };
}
