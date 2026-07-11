// Favicon capture: one small icon fetch per unique bookmark ORIGIN, stored locally so
// the popup never shows a globe for a site the user simply hasn't visited in this
// profile (chrome's _favicon serves visited sites only, and silently falls back to a
// globe — undetectable via onerror). Never a third-party favicon service: the domain
// list stays on this machine. Per origin the sync tries, in order:
//   1. the icon the crawled page DECLARED (<link rel=icon> captured into signals.iconUrl)
//   2. the conventional root /favicon.ico
//   3. a one-time same-origin root-page peek for a declared icon (many modern sites
//      serve no root .ico at all — half the library's origins, measured live)
// All of it runs only under crawl consent (callers gate on crawlEnabled).
import { readCappedText } from './fetcher';
import { getAllIconMeta, putIcons, type IconMeta } from './storage';
import { findIconLinks, pickBestIconUrl } from '../lib/icon-pick';
import type { BookmarkRecord, IconRow } from './types';

/** Bump when the capture strategy improves — negative-cached origins retry ONCE under
 * the new strategy, then settle again. Real icons are never re-fetched.
 * v2: declared-icon + root-page discovery. v3: full-body scan (measured live:
 * WordPress pages with inlined CSS declare their icon 600KB+ into the document). */
export const ICON_SYNC_VERSION = 3;

/** Multi-resolution .ico files run large; anything bigger is not a favicon. */
const ICON_MAX_BYTES = 131_072;
const ICON_TIMEOUT_MS = 8_000;
/** Same bounded read as the crawler's body cap — <link rel=icon> can sit deep
 * in a style-inlined head, NOT in the first few hundred KB. */
const DISCOVERY_HTML_CAP_BYTES = 1_500_000;
/** Modest parallelism — this rides alongside the page crawl, never above it. */
const ICON_CONCURRENCY = 4;
/** Persist in batches so an interrupted sync keeps most of its work. */
const ICON_PERSIST_BATCH = 8;

const IMAGE_CONTENT_TYPE_PATTERN = /^image\//i;
const HTML_CONTENT_TYPE_PATTERN = /\btext\/html\b/i;

/** The icon key for a bookmark URL — http(s) origins only. */
export function iconOriginOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export type IconFetchDeps = { fetchFn?: typeof fetch };

/** Fetch one icon URL. Null = no usable icon there (any failure). */
export async function fetchIconBytes(
  iconUrl: string,
  deps: IconFetchDeps = {},
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_TIMEOUT_MS);
  try {
    const response = await fetchFn(iconUrl, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!IMAGE_CONTENT_TYPE_PATTERN.test(contentType)) return null;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > ICON_MAX_BYTES) return null;
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Peek at the origin's root page for a declared <link rel=icon> — same origin only,
 * bounded read, at most once per origin (the written row remembers the outcome). */
async function discoverDeclaredIconUrl(
  origin: string,
  deps: IconFetchDeps,
): Promise<string | undefined> {
  const fetchFn = deps.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_TIMEOUT_MS);
  try {
    const response = await fetchFn(`${origin}/`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) return undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (!HTML_CONTENT_TYPE_PATTERN.test(contentType)) return undefined;
    const html = await readCappedText(response, DISCOVERY_HTML_CAP_BYTES);
    return pickBestIconUrl(findIconLinks(html), `${origin}/`);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Should this origin be (re-)attempted? Real icons are settled forever; negatives
 * retry once per strategy version, or when a crawl finds a NEW declared icon URL. */
function needsAttempt(row: IconMeta | undefined, declared: string | undefined): boolean {
  if (!row) return true;
  if (row.hasIcon) return false;
  if ((row.syncVersion ?? 1) < ICON_SYNC_VERSION) return true;
  return declared !== undefined && declared !== row.declaredUrl;
}

/** Capture icons for every origin in the library that still lacks one. Idempotent
 * (misses are negative-cached per strategy version), so any interruption just
 * resumes on the next sync. Returns counts for logging. */
export async function syncIcons(
  records: readonly BookmarkRecord[],
  deps: IconFetchDeps = {},
): Promise<{ fetched: number; missing: number }> {
  const declaredByOrigin = new Map<string, string>();
  const origins: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const origin = iconOriginOf(record.canonicalUrl || record.url);
    if (!origin) continue;
    if (!seen.has(origin)) {
      seen.add(origin);
      origins.push(origin);
    }
    const declared = record.signals.iconUrl;
    if (declared !== undefined && !declaredByOrigin.has(origin)) {
      declaredByOrigin.set(origin, declared);
    }
  }

  const metaByOrigin = new Map((await getAllIconMeta()).map((m) => [m.origin, m]));
  const wanted = origins.filter((origin) =>
    needsAttempt(metaByOrigin.get(origin), declaredByOrigin.get(origin)),
  );

  let fetched = 0;
  let missing = 0;
  let pending: IconRow[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    await putIcons(batch);
  };

  let next = 0;
  const worker = async () => {
    while (next < wanted.length) {
      const origin = wanted[next++];
      if (!origin) continue;
      const declared = declaredByOrigin.get(origin);
      let icon = declared !== undefined ? await fetchIconBytes(declared, deps) : null;
      if (!icon) icon = await fetchIconBytes(`${origin}/favicon.ico`, deps);
      let attempted = declared;
      if (!icon) {
        const discovered = await discoverDeclaredIconUrl(origin, deps);
        if (discovered !== undefined && discovered !== declared) {
          icon = await fetchIconBytes(discovered, deps);
        }
        attempted = declared ?? discovered;
      }
      if (icon) fetched++;
      else missing++;
      pending.push({
        origin,
        bytes: icon?.bytes ?? new ArrayBuffer(0),
        contentType: icon?.contentType ?? '',
        updatedAt: Date.now(),
        syncVersion: ICON_SYNC_VERSION,
        declaredUrl: attempted ?? '',
      });
      if (pending.length >= ICON_PERSIST_BATCH) await flush();
    }
  };
  await Promise.all(Array.from({ length: ICON_CONCURRENCY }, () => worker()));
  await flush();
  return { fetched, missing };
}
