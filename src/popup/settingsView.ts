// Settings screen content (one level down behind the gear — blueprint rule 5).
// The screen's enter/exit lives in popup.ts; this module only fills the rows.
// Preference rows mirror onboarding and write through the SW's set-prefs.
import type { GetPrefsMessage, PrefsResponse, SetPrefsMessage } from '../lib/messages';
import type { Prefs } from '../core/prefs';
import { releaseCrawlPermission, requestCrawlPermission } from '../lib/crawl-permission';

export type SettingsCallbacks = {
  /** Kick the status poller after actions that start index work. */
  pollStatus: () => void;
  /** Leave the settings screen (used after destructive actions). */
  closeSettings: () => void;
};

function settingsRow(name: string, desc: string, button: HTMLButtonElement): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const label = document.createElement('div');
  label.className = 'settings-label';
  const nameEl = document.createElement('span');
  nameEl.className = 'name';
  nameEl.textContent = name;
  const descEl = document.createElement('span');
  descEl.className = 'desc';
  descEl.textContent = desc;
  label.append(nameEl, descEl);
  row.append(label, button);
  return row;
}

function settingsButton(
  text: string,
  onClick: (btn: HTMLButtonElement) => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'settings-btn';
  btn.textContent = text;
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

async function fetchPrefs(): Promise<Prefs> {
  const message: GetPrefsMessage = { type: 'get-prefs' };
  const res = (await chrome.runtime.sendMessage(message)) as PrefsResponse;
  return res.prefs;
}

/** The crawl-consent toggle: label mirrors state, a click writes the flip
 * through the SW (which aborts or restarts the crawl as needed). Turning ON
 * asks the browser for host access FIRST — synchronously in the gesture, a
 * later await would lose user activation — and only a grant flips the pref.
 * Turning OFF also releases the permission (a no-op in the dev build, where
 * it is required rather than optional). */
function crawlToggle(): HTMLButtonElement {
  let prefs: Prefs | null = null;
  const write = (next: Prefs) => {
    prefs = next;
    btn.textContent = next.crawlEnabled ? 'On' : 'Off';
    const message: SetPrefsMessage = { type: 'set-prefs', prefs: next };
    void chrome.runtime.sendMessage(message);
  };
  const btn = settingsButton('…', () => {
    if (!prefs) return; // state not loaded yet — a blind flip could clobber it
    const loaded = prefs;
    if (loaded.crawlEnabled) {
      write({ ...loaded, crawlEnabled: false });
      void releaseCrawlPermission();
      return;
    }
    void requestCrawlPermission().then((granted) => {
      if (granted) write({ ...loaded, crawlEnabled: true });
    });
  });
  void fetchPrefs().then((loaded) => {
    prefs = loaded;
    btn.textContent = loaded.crawlEnabled ? 'On' : 'Off';
  });
  return btn;
}

export function renderSettings(container: HTMLDivElement, cb: SettingsCallbacks): void {
  let resetArmed = false;
  const chooseBtn = settingsButton('Choose…', () => {
    // The onboarding page doubles as the folder chooser — same list, same prefs.
    void chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html?customize') });
    window.close();
  });
  const reindexBtn = settingsButton('Re-index', (btn) => {
    btn.textContent = 'Rebuilding…';
    btn.disabled = true; // avoid duplicate concurrent jobs (research: onboarding UX)
    void chrome.runtime.sendMessage({ type: 'reindex' }).then(() => cb.pollStatus());
  });
  // Destructive → the ONE place a confirmation exists (rule 10): two-step arm.
  const resetBtn = settingsButton('Reset…', (btn) => {
    if (!resetArmed) {
      resetArmed = true;
      btn.textContent = 'Confirm reset';
      btn.classList.add('danger');
      return;
    }
    btn.textContent = 'Resetting…';
    btn.disabled = true;
    void chrome.runtime.sendMessage({ type: 'reset-data' }).then(() => {
      cb.closeSettings();
      cb.pollStatus();
    });
  });
  container.replaceChildren(
    settingsRow('Read page content', 'Better matches — pages are fetched locally', crawlToggle()),
    settingsRow('Included folders', 'Pick which folders show up in search', chooseBtn),
    settingsRow('Rebuild index', 'Refresh all bookmarks in the search index', reindexBtn),
    settingsRow('Reset data', 'Erase everything and start setup over', resetBtn),
  );
}
