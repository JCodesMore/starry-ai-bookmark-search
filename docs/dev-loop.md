# The dev loop — driving & verifying the extension

**Load when:** running diagnostics, UI suites, search-quality eval, DB inspection, importing
test bookmarks, or debugging the dev browser / CDP tooling itself. The core loop commands
(`npm run browser|reload|smoke|gate|stop`) and the hard rules that bind every command here
(never touch the main Comet browser; never hardcode the extension ID) live in `AGENTS.md`.

## Verification & diagnostics (all CDP-driven, all safe to run any time)

```
node tools/eval.mjs [--strict]     # golden-query search quality vs real corpus (hit@k / MRR)
node tools/send.mjs search "query" # ranked results from the live extension
node tools/send.mjs reindex|reset-data|index-state|ping
node tools/index-status.mjs [--once]  # index/crawl progress until done
node tools/db-stats.mjs            # fetch-status + signal coverage distribution
node tools/topics.mjs [--json]     # cluster-discovered topics (learned tags) + samples
node tools/diag.mjs [--json]       # persisted SW lifecycle log (pass triggers/boundaries)
node tools/db-peek.mjs <substr>    # inspect live records matching a url substring
node tools/icon-stats.mjs          # captured-favicon counts (real vs negative-cached)
node tools/ui-shot.mjs "q" [--dark]   # popup screenshot with query typed (both themes)
node tools/ui-keys.mjs             # keyboard-model checks via real CDP key events
node tools/ui-scroll.mjs ["q"]     # infinite-scroll checks (batched row rendering)
node tools/ui-hover.mjs ["q"] [--dark]  # dwell-expand detail-card checks + screenshots
node tools/ui-settings.mjs [--dark]   # settings-screen checks (gear → X/Esc) + shots
node tools/ui-browse.mjs [--dark]     # browse-at-rest checks (sort/folder/typing swap)
node tools/ui-manage.mjs [--dark]     # delete/undo/reveal checks (seeded bookmark, cleaned up)
node tools/ui-onboarding.mjs [--dark] # first-run page checks (copy, chooser, prefs, purge/restore)
node tools/embed-test.mjs "text"   # embedding engine timing/dims through the SW
node tools/jank-probe.mjs          # extension-page main-thread stalls under embed load
node tools/omnibox-test.mjs        # omnibox keyword + suggestion pipeline (XML hygiene)
node tools/rank-of.mjs <substr> "q" ...  # where a bookmark ranks per query (full scored list)
node tools/tune.mjs                # fusion-weight sweep over goldens (via message override)
node tools/tag-scores.mjs <substr> # zero-shot tag cosines for a live record's tag text
node tools/seed-bookmark.mjs <url> "title"  # add a test bookmark (idempotent by url)
```

`eval.mjs` and `tune.mjs` prefer a gitignored `tools/goldens.local.json` (personal golden
queries — never committed) over the shareable `tools/goldens.json`; same shape — add personal
goldens only to the local file.

## Test data — real bookmarks

The user's real bookmarks (~1,341) live in their main Comet profile (the `Default` profile dir).
`npm run import` (`tools/import-bookmarks.mjs`) reads that profile's `Bookmarks` JSON from disk
(read-only) and recreates the tree in the dev browser under a folder named `Imported bookmarks`.
Any previous import folder is replaced, which triggers a **full reindex** — run it when the
bookmarks have changed, not casually. Pass a profile display name as an argument to import a
different profile; names → dirs resolve via `<User Data>/Local State`. Note: the "Claude"
profile has NO bookmarks.

## Two channels, two browsers

A profile's user-data-dir can only be open in one browser process, Chromium 136+ blocks
`--remote-debugging-port` on the default user-data-dir, and dev churn on real profile data is
risky. Instead: CDP drives the isolated dev instance (a superset of the extension tools'
abilities: navigation, clicks, JS eval, screenshots, plus `chrome://` pages), while the
Claude-in-Chrome extension stays connected in the user's main browser for anything needed in
their real browsing context. Both work simultaneously.

## How the tools work (`tools/`)

- `config.mjs` — Comet exe path, CDP port (9222), extension dir/name.
- `cdp.mjs` — CDP helpers: target listing, `Runtime.evaluate` on any target,
  `chrome.developerPrivate.*` via a `chrome://extensions` page target
  (list/reload/clear-errors/dev-mode), tab open/close, PNG screenshots.
- `launch.mjs` — spawns Comet detached with `--user-data-dir`, `--remote-debugging-port`,
  `--load-extension`, `--enable-unsafe-extension-debugging`; falls back to CDP
  `Extensions.loadUnpacked` if the flag is ignored.
- `build.mjs` — bundles `src/` + copies `public/`; the default dev build rewrites the
  manifest's optional host permissions to required so CDP suites never hit the native
  permission prompt (see `docs/release.md` for the store build).
- `reload.mjs` / `smoke.mjs` — the core loop; both exit non-zero on failure.

Useful primitives for ad-hoc debugging (import from `tools/cdp.mjs`): `createTab(url)` +
`evalOnTarget(tab, expr)` runs JS in any page — including extension pages, where all `chrome.*`
extension APIs are available (used for seeding test bookmarks). `screenshot(tab, file)` for
visual checks.

## Environment notes

- Comet exe: `%LOCALAPPDATA%/Perplexity/Comet/Application/comet.exe` (Chromium 149 base).
  Override with `COMET_EXE`; port with `CDP_PORT`.
- `comet://`/`chrome://` pages cannot be driven by the Claude browser extension or by computer
  use (browsers are read-only there) — that's why this CDP setup exists.
