# UX Blueprint — the checkable spec for every UI task

Rationale + sources: docs/research/ux-patterns.md (its 12-rule list is normative; condensed here).
Decisions: docs/decisions/005-ux-surface.md. Every UI PR is reviewed against this file.

## Surfaces

- **Popup (primary):** 380 px wide, max-height 480 px. Fresh state every open (by design).
- **Shortcut:** suggested `Ctrl+Shift+B` (`_execute_action`; autofocus input on DOMContentLoaded —
  the shortcut fires no onCommand event).
- **Omnibox:** keyword `bm` in the address bar — the SAME ranked pipeline as the popup.
  Top 6 suggestions (title with `<match>` highlights + dimmed URL, all XML-escaped;
  deduped by URL; content = the URL so Enter navigates exactly what was shown). Enter
  on raw text opens the best match; nothing matched = no navigation. Selections teach
  the ranker like popup clicks. The keyword is manifest-static — Chrome offers no API
  to rebind it, so users cannot customize it (verified; user informed). PLATFORM
  CAPS (not ours): Chrome's dropdown shows only a handful of rows (~8 incl. its own
  entries) and cannot scroll — 6 is the practical maximum. Ranking parity: when
  semantic scoring misses the race (model cold start), the omnibox waits one retry
  (~1.2s) BEFORE suggesting — the dropdown can't refine in place like the popup, so
  it must not serve lexical-only rows.
- **Settings:** a second in-popup SCREEN behind the gear — the search surface (header,
  input, status, results, footer) leaves entirely; a minimal header ("Settings" + a
  close X sitting in the gear's EXACT slot — the exit lives where the entrance was,
  zero pointer travel) takes over. One surface at a time, never both stacked. Graduate
  to a separate options page only if settings outgrow quick actions. Rows: "Read page
  content" (crawl consent toggle On/Off), "Included folders" (opens the chooser),
  Rebuild index, Reset data (two-step arm).
