// Row presentation atoms: pure, stateless helpers the result rows are built
// from. No popup state in here — popup.ts owns state, this owns pixels.
import { MATCH_REASON, type ScoredHit } from '../core/types';
import { TAXONOMY } from '../core/taxonomy';
import { escapeRegExp } from '../lib/text';
import { getIcon } from '../core/storage';
import { iconOriginOf } from '../core/icons';

export { faviconUrl } from '../lib/favicon';

const TAG_LABELS: ReadonlyMap<string, string> = new Map(TAXONOMY.map((t) => [t.id, t.label]));

/** Human-facing tag text: taxonomy ids get their curated label ("dev-repos" →
 * "Dev Repos"); learned topic labels are already words and pass through. */
export function tagLabel(tag: string): string {
  return TAG_LABELS.get(tag) ?? tag;
}

/** origin → objectURL promise (null = no stored icon). Popup-lifetime cache. */
const iconUrlCache = new Map<string, Promise<string | null>>();

/** Swap in the crawl-captured icon when one exists. The _favicon fallback is
 * already on the img; its globe fallback is undetectable (never errors), so a
 * stored icon simply wins whenever we hold one. */
export function applyStoredIcon(img: HTMLImageElement, pageUrl: string): void {
  const origin = iconOriginOf(pageUrl);
  if (!origin) return;
  let promise = iconUrlCache.get(origin);
  if (!promise) {
    promise = getIcon(origin).then((row) =>
      row && row.bytes.byteLength
        ? URL.createObjectURL(new Blob([row.bytes], { type: row.contentType }))
        : null,
    );
    iconUrlCache.set(origin, promise);
  }
  void promise.then((url) => {
    if (url) img.src = url;
  });
}

export const OPEN_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h7v7M13 3 7 9"/><path d="M11 9v4H3V5h4"/></svg>';
export const COPY_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 4v5A1.5 1.5 0 0 0 4.5 10.5H5"/></svg>';
export const CHECK_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 8.5l3 3 6-7"/></svg>';
export const LINK_OFF_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6.3 9.7 5.1 10.9a2.45 2.45 0 0 0 3.46 3.47l1.2-1.2M9.7 6.3l1.2-1.2a2.45 2.45 0 0 1 3.47 3.46L13.2 9.8"/><path d="M3 3l10 10"/></svg>';

/** Quiet dead-link marker for the row meta line: the page didn't answer when
 * last crawled. Informational, never alarming — the bookmark still works as a
 * search result and the site may simply have been down that day. */
export function deadMark(): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.className = 'dead-mark';
  mark.innerHTML = LINK_OFF_ICON;
  mark.setAttribute('aria-label', 'Didn’t respond last time I checked');
  return mark;
}

/** How long the copy button wears its success check before reverting. */
const COPY_FLASH_MS = 1200;

/** Copy-link action with VISIBLE success: the icon flips to an accent check
 * for a beat (and the tooltip reads "Copied") — a clipboard write is otherwise
 * invisible and reads as a dead button. */
export function copyActionButton(url: string): HTMLButtonElement {
  const btn = actionButton(COPY_ICON, 'Copy link', () => {
    void navigator.clipboard.writeText(url).then(() => {
      btn.innerHTML = CHECK_ICON;
      btn.setAttribute('aria-label', 'Copied');
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.setAttribute('aria-label', 'Copy link');
        btn.classList.remove('copied');
      }, COPY_FLASH_MS);
    });
  });
  return btn;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Show-don't-tell with honesty: emphasize LITERAL query-token hits (exact or
 * prefix) in visible text. Semantic-only matches get no fake highlights —
 * their explanation is the "related" chip (blueprint rule 7).
 */
export function highlight(text: string, queryTokens: readonly string[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!queryTokens.length || !text) {
    fragment.append(text);
    return fragment;
  }
  const pattern = new RegExp(`\\b(?:${queryTokens.map(escapeRegExp).join('|')})[a-z0-9]*`, 'gi');
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > last) fragment.append(text.slice(last, start));
    const b = document.createElement('b');
    b.textContent = match[0];
    fragment.append(b);
    last = start + match[0].length;
  }
  if (last < text.length) fragment.append(text.slice(last));
  return fragment;
}

// One honest explanation per row; title matches are self-evident → no chip (rule 7).
export function reasonChip(hit: ScoredHit): string | null {
  switch (hit.reason) {
    case MATCH_REASON.Semantic:
      return 'related';
    case MATCH_REASON.Tag:
      return hit.tags[0] ? tagLabel(hit.tags[0]) : 'tag';
    case MATCH_REASON.Folder:
      return 'folder';
    default:
      return null;
  }
}

export function actionButton(
  iconSvg: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  // No native title: every action gets the styled attr(aria-label) tooltip.
  btn.setAttribute('aria-label', label);
  btn.innerHTML = iconSvg;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}
