// Hover-expanded detail card for a result row (blueprint: "Row focus/hover"
// state). Everything a user needs to disambiguate a result before committing:
// description, full URL, folder path, age, tags. DOM construction + overflow
// measurement only — expansion *timing* (the dwell) lives in popup.ts.
import type { ScoredHit } from '../core/types';
import { tagLabel } from './rowBits';

/** URL marquee speed — slow enough to read while the card is open. */
const MARQUEE_SPEED_PX_PER_S = 28;
/** Below this duration the travel is too short to bother animating. */
const MARQUEE_MIN_DURATION_S = 3;
/** Overflow under ~a character is sub-pixel noise, not truncation. */
const MARQUEE_MIN_OVERFLOW_PX = 12;
const MAX_DETAIL_TAGS = 4;

const FOLDER_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.8 4.2c0-.7.6-1.2 1.2-1.2h3l1.5 1.6h5.5c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z"/></svg>';

export function formatAdded(dateAdded: number, locale?: string): string {
  const when = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(
    new Date(dateAdded),
  );
  return `Added ${when}`;
}

/** Full precision for the date tooltip, e.g. "Wednesday, July 8, 2026 at 3:42 PM". */
export function formatExact(dateAdded: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(dateAdded),
  );
}

export type MarqueeParams = { shiftPx: number; durationS: number };

/** Airport-board travel for overflowing single-line text: shift the text left
 * by exactly the hidden width, at reading speed. Null = fits, don't animate. */
export function marqueeParams(overflowPx: number): MarqueeParams | null {
  if (overflowPx < MARQUEE_MIN_OVERFLOW_PX) return null;
  return {
    shiftPx: -overflowPx,
    durationS: Math.max(MARQUEE_MIN_DURATION_S, overflowPx / MARQUEE_SPEED_PX_PER_S),
  };
}

/** Build the (initially collapsed) detail card. `emphasize` renders literal
 * query-token highlights — injected so this module stays query-agnostic. */
export function buildDetails(
  hit: ScoredHit,
  emphasize: (text: string) => DocumentFragment,
): HTMLDivElement {
  const details = document.createElement('div');
  details.className = 'details';
  const inner = document.createElement('div');
  inner.className = 'details-inner';

  if (hit.description) {
    const desc = document.createElement('p');
    desc.className = 'detail-desc';
    desc.appendChild(emphasize(hit.description));
    inner.appendChild(desc);
  }

  const url = document.createElement('div');
  url.className = 'detail-url';
  const urlText = document.createElement('span');
  urlText.className = 'detail-url-text';
  urlText.textContent = hit.url;
  url.appendChild(urlText);
  inner.appendChild(url);

  const foot = document.createElement('div');
  foot.className = 'detail-foot';
  if (hit.folderPath) {
    const folder = document.createElement('span');
    folder.className = 'detail-folder';
    folder.innerHTML = FOLDER_ICON;
    // Clip wrapper ellipsizes from the LEFT (rtl trick) — the deepest folders
    // are the identifying part of a long path.
    const clip = document.createElement('span');
    clip.className = 'folder-clip';
    const text = document.createElement('span');
    text.className = 'folder-text';
    text.textContent = hit.folderPath;
    clip.appendChild(text);
    folder.appendChild(clip);
    foot.appendChild(folder);
  }
  const added = document.createElement('span');
  added.className = 'detail-added';
  added.textContent = formatAdded(hit.dateAdded);
  // Exact timestamp surfaces as a styled hover tooltip (CSS ::after reads this).
  added.dataset['exact'] = formatExact(hit.dateAdded);
  foot.appendChild(added);
  if (hit.dead) {
    // The words behind the row's quiet link-off mark — calm, and honest that
    // it is one observation, not a verdict.
    const dead = document.createElement('span');
    dead.className = 'detail-dead';
    dead.textContent = 'Unreachable when last checked';
    foot.appendChild(dead);
  }
  for (const tag of hit.tags.slice(0, MAX_DETAIL_TAGS)) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = tagLabel(tag);
    foot.appendChild(chip);
  }
  inner.appendChild(foot);

  details.appendChild(inner);
  return details;
}

/** Toggle the bloom. On expand, measure the URL line and start the marquee iff
 * it overflows (the collapsed card already has final width, so measuring here
 * is safe even though height is still animating). */
export function setExpanded(row: HTMLLIElement, expanded: boolean): void {
  row.classList.toggle('expanded', expanded);
  const urlBox = row.querySelector<HTMLElement>('.detail-url');
  const urlText = row.querySelector<HTMLElement>('.detail-url-text');
  if (!urlBox || !urlText) return;
  urlText.classList.remove('marquee');
  urlBox.classList.remove('masked');
  urlText.style.removeProperty('--marquee-shift');
  urlText.style.removeProperty('--marquee-duration');
  if (!expanded) return;
  const params = marqueeParams(urlText.scrollWidth - urlBox.clientWidth);
  if (!params) return;
  urlText.style.setProperty('--marquee-shift', `${params.shiftPx}px`);
  urlText.style.setProperty('--marquee-duration', `${params.durationS}s`);
  urlText.classList.add('marquee');
  urlBox.classList.add('masked');
}
