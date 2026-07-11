// Custom right-click menu for result rows (WAI-ARIA APG menu pattern: role=menu,
// menuitems with roving focus, Escape closes and restores focus, Tab closes).
// Management actions (Reveal / Delete) live HERE — behind an explicit gesture —
// so hovering a row never swaps an icon's meaning under a stationary cursor
// (ux-blueprint: pointer stability is inviolable).
// position:fixed on document.body escapes the list's overflow clipping, the
// same pattern the undo toast uses.

export type ContextMenuItem = {
  label: string;
  /** Destructive styling (Delete) — red only on hover/focus, like the old button. */
  danger?: boolean;
  action: () => void;
};

/** Keep the menu fully inside the popup viewport; flip past this margin. */
const EDGE_MARGIN_PX = 6;

let menuEl: HTMLDivElement | null = null;
let teardown: (() => void) | null = null;

export function isMenuOpen(): boolean {
  return menuEl !== null;
}

export function closeContextMenu(): void {
  teardown?.();
  teardown = null;
  menuEl?.remove();
  menuEl = null;
}

function menuButtons(): HTMLButtonElement[] {
  return menuEl ? [...menuEl.querySelectorAll('button')] : [];
}

function focusItem(delta: number): void {
  const buttons = menuButtons();
  if (!buttons.length) return;
  const current = buttons.findIndex((b) => b === document.activeElement);
  const next = current === -1 ? 0 : (current + delta + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

function handleMenuKeydown(e: KeyboardEvent, restoreFocus: () => void): void {
  if (e.key === 'Escape') {
    // Ours alone: without stopPropagation the input's Escape handler would
    // close the whole popup instead of just this menu.
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();
    restoreFocus();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusItem(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusItem(-1);
  } else if (e.key === 'Home') {
    e.preventDefault();
    menuButtons()[0]?.focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    menuButtons().at(-1)?.focus();
  } else if (e.key === 'Tab') {
    // APG: Tab closes the menu and moves on naturally — no preventDefault.
    closeContextMenu();
    restoreFocus();
  }
}

/** Opens the menu at (x, y) — pointer coords or a keyboard-derived anchor —
 * flipped/clamped to stay inside the popup. Focus lands on the first item
 * (APG); `restoreFocus` runs on dismissal so the keyboard flow resumes where
 * it left off (the search input is the popup's focus home). */
export function openContextMenu(
  x: number,
  y: number,
  items: ContextMenuItem[],
  restoreFocus: () => void,
): void {
  closeContextMenu(); // a second right-click replaces the menu, never stacks

  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'overlay-menu'; // shared floating-surface material (popup.css)
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-orientation', 'vertical');

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.tabIndex = -1; // roving focus — arrows move it, Tab leaves the menu
    btn.textContent = item.label;
    if (item.danger) btn.classList.add('danger');
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // the row beneath must not also open the bookmark
      closeContextMenu();
      item.action();
    });
    menu.appendChild(btn);
  }

  menu.addEventListener('keydown', (e) => handleMenuKeydown(e, restoreFocus));

  // Any interaction outside the menu dismisses it (WCAG 1.4.13 dismissible);
  // capture phase so a click that opens something else still closes us first.
  const onPointerDown = (e: PointerEvent) => {
    if (menu.contains(e.target as Node)) return;
    closeContextMenu();
  };
  const onWheel = () => {
    // Scrolling is navigation — same rule that collapses the detail card.
    closeContextMenu();
  };
  const onBlur = () => closeContextMenu();
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  document.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('blur', onBlur);
  teardown = () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    document.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('blur', onBlur);
  };

  // Measure hidden, then flip/clamp so the menu never clips at an edge.
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);
  menuEl = menu;
  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - EDGE_MARGIN_PX) {
    left = Math.max(EDGE_MARGIN_PX, x - rect.width);
  }
  if (top + rect.height > window.innerHeight - EDGE_MARGIN_PX) {
    top = Math.max(EDGE_MARGIN_PX, y - rect.height);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = '';
  menu.classList.add('open');

  menuButtons()[0]?.focus();
}
