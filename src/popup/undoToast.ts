// Undo toast: for a single bookmark the confirmation IS the escape hatch —
// Undo-after, never confirm-before (blueprint rule 10).
import type { UndoDeleteMessage } from '../lib/messages';

/** How long the undo offer stays. Losing it just means the delete stands. */
const UNDO_TOAST_MS = 8000;
/** Undo restores via bookmark events → debounced re-index; refresh after. */
const UNDO_REFRESH_MS = 1200;
const MAX_TOAST_TITLE = 28;

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** How long a quiet confirmation stays — read-and-gone, nothing to act on. */
const INFO_TOAST_MS = 1800;

/** Quiet confirmation toast ("Link copied") — same surface, no action button. */
export function showToast(message: string): void {
  document.querySelector('#toast')?.remove();
  clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.id = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);
  document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), INFO_TOAST_MS);
}

/** Shows “Removed ‘title’ · Undo”. `onUndone` runs once the restore has had
 * time to land back in the index. */
export function showUndoToast(title: string, onUndone: () => void): void {
  document.querySelector('#toast')?.remove();
  clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.id = 'toast';
  const text = document.createElement('span');
  const short = title.length > MAX_TOAST_TITLE ? `${title.slice(0, MAX_TOAST_TITLE)}…` : title;
  text.textContent = `Removed “${short}”`;
  const undo = document.createElement('button');
  undo.textContent = 'Undo';
  undo.addEventListener('click', () => {
    const message: UndoDeleteMessage = { type: 'undo-delete' };
    void chrome.runtime.sendMessage(message).then(() => {
      toast.remove();
      setTimeout(onUndone, UNDO_REFRESH_MS);
    });
  });
  toast.append(text, undo);
  document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), UNDO_TOAST_MS);
}
