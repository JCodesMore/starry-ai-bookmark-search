// First-run lifecycle state: has the user completed onboarding? Nothing may
// index, crawl, download the model, or fetch icons before this is true —
// onboarding IS the moment the user chooses what gets indexed and consents to
// the page crawl. Distinct from prefs (choices); this is a one-way latch.
import { countRecords, getMeta, setMeta } from './storage';

const ONBOARDED_KEY = 'onboardingComplete';

/**
 * True once onboarding has completed. Installs that predate the flag (and the
 * dev profile) are grandfathered: an existing index means onboarding-equivalent
 * choices were already made, so the latch sets itself on first read. After a
 * factory reset (clearAll wipes both the flag and the records) this is false
 * again — exactly the fresh-install state.
 */
export async function isOnboarded(): Promise<boolean> {
  if (await getMeta<boolean>(ONBOARDED_KEY)) return true;
  if ((await countRecords()) > 0) {
    await setOnboarded();
    return true;
  }
  return false;
}

export function setOnboarded(): Promise<void> {
  return setMeta(ONBOARDED_KEY, true);
}
