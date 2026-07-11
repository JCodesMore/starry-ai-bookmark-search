// The browser-level permission behind crawl consent. The store manifest keeps
// <all_urls> OPTIONAL so installing shows no "all your data on all websites"
// warning — access is requested at the moment the user consents (onboarding
// "Start learning" / settings toggle) and revoked when they withdraw it.
//
// Gesture rule (crbug.com/1284891): chrome.permissions.request() must be the
// FIRST call inside the click handler — user activation does not survive an
// earlier await. When the origins are already granted (or required, as in the
// dev build) request() resolves true without showing a prompt.
const CRAWL_ORIGINS = { origins: ['<all_urls>'] };

export function hasCrawlPermission(): Promise<boolean> {
  return chrome.permissions.contains(CRAWL_ORIGINS);
}

export function requestCrawlPermission(): Promise<boolean> {
  return chrome.permissions.request(CRAWL_ORIGINS).catch(() => false);
}

/** Revoke on consent withdrawal. A no-op when the permission is required
 * (dev build) — removing a required permission rejects, which we swallow. */
export function releaseCrawlPermission(): Promise<boolean> {
  return chrome.permissions.remove(CRAWL_ORIGINS).catch(() => false);
}
