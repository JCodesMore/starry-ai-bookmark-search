// The extension's _favicon endpoint (manifest "favicon" permission): Chrome's
// own icon cache, shared by every extension surface that shows bookmark icons.
// Never errors — unknown origins render the standard globe.

const FAVICON_SIZE = 32;

export function faviconUrl(pageUrl: string, size: number = FAVICON_SIZE): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}
