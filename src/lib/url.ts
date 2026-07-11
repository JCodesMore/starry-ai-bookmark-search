// URL canonicalization for dedup and stable record identity.
// Rules: lowercase host, strip "www.", drop hash, strip tracking params,
// sort remaining params, trim trailing slash (except root path).

const TRACKING_PARAM_PATTERN = /^(utm_|fbclid$|gclid$|msclkid$|mc_eid$|ref$|ref_src$)/i;

export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim();
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}
