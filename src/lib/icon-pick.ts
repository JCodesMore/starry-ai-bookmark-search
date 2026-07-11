// Chooses the best favicon a page DECLARES (<link rel="icon" ...>), shared by the
// offscreen extractor (which has a parsed DOM) and the icon sync in the service worker
// (which only has raw HTML — no DOMParser in a SW). Harvesting is context-specific;
// the scoring + URL resolution here is the single source of truth for "best icon".
// Never a third-party favicon service: every candidate comes from the page itself.

export type IconLinkCandidate = {
  href: string;
  rel: string;
  sizes?: string;
  type?: string;
};

/** Rendered at 16px in the popup — a 32px source stays crisp on 2x displays. */
const TARGET_ICON_PX = 32;
/** Vector or "any" icons scale cleanly — nearly as good as an exact-size match. */
const SCALABLE_SCORE = 1;
/** A standard icon with no sizes attribute is usually a classic 16/32px favicon. */
const UNSIZED_ICON_SCORE = 15;
/** apple-touch-icon is typically 180px; assume that when it declares no sizes. */
const APPLE_ASSUMED_PX = 180;
/** Prefer any standard icon over apple-touch (oversized, often padded/opaque). */
const APPLE_REL_PENALTY = 100;

/** Match the crawler's body cap: style-inlined pages push <link rel=icon>
 * 600KB+ into the document (measured live) — a short head-only scan misses them. */
const LINK_SCAN_CHARS = 1_500_000;
const LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
const SVG_TYPE_PATTERN = /svg/i;
const SVG_HREF_PATTERN = /\.svg(?:[?#]|$)/i;
const SIZE_TOKEN_PATTERN = /^(\d+)x\d+$/i;

function attrValue(tag: string, name: string): string | undefined {
  // Attribute order and quoting vary in real markup — match this attribute anywhere in the tag.
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const match = pattern.exec(tag);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

/** Regex harvest of <link> icon candidates for DOM-less contexts (the service worker). */
export function findIconLinks(html: string): IconLinkCandidate[] {
  const scan = html.slice(0, LINK_SCAN_CHARS);
  const candidates: IconLinkCandidate[] = [];
  for (const match of scan.matchAll(LINK_TAG_PATTERN)) {
    const tag = match[0];
    const rel = attrValue(tag, 'rel');
    const href = attrValue(tag, 'href');
    if (!rel || !href) continue;
    const candidate: IconLinkCandidate = { href, rel };
    const sizes = attrValue(tag, 'sizes');
    if (sizes !== undefined) candidate.sizes = sizes;
    const type = attrValue(tag, 'type');
    if (type !== undefined) candidate.type = type;
    candidates.push(candidate);
  }
  return candidates;
}

type RelKind = 'icon' | 'apple';

/** mask-icon (monochrome Safari pinned-tab SVGs) and non-icon rels are not usable favicons. */
function classifyRel(rel: string): RelKind | null {
  const tokens = rel.toLowerCase().split(/\s+/);
  if (tokens.includes('icon')) return 'icon'; // covers "icon" and "shortcut icon"
  if (tokens.some((t) => t === 'apple-touch-icon' || t === 'apple-touch-icon-precomposed')) {
    return 'apple';
  }
  return null;
}

function isScalable(candidate: IconLinkCandidate): boolean {
  if (candidate.type !== undefined && SVG_TYPE_PATTERN.test(candidate.type)) return true;
  return SVG_HREF_PATTERN.test(candidate.href);
}

/** Lower is better: distance from the target render size, apple-touch penalized. */
function scoreCandidate(candidate: IconLinkCandidate, kind: RelKind): number {
  const relPenalty = kind === 'apple' ? APPLE_REL_PENALTY : 0;

  const sizeTokens = (candidate.sizes ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  let best: number | undefined;
  for (const token of sizeTokens) {
    if (token === 'any') {
      best = Math.min(best ?? Infinity, SCALABLE_SCORE);
      continue;
    }
    const match = SIZE_TOKEN_PATTERN.exec(token);
    if (!match?.[1]) continue;
    best = Math.min(best ?? Infinity, Math.abs(Number(match[1]) - TARGET_ICON_PX));
  }
  if (best !== undefined) return best + relPenalty;

  if (isScalable(candidate)) return SCALABLE_SCORE + relPenalty;
  const assumed =
    kind === 'apple' ? Math.abs(APPLE_ASSUMED_PX - TARGET_ICON_PX) : UNSIZED_ICON_SCORE;
  return assumed + relPenalty;
}

function resolveHttpUrl(href: string, baseUrl: string): string | undefined {
  try {
    const resolved = new URL(href, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return undefined;
    return resolved.href;
  } catch {
    return undefined;
  }
}

/** The single best declared icon URL (absolute, http/https), or undefined if none usable. */
export function pickBestIconUrl(
  candidates: readonly IconLinkCandidate[],
  baseUrl: string,
): string | undefined {
  let bestUrl: string | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const kind = classifyRel(candidate.rel);
    if (kind === null) continue;
    const url = resolveHttpUrl(candidate.href, baseUrl);
    if (url === undefined) continue;
    const score = scoreCandidate(candidate, kind);
    if (score < bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
}
