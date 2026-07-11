// The "pin me" teaching card: an illustrated two-step (puzzle piece → pin)
// that flips into a live celebration the moment the user actually pins the
// extension. chrome.action.getUserSettings().isOnToolbar is the truth;
// onUserSettingsChanged (Chrome 130+) pushes changes, with a poll fallback
// for engines that predate the event. Already pinned = nothing to teach.
const PIN_POLL_MS = 1500;

export function watchPinState(): void {
  const card = document.querySelector<HTMLElement>('#pin-card');
  const title = document.querySelector<HTMLElement>('#pin-title');
  const desc = document.querySelector<HTMLElement>('#pin-desc');
  if (!card || !title || !desc) return;

  const markPinned = (): void => {
    card.classList.add('pinned');
    title.textContent = 'Pinned — I’m right up there when you need me';
    desc.textContent = 'Tip: Alt+B opens me from anywhere, too.';
  };

  void chrome.action.getUserSettings().then((settings) => {
    if (settings.isOnToolbar) return; // nothing to teach
    card.hidden = false;

    if (chrome.action.onUserSettingsChanged) {
      chrome.action.onUserSettingsChanged.addListener((change) => {
        if (change.isOnToolbar) markPinned();
      });
      return;
    }
    const timer = setInterval(() => {
      void chrome.action.getUserSettings().then((now) => {
        if (!now.isOnToolbar) return;
        clearInterval(timer);
        markPinned();
      });
    }, PIN_POLL_MS);
  });
}

/** Learning finished but the card is still teaching: the card STAYS on the
 * "All set." stage until actually pinned — only the "while I work" framing
 * stops making sense, so settle the title. */
export function settlePinTitle(): void {
  const card = document.querySelector<HTMLElement>('#pin-card');
  const title = document.querySelector<HTMLElement>('#pin-title');
  if (!card || !title || card.hidden || card.classList.contains('pinned')) return;
  title.textContent = 'Pin me to your toolbar';
}