- **Onboarding (`onboarding.html`):** one centered card, opened as a tab ONCE on
  `onInstalled reason === 'install'` (updates never re-show it; a factory reset
  reopens it). ONE guided path, one act on stage at a time:
  1. *Hero* — h1 "The easiest way to find your bookmarks" · sub "Type what you
     remember. It finds the right bookmark, even if you forgot the name." (plain
     smooth sentences — never em-dash constructions in stage copy) · primary
     "Get started" · foot "Free · No account · Nothing leaves your computer" —
     the foot belongs to the PITCH only and leaves with the hero (every later
     stage hides it).
  2. *Chooser (the MAIN flow, not a hidden option)* — h1 "Here's what I'll learn" ·
     top-level folder checklist (all checked, per-folder counts) + "Read page content
     for better results" toggle (ON) · primary "Start learning" (personified; never
     "index"/"scan" vocabulary).
  3. *Learning — the learning SHOW, not a bare counter* — h1 "Learning your
     bookmarks" · an accent progress bar (soft light sweep while filling;
     indeterminate gliding segment during ingest/model download; percent lives in
     the BAR so the line never repeats it) · live line "583 of 1,346 learned"
     ("Setting things up…" during model download, "Reading your library…" during
     ingest) · a **ticker** beneath: real bookmarks from the user's own library
     (favicon + title, exclusions pruned) filing in one per ~1.2s — the wait
     reads as watching it work · the **pin-me card**: illustrated two-step SVG
     (puzzle piece ① → pin ②); `chrome.action.getUserSettings().isOnToolbar`
     (+ `onUserSettingsChanged`, poll fallback) flips it LIVE to a check +
     "Pinned — I'm right up there when you need me" + Alt+B tip. Already pinned =
     card never shows. Reduced motion: no sweep/glide/file-in; indeterminate
     shows as a dimmed full bar.
  4. *Ready* — h1 "All set." · sub "Type what you remember and I'll find it." ·
     bar + ticker leave with the wait · primary "Try it now" →
     `chrome.action.openPopup()` (Chrome 127+; falls back to pointing at the
     toolbar icon). The pin card is STICKY: it stays here until actually pinned
     (title settles to "Pin me to your toolbar" — a small library finishes
     learning in seconds and the teaching must not vanish with it).
  Zero-bookmark profile: the chooser becomes "Nothing to learn just yet" with one
  calm note ("No bookmarks yet — I'll learn each one automatically as you save
  it."), CTA "Sounds good" → completes onboarding straight to an "All set." with
  sub "Save a bookmark and I'll learn it the moment it lands." (no Try-it-now —
  an empty popup teaches nothing; the pin card still shows).
  NOTHING indexes/crawls/downloads before step 2 completes: `complete-onboarding`
  (prefs + `onboardingComplete` latch + first pass, one message) is the only ignition
  on a fresh install; existing installs are grandfathered by records-in-store. The
  popup pre-onboarding shows a setup card routing back here; omnibox Enter routes
  here too; Reset data = factory reset (cancel in-flight pass → wipe all stores →
  reopen onboarding). Excluding a folder purges its records (exclusion IS removal);
  re-including restores them. With `?customize` the same page is the settings'
  folder chooser: no hero, no pin card, "Save", closes itself. Prefs flow ONLY
  through the SW (`get-prefs`/`set-prefs`/`complete-onboarding`) — revoking crawl
  consent aborts in-flight fetches and clears the crawl queue.

## Popup states (exhaustive — no other UI states exist)

| State | What's visible |
|---|---|
| Pre-onboarding | The setup card ONLY (mark · "Almost there" · "One quick step and every bookmark you own becomes searchable." · pill "Finish setup" → opens onboarding.html, popup closes). No search surface, no browse, no gear — there is nothing to show yet, and no dead end. |
| Rest = Browse | Slim identity header (16px app mark + "Bookmarks" muted + gear top-right) · search input (focused) · two quiet browse controls ("Recent ▾" sort left, "All folders ▾" scope right — text-label trigger buttons opening STYLED option panels on the shared overlay material: APG menu-button with menuitemradio, accent check on the current value, chevron flips while open, roving focus + type-ahead, Escape closes the panel never the popup, wheel INSIDE scrolls the folder list while wheel outside dismisses, long folder paths left-ellipsized so the identifying tail survives) · the LIBRARY by last ACTIVITY: the later of date-added and last-opened-via-the-extension, newest first — opening a bookmark bumps it to the top like any recents list (same row pipeline as search: dwell cards, actions, infinite scroll all identical; no match chips — nothing was matched) · quiet footer (see rule 6). Recency costs zero keystrokes. |
| Rest + indexing | Input + one quiet status line naming the CURRENT PHASE in the personified voice: "Reading your library…" (ingest) · "Reading pages… 213 of 1,346" (crawl wave) · "Learning your bookmarks… 43%" (embedding — percent, never a raw N/M whose total is a pass subset that would contradict the footer count) · "Tagging what I learned…" (tagging). The pipeline legitimately runs several passes; naming each phase is what keeps it from reading as one job looping. A dead SW's stale progress is self-healing: the SW resumes the pass when asked for state (never displays a frozen line forever). Search stays fully usable (partial results). |
| Rest + first-run model download | Same slot: "Preparing search… 34%" — one line, never a modal. |
| Typing | Instant lexical results on keystroke; semantic scores fuse in when ready (architecture 'latency contract'); refinement is smooth — no flash-reorder. Loading affordance only if >150–200 ms. |
| Results | Ranked rows: favicon + title + one muted match-reason (chip or bolded literal) + muted domain — plus a QUIET link-off mark after the domain when the page didn't respond to the last crawl (tooltip "Didn't respond last time I checked"; the card foot spells out "Unreachable when last checked"). Informational, never alarming: dead pages stay fully searchable (decision 002), and dead is one observation, not a verdict. First row pre-selected. |
| Row focus/hover | Selecting a row (mouse move or ↑/↓) instantly reveals secondary actions (open in background · copy link — copy confirms by flipping to an accent check for ~1.2s; the menu's Copy confirms with a "Link copied" toast since the menu closes) + "↵" hint — and these two are the ONLY inline actions, collapsed or bloomed: the icon under a stationary cursor must never change meaning when the card expands. **Resting on a row blooms it into a glass detail card** — pointer dwell 550 ms (intentional, measured from entering the row), keyboard dwell 260 ms (arrows are already intent): full title (≤3 lines), description (≤3 lines), full URL (airport-marquee when it overflows), folder path (left-ellipsized — the tail identifies), "Added Mon YYYY" (hover it → styled tooltip with the exact date+time), tag chips (taxonomy tags wear their curated human label — "Dev Repos", never the raw id — followed by the record's cluster-discovered topic in the user's own corpus vocabulary, e.g. "proxy residential"; the chip cap trims from the tail so curated tags keep priority). The pointer LEAVING a row collapses its card immediately (160 ms — release, not ceremony). Exactly one card at a time. No native `title` tooltips anywhere — every action shows a styled attr(aria-label) tooltip after the same 320 ms hover intent. |
| Row right-click | A custom CONTEXT MENU (WAI-ARIA APG menu pattern: role=menu, roving focus on menuitems, Escape closes the menu — never the popup — and refocuses the input, Tab closes, arrows/Home/End navigate; Shift+F10 / the Menu key opens it for the selected row). Items, in order: Open · Open in background tab · Copy link · Show in Bookmarks Manager · Delete. Management actions live ONLY here — behind an explicit gesture. Delete is ALWAYS danger-red (the menu is already an explicit gesture — nothing accidental to protect) and stays undoable via the toast. The menu is body-level `position:fixed` on near-opaque overlay material (`--overlay-bg` + backdrop blur — floating above OTHER content, translucency would bleed text through), flips at viewport edges, and dismisses on click-away/wheel/blur. While it is open the list beneath is inert: no selection moves, no blooms, and result refreshes are DEFERRED — nothing may yank the rows out from under an open menu. |
| No results | One calm line: "No matches — try a looser phrase." No error styling; zero-match is not a failure. |
| Settings | Gear (header top-right, low-emphasis) pushes the settings screen: "Settings" title left + close X in the gear's exact slot, then grouped rows (Read page content toggle; Included folders → chooser; Re-index; Reset behind a two-step confirm). The search input is NOT visible here. X click or Esc returns to search with the input refocused. Views slide 10 px in their travel direction (140 ms; none on popup open). |
| Error (index broken etc.) | Replaces the list region in place, one line + one action. Never a banner stacked on the input. |

## The 12 rules (condensed checklist — verify each UI task against all)

1. At rest the input is focused and primary; the only other affordances are the two
   quiet browse controls and the gear. Browse controls exist ONLY at rest — typing
   removes them (ranking owns the order; sorting ranked results would destroy it).
2. No Search button — filter as you type.
3. Result rows show 3 things at rest: favicon, title, match reason.
4. Secondary actions only on hover/keyboard focus.
5. Settings behind ONE low-emphasis gear (header top-right), one level down; its exit
   (close X) occupies the gear's exact slot.
6. Index PROGRESS invisible when complete; surfaces only while running/stale/errored.
   The footer count is the single persistent quiet fact allowed, and it mirrors what
   the LIST is showing: "N results" while searching ("Top 150 results" at the cap —
   honest about truncation, never a false total), "N of M" while folder-scoped,
   "M bookmarks" at rest, and silent on zero matches (the empty-state line explains).
7. Match reason = one honest inline chip per row; never a panel, never fabricated highlights,
   never raw scores.
8. Settings grouped in collapsed sections; re-index prominent, exclusions below.
9. Errors replace the affected region in place.
10. Confirmations only for destructive actions (reset index). Deleting one bookmark is
    Undo-after (toast), never confirm-before. Opening/closing is always free.
11. Keyboard hints revealed on focus/hover only.
12. Theme follows `prefers-color-scheme` automatically; no toggle in v1.

## Keyboard map

↑/↓ move selection · Enter open (NAVIGATES the current tab — like following a link,
never tab clutter; row click is identical) · Ctrl/Cmd+Enter open in background tab ·
Esc close · Shift+F10 or Menu key opens the selected row's context menu ·
Tab cycles row actions when a row is focused.

## Visual tokens (implement as CSS custom properties)

- Type: `system-ui` stack; input 15 px, body 13 px, meta 11.5 px; line-height 1.45.
- Spacing scale: 4 / 8 / 12 / 16. Container padding 12. Row padding 8×10, radius 8.
- Light: bg `#ffffff`, text `#1d1d1f`, muted `#6e6e73`, hairline `rgba(0,0,0,.08)`,
  selection `rgba(0,0,0,.045)`, accent `#0071e3`.
- Dark: bg `#1c1c1e` (near-black, never pure), text `#f5f5f7`, muted `#98989d`,
  hairline `rgba(255,255,255,.10)`, selection `rgba(255,255,255,.06)`, accent `#0a84ff`.
- Motion: 120–160 ms ease-out, ONLY on reveal transitions (row actions, status line);
  zero animation on keystroke filtering. Respect `prefers-reduced-motion`.
- Detail-card bloom: pointer dwell 550 ms / keyboard 260 ms → expand 380 ms with a springy
  `linear()` ease (~5% overshoot — the "liquid" pop); collapse 160 ms plain, fired the
  instant the pointer leaves the row. Height animates via the `grid-template-rows:
  0fr→1fr` trick (content-sized, no JS measuring); the title grows 1→3 lines via animated
  `max-height`, its truncation cue a right-edge fade (an ellipsis can't survive the
  bloom). Never animate width — text must not re-wrap mid-flight.
- **Pointer stability is inviolable: nothing may move under a stationary cursor.** The
  card grows strictly downward (no top margin), pointer-driven selection/blooms never
  scroll the list (`scrollIntoView` is keyboard-only), and hover state must not be able
  to oscillate (a bloom that shifts its own hover target un-hovers itself → flicker
  loop). Any future motion feature is tested against this rule (tools/ui-hover.mjs
  asserts zero top-drift).
- **Scrolling is navigation.** A wheel/touch scroll collapses the open card instantly
  and cancels any armed dwell; rows arriving under a stationary cursor must not steal
  selection or arm a bloom — Chrome's synthetic post-scroll hover updates are ignored
  by comparing client coords (a real pointer move always changes them).
  tools/ui-hover.mjs asserts both.
- Liquid glass (the card): translucent layered gradient + 1 px specular top inset +
  soft lift shadow + radius 8→14. Both themes get their own glass tokens.
- URL marquee: only when the URL overflows; travels the hidden width at ~28 px/s
  (min 3 s), dwells at both ends, edge-fade masks while armed. Off under reduced motion,
  as is every bloom transition (0 ms — the card still opens, instantly).
- Favicons: crawl-captured icon first (one `/favicon.ico` fetch per unique ORIGIN, stored
  locally in IndexedDB, misses negative-cached; NEVER a third-party favicon service — the
  domain list stays on this machine), else `chrome-extension://…/_favicon/?pageUrl=<url>&size=32`
  (needs `"favicon"` permission; only covers sites VISITED in this profile and falls back to a
  globe that is undetectable via onerror — which is why the stored icon must win when present).
  16 px rendered, 2 px radius.

## Copy voice

Calm, short, zero exclamation marks, no "!" no "🎉", no apologies. Status lines are facts
in the personified first-person voice ("Learning your bookmarks… 43%", "Reading pages…") —
never "indexing"/"scanning" vocabulary; suggestions are gentle ("try a looser phrase").
