// Styled replacement for the native <select> in the browse controls — the
// WAI-ARIA APG "menu button" pattern with menuitemradio items (each control
// picks exactly ONE value). Shares the context menu's overlay material
// (.overlay-menu) so every floating surface in the popup reads as one design.
// Unlike the context menu, the option list can be LONG (folder paths), so the
// panel scrolls and wheel events inside it must scroll, not dismiss.

export type DropdownOption = {
  label: string;
  value: string;
  /** Ellipsize from the START when the label overflows — folder paths keep
   * their deepest (identifying) segment visible instead of a shared prefix. */
  clipStart?: boolean;
};

/** Keep the panel fully inside the popup viewport; flip above past this margin. */
const EDGE_MARGIN_PX = 6;
/** Air between the trigger's baseline and the panel. */
const TRIGGER_GAP_PX = 4;
/** A click on the trigger while its panel is open must TOGGLE it closed. The
 * outside-pointerdown dismissal already closed it by the time the click event
 * fires, so a click this soon after that close is the same gesture — reopening
 * would make the trigger impossible to close by clicking. */
const REOPEN_SUPPRESS_MS = 250;

let menuEl: HTMLDivElement | null = null;
let triggerEl: HTMLElement | null = null;
let teardown: (() => void) | null = null;
let lastClosedTrigger: HTMLElement | null = null;
let lastClosedAt = 0;

export function isDropdownOpen(): boolean {
  return menuEl !== null;
}

export function closeDropdown(): void {
  triggerEl?.setAttribute('aria-expanded', 'false');
  teardown?.();
  teardown = null;
  menuEl?.remove();
  menuEl = null;
  triggerEl = null;
}

function optionButtons(): HTMLButtonElement[] {
  return menuEl ? [...menuEl.querySelectorAll('button')] : [];
}

function focusOption(button: HTMLButtonElement | undefined): void {
  button?.focus();
  button?.scrollIntoView({ block: 'nearest' });
}

function focusStep(delta: number): void {
  const buttons = optionButtons();
  if (!buttons.length) return;
  const current = buttons.findIndex((b) => b === document.activeElement);
  const next = current === -1 ? 0 : (current + delta + buttons.length) % buttons.length;
  focusOption(buttons[next]);
}

/** First-character type-ahead (APG menus): cycle to the next option whose
 * label starts with the typed character. Long folder lists need this. */
function typeahead(char: string): void {
  const buttons = optionButtons();
  const lower = char.toLowerCase();
  const current = buttons.findIndex((b) => b === document.activeElement);
  for (let step = 1; step <= buttons.length; step++) {
    const candidate = buttons[(current + step) % buttons.length];
    if (candidate?.textContent?.trim().toLowerCase().startsWith(lower)) {
      focusOption(candidate);
      return;
    }
  }
}

function handleKeydown(e: KeyboardEvent, trigger: HTMLElement): void {
  if (e.key === 'Escape') {
    // Ours alone: without stopPropagation the input's Escape handler would
    // close the whole popup instead of just this panel.
    e.preventDefault();
    e.stopPropagation();
    closeDropdown();
    trigger.focus();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusStep(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusStep(-1);
  } else if (e.key === 'Home') {
    e.preventDefault();
    focusOption(optionButtons()[0]);
  } else if (e.key === 'End') {
    e.preventDefault();
    focusOption(optionButtons().at(-1));
  } else if (e.key === 'Tab') {
    // APG: Tab closes the panel; focus returns to the trigger so the tab
    // press then moves on from there naturally — no preventDefault.
    closeDropdown();
    trigger.focus();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    typeahead(e.key);
  }
}

/** Opens the option panel anchored under `trigger`, focused on the current
 * value. Selecting an option closes the panel, restores focus to the trigger,
 * then reports the value — the caller owns what the choice means. */
export function openDropdown(args: {
  trigger: HTMLElement;
  options: DropdownOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
}): void {
  const { trigger, options, selectedValue, onSelect } = args;
  if (lastClosedTrigger === trigger && Date.now() - lastClosedAt < REOPEN_SUPPRESS_MS) {
    lastClosedTrigger = null;
    return; // the toggle gesture — this click already closed the panel
  }
  closeDropdown();

  const menu = document.createElement('div');
  menu.className = 'overlay-menu dropdown';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-orientation', 'vertical');

  for (const option of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitemradio');
    btn.setAttribute('aria-checked', String(option.value === selectedValue));
    btn.tabIndex = -1; // roving focus — arrows move it, Tab leaves the panel
    const label = document.createElement('span');
    label.className = option.clipStart ? 'option-label folder-clip' : 'option-label';
    if (option.clipStart) {
      // Same rtl trick as the detail card's folder line (.folder-clip): the
      // inner ltr span keeps the text reading normally while the clip cuts
      // from the LEFT, preserving the distinguishing tail of a long path.
      const text = document.createElement('span');
      text.className = 'folder-text';
      text.textContent = option.label;
      label.appendChild(text);
    } else {
      label.textContent = option.label;
    }
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      closeDropdown();
      trigger.focus();
      onSelect(option.value);
    });
    menu.appendChild(btn);
  }

  menu.addEventListener('keydown', (e) => handleKeydown(e, trigger));

  // Any interaction outside dismisses (WCAG 1.4.13); wheel INSIDE must scroll
  // the option list — that's the one behavior the context menu doesn't share.
  const onPointerDown = (e: PointerEvent) => {
    if (menu.contains(e.target as Node)) return;
    // A press on the OWN trigger closes now; the click event that follows it
    // must not reopen — that's the toggle gesture. Only THIS path arms the
    // suppression (an Escape-close followed by a fresh click must reopen).
    if (trigger.contains(e.target as Node)) {
      lastClosedTrigger = trigger;
      lastClosedAt = Date.now();
    }
    closeDropdown();
  };
  const onWheel = (e: WheelEvent) => {
    if (menu.contains(e.target as Node)) return;
    closeDropdown();
  };
  const onBlur = () => closeDropdown();
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  document.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('blur', onBlur);
  teardown = () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    document.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('blur', onBlur);
  };

  // Measure hidden, then place under the trigger (flip above if it won't fit).
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);
  menuEl = menu;
  triggerEl = trigger;
  const anchor = trigger.getBoundingClientRect();
  const size = menu.getBoundingClientRect();
  let left = anchor.left;
  if (left + size.width > window.innerWidth - EDGE_MARGIN_PX) {
    left = Math.max(EDGE_MARGIN_PX, window.innerWidth - EDGE_MARGIN_PX - size.width);
  }
  let top = anchor.bottom + TRIGGER_GAP_PX;
  if (top + size.height > window.innerHeight - EDGE_MARGIN_PX) {
    top = Math.max(EDGE_MARGIN_PX, anchor.top - TRIGGER_GAP_PX - size.height);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = '';
  menu.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');

  const buttons = optionButtons();
  focusOption(buttons.find((b) => b.getAttribute('aria-checked') === 'true') ?? buttons[0]);
}
