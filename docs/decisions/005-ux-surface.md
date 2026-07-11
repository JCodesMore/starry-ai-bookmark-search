# 005 — UX: popup-first command palette, progressive disclosure throughout

**Decision (2026-07-10).** Primary surface: the **action popup** as a keyboard-first command
palette (search box + results, nothing else at rest). Complements: a `commands` keyboard shortcut
to open it, and a `chrome.omnibox` keyword (`bm `) for address-bar search. Side panel deferred to
v1.x; content-script overlay rejected (needs `<all_urls>` injection, conflicts with local-first
posture).

**Interaction model (from cmdk/Raycast/Spotlight patterns):** live filter-as-you-type, no submit;
ranked list; ↑/↓ + Enter (open), Ctrl/Cmd+Enter (background tab); hover/selection reveals
secondary actions only; distinct empty vs loading vs no-results states; partial results available
during indexing.

**Progressive disclosure contract** — the 12 checkable rules in
docs/research/ux-patterns.md ("Recommended v1 UX blueprint") are the review checklist for every UI
task. Essence: at rest show ONLY the search box (+ a quiet status line while indexing); results
appear on intent (typing); actions appear on selection; settings live behind one gear affordance;
errors surface only when the user looks for them.

**Visual language.** `system-ui` stack, 13–14 px body, 8 px spacing scale, automatic
light/dark via `prefers-color-scheme` (near-black dark, not pure black), motion ≤150–200 ms and
purposeful only. Favicons via MV3 `_favicon/?pageUrl=` (requires `"favicon"` permission).

**MV3 gotchas honored.** Popup ≤800×600; `_execute_action` opens the popup but does NOT fire
`onCommand` — autofocus the input on DOMContentLoaded; indexing job state lives in storage (SW is
mortal).

**Invalidated if:** users (or our own dogfooding) need persistent search while browsing (→ side
panel earns its keep in v1.x).

Source: docs/research/ux-patterns.md.
