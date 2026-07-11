# UX/UI Research: Bookmark Semantic Search (MV3)

Research date: 2026-07-10. Scope: surface choice, command-palette interaction patterns, Apple HIG progressive disclosure operationalized, onboarding/indexing UX, visual language, and result-explanation UX for a local-first Chrome MV3 bookmark search extension.

Current repo state at time of writing: `extension/manifest.json` already wires `action.default_popup` (popup surface), permissions `["bookmarks", "storage"]`, and a service-worker background script — consistent with the recommendation below.

---

## Recommended v1 UX blueprint

### Surface choice

**Primary surface: the `action` popup (`chrome.action.default_popup`).** Complements:
- `commands` API with a suggested (not auto-bound) keyboard shortcut for `_execute_action`, so power users get instant, keyboard-only invocation without Chrome forcing a shortcut on install.
- A lightweight `chrome.omnibox` keyword (e.g. type `bm` + Tab in the address bar) as a secondary, discoverable "type from anywhere" path for power users who live in the URL bar.
- Options page (`chrome://extensions` → Details → Extension options, or a dedicated tab) for settings/exclusions — never crammed into the popup.

**Why popup over the alternatives, for this product specifically:**

| Surface | Invocation friction | Size | Persistence | Fit for search-first tool |
|---|---|---|---|---|
| **Action popup** (recommended) | Lowest — one click on toolbar icon, or `_execute_action` shortcut; closes on blur (expected, desirable for a "look up and go" tool) | Hard-capped by Chromium at 800×600px, `kMinSize {25,25}` | None by design — re-renders fresh each open, which is *correct* for a query-in/result-out tool | Matches the product's actual use pattern: type a loose query, get ranked results, click one, done. Ephemeral-by-default is a feature, not a bug, for this workflow. |
| **Side Panel API** | Low, but `sidePanel.open()` only works inside a user gesture and (as of 2026) needs `setPanelBehavior` from the service worker rather than a manifest flag | Much larger, default ~320px wide, resizable, user-controlled | Persists across tab navigation — the panel stays open while browsing | Better suited to a *reference/companion* tool the user keeps open while researching, not a "search, pick, close" flow. Also has a documented focus-stealing bug affecting all OSes, and permission-prompt UX is clunky in-panel. Good v1.x complement (e.g. "keep panel open" power mode) but wrong default. |
| **New-tab override** | High — hijacks every new tab, which is aggressive for a utility extension and works against "never abrasive/extra" | Full page, no constraint | Full page lifecycle | Wrong fit: this is a targeted lookup tool, not a start page. Overriding NTP is also disproportionate for what should feel like a quick utility. |
| **Content-script command-palette overlay** (injected into every page, like Arc's Cmd+T or a Superhuman/Linear-style overlay) | Very low once loaded, but requires broad host permissions (`<all_urls>` or a content script matching every page) just to render an overlay | Fully custom | Ephemeral, matches search-then-go | Best *feel* (renders over the page, no toolbar click needed) but costs a heavy permission footprint for a "local-first, privacy-respecting" pitch — asking for all-sites access purely to draw a modal is hard to justify to security-conscious users and to the Chrome Web Store review process. Reserve for a possible v2 "power user" opt-in feature, not v1 default. |
| **Omnibox keyword** | Low for power users who already live in the address bar; near-zero discoverability for everyone else (no visual affordance) | Native omnibox dropdown, Chrome-styled, cannot show custom UI (only text rows) | N/A | Good *complement* — cheap to add (`omnibox.keyword` in manifest, `onInputChanged`/`onInputEntered`), gives a fast text-only path — but can't render favicons or rich "why it matched" chips, so it can't be primary. |

**v1 recommendation:** ship the action popup as the default and only required surface, add a `commands`-bound keyboard shortcut and an omnibox keyword as low-cost complements, and explicitly defer the Side Panel and content-script overlay to a later "keep it open while I research" power mode once the core popup experience is validated. This keeps v1's permission footprint minimal (`bookmarks`, `storage`, `favicon`, `commands`) — itself a progressive-disclosure move: don't ask for capability the user doesn't need yet.

**Popup-specific implementation notes to bake in from day one:**
- Autofocus: Chrome's `_execute_action` reserved command does not fire `chrome.commands.onCommand`, so there's no hook to hang custom "just opened via shortcut" logic on — autofocus the search input on `DOMContentLoaded` inside `popup.js` unconditionally; that covers both toolbar-click and shortcut-triggered opens identically. (Source: Chrome commands docs / community reports below.)
- Keep the popup within ~360–420px wide by ~460–500px tall. Chromium's hard ceiling is 800×600; staying well under it avoids clipping on small laptop screens and keeps the "quick utility" feel — this is itself a HIG-style discipline (small, dense, essential-only).
- Popup state is not preserved between opens — this is desirable here (every open = fresh query), so do not fight it with elaborate state restoration; instead persist only durable things (last-used exclusion filters, indexing status) via `chrome.storage`.

### Interaction flow (state machine)

1. **At rest (icon click / shortcut):** popup opens, search input is focused and empty, placeholder text suggests example queries (e.g. "Search your bookmarks…"). No result list, no chrome, no settings gear visible unless indexing is incomplete or stale (see rule 9 below).
2. **First keystroke:** results begin streaming/filtering live (no explicit "Search" button — this is a filter-as-you-type tool, matching Spotlight/Raycast/cmdk conventions). A subtle loading affordance appears only if a result takes >150–200ms.
3. **Results shown:** ranked list, each row = favicon + title + one-line "why it matched" (matched tag chip or highlighted snippet fragment) + domain/URL in muted text. Top result is visually pre-selected (keyboard-navigable via ↑/↓, Enter opens).
4. **Hover or arrow-key focus on a row:** secondary actions reveal (open in background, copy link, reveal in bookmarks bar) — hidden at rest, exactly the HIG disclosure-control pattern.
5. **Empty query, indexing incomplete:** row of unobtrusive progress text ("Indexing 812/1,341 bookmarks…") replaces the placeholder; search still works against what's indexed so far (partial results), never blocks input.
6. **No results:** single calm empty state with a suggestion to broaden the query or check exclusions — no dead space, no error styling (a zero-match is not a failure state).
7. **Settings/tags/exclusions:** never inline in the main popup. A small, secondary affordance (gear icon, bottom-right, low visual weight) opens the options surface (new tab or expanded popup view) — classic "action reveals more, hides irrelevant" disclosure.
8. **Closing:** Esc or blur closes the popup; no confirmation, no persisted "are you sure" — it's a lookup tool, exits should be free.

### Progressive-disclosure rule list (checkable, product-specific)

Grounded in Apple's HIG framing of progressive disclosure as showing "only what's necessary upfront... then revealing more as they interact" and the 80/20 principle that "not all information or functionality are created equal" (see Disclosure Controls, HIG Foundations §Motion/§Layout, WWDC17 "Essential Design Principles", WWDC25 "Design foundations from idea to interface" — full citations in Sources).

1. **At rest, the popup shows exactly one interactive element by default: the search input**, focused and empty. No visible settings icon competing for attention unless state (rule 9) requires it.
2. **No "Search" button.** Filtering happens on keystroke, consistent with every reference command-palette pattern (Spotlight, Raycast, cmdk) — an explicit submit step is friction the loose-query use case doesn't need.
3. **Result rows show three things only at rest: favicon, title, one-line match reason.** Full URL, tags, date-added, and secondary actions stay hidden until the row is focused/hovered — this is the direct product analog of Apple's disclosure-control pattern ("reveal and hide information... related to specific controls or views").
4. **Secondary actions (open in background tab, copy link, reveal source folder) appear only on hover/keyboard-focus of a row**, never as always-visible icon clusters — avoids the "extra hover icons... navigation feels heavy" failure mode reviewers flag on cluttered bookmark tools like Raindrop.io.
5. **Settings (re-index, exclusions, tag management) live one level down, behind a single low-emphasis affordance**, never inline in the search view. This mirrors Apple's guidance that revealing advanced options should be "behind a tap on the disclosure control... waiting for the moment it becomes relevant."
6. **Indexing/progress status is invisible when complete and up to date.** It only surfaces (as a thin status line, not a modal or badge) when indexing is running, stale, or errored — status is information the user needs *conditionally*, not always.
7. **Tags/why-it-matched chips are shown as compact, muted-color inline chips — never a separate panel** — the explanation lives next to the thing it explains, not in a disclosure the user has to seek out (same "trust currency, at the moment of doubt" logic search/AI-answer products use for inline citations).
8. **Exclusions and re-index controls are grouped under clearly labeled, collapsed sections in settings** (not a flat wall of toggles) — apply the same 80/20 filter to settings as to the main view: most users touch re-index once; expose it, but don't let it compete visually with the (rarer) exclusion list.
9. **Errors/edge cases (index build failed, zero bookmarks, permission issue) replace the relevant region in place** (e.g., the result list area) rather than stacking a banner or modal on top of the search input — keep the one-element-at-rest promise intact even in failure states.
10. **Never surface a confirmation dialog for non-destructive actions** (opening a bookmark, closing the popup). Reserve modal/confirm UX for genuinely destructive, hard-to-reverse settings actions only (e.g., "reset index and re-crawl everything").
11. **Keyboard affordances (↑/↓/Enter/Esc, and per-row secondary-action shortcuts) are discoverable via a subtle hint only on hover/focus** (e.g., a right-aligned "↵" glyph), not printed permanently across the UI — discoverability without permanent visual tax.
12. **Dark/light theming is automatic (`prefers-color-scheme`/`color-scheme: light dark`), never a user-facing toggle in v1** — one less decision surfaced, consistent with Chrome's own behavior of following the OS scheme for extension popups.

---

## 1. Surface choice for search-first extensions

See the comparison table and recommendation above. Supporting detail:

- **Side Panel API specifics (2026):** stable since Chrome 114; no more `openPanelOnActionClick` manifest field — open-on-click behavior is now set via `chrome.sidePanel.setPanelBehavior()` in the service worker. `sidePanel.open()` must be called inside a user gesture. Default width is a fixed 320px (criticized in the developer community as "a mobile format"). State does not survive close/reopen unless persisted to `chrome.storage`. There is a documented, OS-wide focus-stealing bug where the panel can grab keyboard focus away from the underlying page. Permission-request UX (e.g. asking for a new host permission) renders clunkily inside the panel compared to a popup or full tab. [chrome.sidePanel reference](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [How to Build a Chrome Extension Side Panel in 2026](https://www.extensionfast.com/blog/how-to-build-a-chrome-extension-side-panel-in-2026), [Chrome Side Panel — Ann Catherine Jose](https://annjose.com/blog/chrome-side-panel/)
- **`chrome.commands` / popup invocation:** `_execute_action` is a reserved command name for triggering the toolbar action; it does *not* dispatch a normal `onCommand` event, so you cannot hook extra logic to "this open was via shortcut." Up to four suggested shortcuts can ship in the manifest; users can add more via `chrome://extensions/shortcuts`. By default shortcuts are scoped to when Chrome has focus; marking a command "global" (Chrome 35+, not supported on ChromeOS) works even when Chrome is unfocused, but global shortcuts are restricted to `Ctrl+Shift+[0-9]` combinations to avoid clobbering OS/other-app shortcuts. Custom (non-`_execute_action`) commands that should open the popup must call `chrome.action.openPopup()` explicitly from the service worker — this is a well-documented MV3 gotcha (MV2's `_execute_browser_action` handled it implicitly). [chrome.commands reference](https://developer.chrome.com/docs/extensions/reference/api/commands), [GitHub issue on binding a shortcut to open the popup](https://github.com/GoogleChrome/chrome-extensions-samples/issues/619)
- **Popup size ceiling:** Chromium hard-codes `kMinSize {25,25}` and `kMaxSize {800,600}` for extension popups; anything requested larger is clipped/scrolled. No official "recommended" size exists, but community and Google-adjacent guidance converges on staying well under the ceiling (a few hundred px) and using `overflow-x: hidden` to avoid an ugly horizontal scrollbar if content overflows. [Chromium popup size discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/3A8d3oiOV_E), [Expand popup window size — codestudy.net](https://www.codestudy.net/blog/how-can-i-expand-the-popup-window-of-my-chrome-extension/)
- **Omnibox keyword API:** register via `"omnibox": { "keyword": "bm" }` in the manifest plus a 16×16 icon; `onInputStarted` → `onInputChanged` → `onInputEntered`/`onInputCancelled` event flow; suggestions support limited XML-style markup (`<match>`, `<dim>`, `<url>`) for highlighting but no favicons/rich rows — text only. Good cheap complement, not viable as primary UI given the product's favicon + why-matched requirements. [chrome.omnibox reference](https://developer.chrome.com/docs/extensions/reference/api/omnibox)
- **New-tab override and content-script overlay** are both higher-friction/higher-permission-cost than the payoff justifies for v1 (see table). Arc's now-discontinued Cmd+T Command Bar is the best real-world proof of the overlay pattern's *quality ceiling* — a single fuzzy-search field replacing four separate navigation habits — but it required deep browser-chrome integration Arc itself no longer maintains (Arc has been in maintenance mode since May 2025); a content-script clone of it needs `<all_urls>` access, which cuts against a "local-first, privacy-first" bookmark tool's trust story. [Arc Browser Command Bar analysis](https://www.superchargebrowser.com/library/arc-command-bar-chrome/)
- **What high-quality search/bookmark extensions actually ship:** Raindrop.io ships primarily as a persistent side-panel/sidebar experience plus an omnibox keyword shortcut (`rd` + Tab) for quick text-only lookups — a real-world validation of "rich primary surface + lightweight omnibox complement," though user reviews call out its UI as sometimes "bloated... extra hover icons... navigation feels heavy," which is a direct cautionary example for rule 4 above. [Raindrop.io Chrome extension review](https://www.techharry.com/2026/01/raindrop-chrome-extension-review.html), [Raindrop.io Chrome Web Store listing](https://chromewebstore.google.com/detail/raindropio/ldgfbffkinooeloadekpmfoklnobpien)

## 2. Command-palette interaction patterns

Canonical patterns distilled from cmdk, kbar, Raycast, Spotlight, Alfred, Arc's Command Bar, and Linear/Slack-style palettes:

**Transfers directly to a bookmark search popup:**
- **Keyboard-first, no submit button.** Text input keeps DOM focus at all times; arrow keys move a virtual "active" pointer (technically the ARIA combobox pattern — `aria-activedescendant` on the input pointing into a listbox), not actual focus. Enter activates the active row; Esc closes.
- **Live filtering on keystroke**, not on submit — matches how all five reference products behave.
- **Ranked/scored results, not just filtered.** cmdk's `command-score` favors prefix and contiguous matches; kbar uses `match-sorter` (exact > starts-with > contains > acronym). For semantic search, the equivalent is: exact title/tag matches should still outrank a vector-similarity match unless the vector score is much stronger — don't let embeddings fully override literal-match intuition, or results feel "wrong" even when technically relevant.
- **Grouping with auto-hide headings.** If bookmark results get grouped (e.g., "Tags," "Recently added," "All results"), a group with zero matches should vanish entirely — never show an orphaned header over nothing (cmdk's `Command.Group` behavior).
- **Empty state vs. loading state are visually distinct and never overlap.** `Command.Empty`-equivalent ("No bookmarks matched") only renders after a completed, zero-result search — never during debounce/fetch. A loading indicator (subtle, in the list area, not a full skeleton of the whole popup shell) only appears if a search genuinely takes noticeable time (>150ms) — for a local-first, sub-2ms vector search this should rarely be seen at all.
- **Debounce + local scoring is enough at this scale.** cmdk/kbar stay smooth into the low thousands of items; a user's bookmark count (thousands, not millions) doesn't require server-side pagination — everything can be scored client-side against the local index.
- **Secondary actions on a row, revealed on hover/focus only** (Raycast's Action Menu / ⌘K-within-⌘K pattern is the gold standard here): open, open in background, copy URL, reveal/locate. Don't render these as permanent icon rows — that's the "bloated... extra hover icons" complaint leveled at Raindrop.io.
- **Discoverability of the shortcut is a separate design problem from the palette itself.** A perfect popup nobody knows how to summon "reads as low usage" — worth a one-time, dismissible hint (not a recurring nag) pointing at the keyboard shortcut and/or the omnibox keyword.

**Do not transfer / adapt with caution:**
- **Alfred/Raycast's "workflow builder" / scripting layer** — this is a power-user surface (Alfred Powerpack workflows, Raycast extensions) that assumes a much broader action space (files, apps, scripts) than a single-purpose bookmark search tool needs. Importing that complexity would violate the "never abrasive or extra" design bar; a bookmark tool's action set is inherently small (open, copy, exclude) and doesn't need a builder.
- **Global, cross-app invocation** (Spotlight/Raycast/Alfred all summon over any app system-wide) doesn't map 1:1 — a Chrome extension can only approximate this via a `commands` global shortcut (restricted to `Ctrl+Shift+[0-9]`) or the omnibox; it cannot truly overlay outside the browser. Don't over-promise "summon from anywhere" copy in onboarding.
- **Arc's four-in-one merge** (tabs + history + bookmarks + actions in one bar) is elegant in a full browser-chrome context but is scope creep for a bookmarks-only extension — resist folding in tab search or history search just because the pattern looks appealing; it dilutes the single-purpose value proposition and adds permissions (`tabs`, `history`) the current manifest doesn't have and doesn't need.
- **Virtualized infinite lists** (kbar's built-in virtualization for huge action sets) are solving a scale problem this product likely doesn't have yet; don't add rendering complexity for a dataset of ~1,000–5,000 bookmarks that fits comfortably unvirtualized.

Sources: [UX Patterns for Developers — Command Palette](https://uxpatterns.dev/patterns/advanced/command-palette), [cmdk (GitHub)](https://github.com/pacocoursey/cmdk), [kbar (GitHub)](https://github.com/timc1/kbar), [Raycast vs Alfred](https://www.raycast.com/raycast-vs-alfred), [Spotlight vs Alfred vs Raycast](https://medium.com/@andriizolkin/spotlight-vs-alfred-vs-raycast-31bd942ac3b6), [Arc Command Bar analysis](https://www.superchargebrowser.com/library/arc-command-bar-chrome/), [Arc Browser: Reimagining the Browser Chrome](https://blakecrosley.com/guides/design/arc)

## 3. Apple HIG progressive disclosure, operationalized

Apple's own framing (WWDC17 "Essential Design Principles"): progressive disclosure is "a necessary and helpful technique for managing complexity and simplifying decision making," organized around an 80/20 heuristic — "not all information or functionality are created equal... use progressive disclosure to hide things of lesser importance." Apple also explicitly warns against overdoing it: "too much progressive disclosure can make workflows inefficient." The official HIG page on Disclosure Controls states plainly: "Disclosure controls reveal and hide information and functionality related to specific controls or views." The newer WWDC25 "Design foundations" session reframes it operationally: "showing only what's necessary upfront — just enough to help people get started, then revealing more as they interact... the rest of the content isn't missing, it's just behind a tap on the disclosure control... waiting for the moment it becomes relevant."

The 12 concrete rules synthesized from this (see blueprint section above) map each HIG concept to a specific popup element:
- "80/20, hide lesser things" → rules 1, 3, 8 (default view shows only search input + top-3 result fields; settings sub-sections collapsed by default)
- "Disclosure controls reveal/hide info tied to a specific control or view" → rules 4, 5, 7 (row hover reveals row actions; gear reveals settings; chip reveals match reason inline, not in a separate panel)
- "Motion should be purposeful, quick, precise... avoid gratuitous animation" (HIG Motion page) → informs the transition rules in the Visual Language section below (state changes ≤150–200ms, no decorative animation on frequent interactions like keystroke-driven filtering)
- "Don't overdo it — too much disclosure creates inefficient workflows" → rule 10 (no confirmation dialogs for reversible/cheap actions) and rule 2 (no submit-button step for search)

Sources: [Disclosure controls — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls), [Essential Design Principles — WWDC17](https://developer.apple.com/videos/play/wwdc2017/802/), [Design foundations from idea to interface — WWDC25](https://developer.apple.com/videos/play/wwdc2025/359/), [Motion — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/motion)

## 4. Onboarding & long-running index UX

Core principle from current UX pattern research: "If a task is unobtrusive and doesn't require user input, users would naturally expect it to be done quietly in the background — full-page blocking loaders should be reserved for critical, high-stakes operations." Applied to first-run indexing of, e.g., 1,341 bookmarks:

- **Never block the popup on indexing.** Let the user type and search against whatever is already indexed the moment the extension installs — a partial-results experience beats a spinner-and-wait experience. This is explicitly called out as a trust-building pattern: "store partial results as the job runs so the UI can show something useful before the job finishes."
- **Prefer determinate progress when the count is known** ("Indexing 812/1,341 bookmarks…") over an indeterminate spinner — determinate indicators "communicate a sense of duration, giving users more information on how much time they can expect to wait." Since the total bookmark count is knowable up front (`chrome.bookmarks.getTree()`), there's no excuse for an indeterminate spinner here.
- **State model:** persist a simple job-state snapshot (`queued | running | done | error`, processed count, total count, last-updated timestamp) in `chrome.storage.local` so status survives popup close/reopen and service-worker restarts — MV3 service workers are non-persistent, so this isn't optional, it's required for correctness, and it happens to match the recommended UX state-model pattern exactly.
- **First-run moment:** get the user to a *first meaningful search* within seconds, not after indexing completes. Even indexing the first ~50–100 bookmarks synchronously/fast before backgrounding the rest gives an immediate "it works" moment — mirrors general onboarding guidance to reach value within the first minute rather than gating on setup/permissions/completion.
- **Avoid duplicate-trigger bugs:** if the user can manually hit "re-index" from settings, disable/relabel the control while a job is already running (`"Indexing…"` with a spinner, not a clickable "Re-index" button) — a commonly cited failure mode is a still-active-looking trigger button causing duplicate concurrent jobs.
- **Status visibility follows rule 6 above:** once indexing is complete and current, hide the status line entirely; only resurface it when running, stale (bookmarks changed since last index), or errored.

Real-world reference points: this "background job + persistent status snapshot + partial usability" pattern is standard in modern async/background-job UX guidance (enterprise data-pipeline UIs, import tools) and in local-search tools generally (e.g., desktop Spotlight/Alfred index in the background on first launch and let cached/partial results appear immediately rather than blocking until the full index completes).

Sources: [Background tasks with progress updates: UI patterns that work](https://appmaster.io/blog/background-tasks-progress-ui), [UI patterns for async workflows, background jobs, and data pipelines — LogRocket](https://blog.logrocket.com/ux-design/ui-patterns-for-async-workflows-background-jobs-and-data-pipelines/), [UX Design Patterns for Loading — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-loading-feedback), [Onboarding UX: 10 patterns, best practices, and real examples — Appcues](https://www.appcues.com/blog/user-onboarding-ui-ux-patterns)

## 5. Visual language for "clean Apple-style" in a web extension

- **Typography — use the system font stack, not a custom webfont.** Current best practice (2026) is the CSS `system-ui` generic family as the simple, modern default; where precise SF-on-Apple targeting is wanted, the classic explicit stack still applies: `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Rationale directly relevant here: "when you're building an application... you generally want the typeface to be neutral to the user, to blend into the operating system" — exactly the "integrated, clean, natural" bar the product targets. It's also a performance win (zero font download) which matters in an 800×600px popup that should feel instant. Apple's own San Francisco font uses optical sizing (SF Text below 20pt, SF Display at/above) with automatic tracking adjustments per size — not replicable outside native Apple platforms, but the *principle* (tighter tracking on headline-scale text, looser on small text) is worth keeping in mind if any custom type scale is defined.
- **Type scale (from HIG's documented text styles, adapted for a dense popup):** body text ≈ 13–14px, secondary/muted text (URL, byline) ≈ 11–12px, section headers ≈ 11px uppercase/muted or 13px semibold — mirrors macOS's own 13pt-regular body default rather than iOS's 14pt, since this is a desktop-density surface. Avoid Light/Thin/Ultralight weights per HIG guidance ("not as user-friendly or accessible"); stick to Regular/Medium/Semibold.
- **Spacing:** treat the popup like a dense macOS panel, not a spacious mobile screen — 8px base spacing unit is a reasonable default (4/8/12/16px scale), tighter than typical marketing-site spacing scales (which often start at 16/24px). Favicon + text row height around 32–36px keeps ~8-10 results visible without scrolling in a ~480px-tall popup.
- **Dark/light theming:** rely on `prefers-color-scheme` plus `color-scheme: light dark` on `:root`. Chrome (unlike Firefox) makes extension popups follow the OS scheme consistently regardless of the browser's own chrome theme — meaning a single, unconditional CSS media query is sufficient for v1; no JS theme-detection workaround is needed on Chrome specifically. Avoid pure black (`#000`) in dark mode — near-black (`#0A0A0A`–`#161616`) reduces eye strain and is the near-universal 2026 recommendation; use elevation via lighter background steps rather than shadows in dark mode (shadows read as invisible on dark surfaces).
- **Motion:** per HIG, animation should be purposeful and quick — favor ≤150–200ms ease-out transitions for result-list updates and row hover/focus states; do not animate the filter-as-you-type re-render itself (it happens too frequently — HIG explicitly warns against adding motion to frequent interactions). Respect `prefers-reduced-motion`.
- **Favicon handling (MV3):** the old `chrome://favicon` URL scheme is forbidden in MV3. Use the replacement pattern: declare the `"favicon"` permission, then build URLs as `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32` inside extension pages (popup/options) — this works directly without extra manifest wiring for extension-page contexts; only content-script usage requires declaring `_favicon/*` under `web_accessible_resources`. Note a real quality gap reported by developers: the favicon API sometimes returns a worse icon than a tab's live `favIconUrl` (e.g., for Netflix, GitHub) — for a bookmark tool (no open tab to read `favIconUrl` from), the `_favicon` API is nonetheless the only MV3-compliant option; request a reasonable size (32 or 64px) and provide a graceful monogram/generic-globe fallback for bookmarks whose favicon can't be resolved (the API supports `show_fallback_monogram`-style fallback behavior in Chrome's own internal usage). Add the `"favicon"` permission alongside `"bookmarks"`/`"storage"` in the manifest.
- **Pitfalls that read as "cheap":** oversized/unconstrained popups (respect the 800×600 ceiling and actually stay well under it — aim ~400×500); a visible "Search" button (signals a form, not a live tool); permanently visible secondary icons/actions per row (the Raindrop.io "bloated... extra hover icons" complaint); inconsistent spacing/colors across the popup vs. options page; touch/click targets under ~32-40px; jargon-heavy labels; skipping the dark-mode media query (a light-only popup against a dark OS/browser theme is an instant "unpolished" signal in 2026, where "dark-first design has become mainstream among modern tools" like Linear, Warp, Raycast, Arc).

Sources: [System Font Stack — CSS-Tricks](https://css-tricks.com/snippets/css/system-font-stack/), [Using System Fonts for Web Apps](https://medium.com/needmore-notes/using-system-fonts-for-web-apps-bf76d214a0e0), [Typography — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/typography), [Fetching favicons — Chrome for Developers](https://developer.chrome.com/docs/extensions/mv3/favicon/), [prefers-color-scheme — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme), [Inconsistency: extension popup's preferred color scheme — w3c/webextensions#242](https://github.com/w3c/webextensions/issues/242), [Best Practices for Dark Mode in Web Design 2026](https://natebal.com/best-practices-for-dark-mode/), [Motion — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/motion), [Chrome extension design mistakes — Creative Navy](https://lab.interface-design.co.uk/the-ultimate-guide-to-browser-extensions-design-ea858d6634a6)

## 6. Result explanation UX ("why did this match?")

Algolia's engineering framing is the clearest articulation of the problem: "since objects can have dozens of searchable attributes, displaying all of them would overwhelm users — you only need to show the relevant one to explain the result... without this aspect, users will be disappointed as they inevitably choose a bad result." Two complementary techniques, both directly applicable:

- **Highlighting** (bold/colored styling on matched terms within the *title*) — for short fields, show the whole field with matches marked.
- **Snippeting** (a short excerpt around the match, with matched terms marked, plus ellipsis) — for longer fields (page content, description) where showing the whole field would be too long. Configurable pre/post markers (commonly `<mark>`/`<strong>` in place of Algolia's default `<em>`).

For a **semantic/loose-query** search (embeddings, not literal keyword match), naive literal-term highlighting is actively misleading: Algolia's own engineering post warns that "the simplest [highlighting] approach... just highlights query terms literally, which can mislead users since they won't see why a record was actually found (e.g., via typo tolerance or synonyms)." The equivalent risk here is worse — a vector match for "warmup iphone ai" might surface a bookmark titled "On-device model preloading" with zero literal token overlap. The fix used by the most robust implementations: capture *which underlying signal* drove the match (matched tag, matched title substring, or "semantic match" with a similarity indicator) and surface *that*, not a fabricated literal highlight.

**Recommended pattern for this product** (chip-based, not paragraph-based, keeping with progressive disclosure):
- If the match came from a **tag**, show a small muted chip with the tag name (e.g. `AI` `iPhone`) — this is the cheapest, clearest "why."
- If the match came from a **literal title/URL substring**, bold that substring inline in the title — classic highlighting.
- If the match came from **semantic/embedding similarity with no literal overlap**, show a single low-key line/chip like "Related to your search" rather than inventing a fake highlight — do not force a snippet-highlight where none honestly exists; overclaiming precision erodes trust exactly the way Algolia's engineers warn against.
- Keep it to **one explanation signal per row, inline, muted-color** — this is the same "trust currency, at the point of doubt" logic behind Perplexity's inline citation chips (small numbered/text marker attached right at the claim, not a separate bibliography the user has to hunt for) and Notion AI's workspace-scoped "why this surfaced" framing. Avoid a similarity-score percentage as primary UI — raw cosine-similarity numbers ("0.83") are an implementation detail, not a user-facing explanation, and read as noisy/technical rather than clean.
- Reserve deeper detail (full snippet, multiple matched tags, raw score) for progressive disclosure on hover/focus (rule 7), never all at once at rest.

Sources: [Highlighting in InstantSearch.js — Algolia](https://www.algolia.com/doc/guides/building-search-ui/ui-and-ux-patterns/highlighting-snippeting/js), [Inside the Algolia Engine Part 5 — Highlighting, a Cornerstone of Search UX](https://www.algolia.com/blog/engineering/inside-the-algolia-engine-part-5-highlighting-a-cornerstone-to-search-ux), [Designing Search: Displaying Results — UX Magazine](https://uxmag.com/articles/designing-search-displaying-results), [AI citation and source UI design patterns for 2026 — AYDesign](https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026), [AI UX Patterns — Citations, ShapeofAI.com](https://www.shapeof.ai/patterns/citations), [Perplexity Output UX — AI UX Playground](https://aiuxplayground.com/teardowns/perplexity/output/)

---

## Sources

**Surface choice / MV3 APIs**
- [chrome.sidePanel API reference](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [How to Build a Chrome Extension Side Panel in 2026](https://www.extensionfast.com/blog/how-to-build-a-chrome-extension-side-panel-in-2026)
- [Chrome Side Panel — Ann Catherine Jose](https://annjose.com/blog/chrome-side-panel/)
- [chrome.commands API reference](https://developer.chrome.com/docs/extensions/reference/api/commands)
- [GitHub: how to add a command that opens the popup via keyboard shortcut](https://github.com/GoogleChrome/chrome-extensions-samples/issues/619)
- [Chrome extension popup max size discussion — Chromium groups](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/3A8d3oiOV_E)
- [Expanding popup window size — codestudy.net](https://www.codestudy.net/blog/how-can-i-expand-the-popup-window-of-my-chrome-extension/)
- [chrome.omnibox API reference](https://developer.chrome.com/docs/extensions/reference/api/omnibox)
- [Arc Command Bar in Chrome — how to replicate it](https://www.superchargebrowser.com/library/arc-command-bar-chrome/)
- [Arc Browser: Reimagining the Browser Chrome](https://blakecrosley.com/guides/design/arc)
- [Raindrop.io Chrome Extension Review](https://www.techharry.com/2026/01/raindrop-chrome-extension-review.html)
- [Raindrop.io — Chrome Web Store](https://chromewebstore.google.com/detail/raindropio/ldgfbffkinooeloadekpmfoklnobpien)

**Command-palette patterns**
- [UX Patterns for Developers — Command Palette](https://uxpatterns.dev/patterns/advanced/command-palette)
- [cmdk (GitHub)](https://github.com/pacocoursey/cmdk)
- [kbar (GitHub)](https://github.com/timc1/kbar)
- [Raycast vs Alfred](https://www.raycast.com/raycast-vs-alfred)
- [Spotlight vs Alfred vs Raycast — Medium](https://medium.com/@andriizolkin/spotlight-vs-alfred-vs-raycast-31bd942ac3b6)
- [How to Add a Cmd+K Command Palette to Your SaaS](https://www.buildmvpfast.com/blog/how-to-add-cmd-k-command-palette-saas-2026)
- [Shadcn Command](https://www.shadcn.io/ui/command)

**Apple HIG**
- [Disclosure controls — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)
- [Essential Design Principles — WWDC17](https://developer.apple.com/videos/play/wwdc2017/802/)
- [Design foundations from idea to interface — WWDC25](https://developer.apple.com/videos/play/wwdc2025/359/)
- [Motion — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Typography — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/typography)

**Onboarding / indexing UX**
- [Background tasks with progress updates: UI patterns that work — AppMaster](https://appmaster.io/blog/background-tasks-progress-ui)
- [UI patterns for async workflows, background jobs, and data pipelines — LogRocket](https://blog.logrocket.com/ux-design/ui-patterns-for-async-workflows-background-jobs-and-data-pipelines/)
- [UX Design Patterns for Loading — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-loading-feedback)
- [Onboarding UX: 10 patterns, best practices, and real examples — Appcues](https://www.appcues.com/blog/user-onboarding-ui-ux-patterns)

**Visual language**
- [System Font Stack — CSS-Tricks](https://css-tricks.com/snippets/css/system-font-stack/)
- [Using System Fonts for Web Apps — Medium](https://medium.com/needmore-notes/using-system-fonts-for-web-apps-bf76d214a0e0)
- [Fetching favicons — Chrome for Developers](https://developer.chrome.com/docs/extensions/mv3/favicon/)
- [prefers-color-scheme — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme)
- [Inconsistency: extension popup's preferred color scheme — w3c/webextensions#242](https://github.com/w3c/webextensions/issues/242)
- [Best Practices for Dark Mode in Web Design 2026 — NateBal.com](https://natebal.com/best-practices-for-dark-mode/)
- [The Ultimate Guide to Browser Extensions Design — Creative Navy](https://lab.interface-design.co.uk/the-ultimate-guide-to-browser-extensions-design-ea858d6634a6)

**Result explanation UX**
- [Highlighting in InstantSearch.js — Algolia](https://www.algolia.com/doc/guides/building-search-ui/ui-and-ux-patterns/highlighting-snippeting/js)
- [Inside the Algolia Engine Part 5 — Highlighting, a Cornerstone of Search UX](https://www.algolia.com/blog/engineering/inside-the-algolia-engine-part-5-highlighting-a-cornerstone-to-search-ux)
- [Designing Search: Displaying Results — UX Magazine](https://uxmag.com/articles/designing-search-displaying-results)
- [AI citation and source UI design patterns for 2026 — AYDesign](https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026)
- [AI UX Patterns — Citations — ShapeofAI.com](https://www.shapeof.ai/patterns/citations)
- [Perplexity Output UX — AI UX Playground](https://aiuxplayground.com/teardowns/perplexity/output/)
