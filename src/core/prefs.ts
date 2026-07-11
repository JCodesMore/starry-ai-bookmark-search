// User preferences (onboarding + settings): what gets indexed and whether the
// crawler may read page content. Stored in the meta store; absent = defaults.
import { getMeta, setMeta } from './storage';

export type Prefs = {
  /** May the extension fetch bookmarked pages (and their favicons)? The
   * baseline title/url/folder index is NOT gated — it uses no network. */
  crawlEnabled: boolean;
  /** Bookmark FOLDER ids whose whole subtree stays out of the index. */
  excludedFolderIds: string[];
};

export const DEFAULT_PREFS: Prefs = { crawlEnabled: true, excludedFolderIds: [] };

const PREFS_KEY = 'prefs';

export async function getPrefs(): Promise<Prefs> {
  const stored = await getMeta<Partial<Prefs>>(PREFS_KEY);
  return { ...DEFAULT_PREFS, ...stored };
}

export function setPrefs(prefs: Prefs): Promise<void> {
  return setMeta(PREFS_KEY, prefs);
}
