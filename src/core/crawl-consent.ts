// Crawl/icon network work runs only with BOTH the user's stored consent and
// the live browser permission — either can disappear independently (prefs via
// settings, the permission via chrome://extensions site-access controls), so
// callers check this per use rather than caching.
import { getPrefs } from './prefs';
import { hasCrawlPermission } from '../lib/crawl-permission';

export async function hasCrawlConsent(): Promise<boolean> {
  if (!(await getPrefs()).crawlEnabled) return false;
  return hasCrawlPermission();
}
