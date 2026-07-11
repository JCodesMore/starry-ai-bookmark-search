# Starry (chrome-bookmark-semantic)

@AGENTS.md

MV3 Chrome extension (semantic search over bookmarks), developed and tested in a
**dedicated Comet dev browser instance** driven over the Chrome DevTools Protocol.
No manual clicking in `chrome://extensions` is ever needed.

## Layout

- `src/` — TypeScript extension source (strict; bundled by esbuild)
- `public/` — static extension assets (manifest.json, popup.html) copied into the build
- `dist/` — built unpacked extension (gitignored; what the dev browser loads)
- `tools/` — zero-dependency Node dev-loop + build scripts (Node 22+, global fetch/WebSocket)
- `.dev-profile/` — isolated browser profile for the dev instance (gitignored)
- `docs/` — operating manual (`AGENTS.md` routing), research, decisions

## The dev loop

```
npm run browser   # launch/attach dev Comet with CDP on :9222, ensure dist/ loaded (idempotent)
# ...edit code in src/ or public/ ...
npm run reload    # BUILD + reload extension; exit 1 + real error if the new code fails to load
npm run smoke     # e2e checks: SW ping, bookmarks API, popup UI search, screenshot
npm run import    # sync the user's real bookmarks into the dev profile (see below)
npm run gate      # format:check + lint + typecheck + tests (pre-commit hook runs this)
npm run stop      # cleanly close the dev browser
```

Fast file-scoped checks while iterating: `npx eslint src/lib/url.ts`, `npx vitest run src/lib/url.test.ts`.

Verification & diagnostics (all CDP-driven, all safe to run any time):

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
node tools/gen-icons.mjs           # regenerate public/icons from the SVG mark
node tools/gen-store-assets.mjs    # CWS store icon (padded) + 440x280 promo tile
node tools/gen-screenshots.mjs     # CWS 1280x800 screenshots (composited popup + onboarding)
npm run package                    # store-manifest build → sanity checks → release/starry-vX.zip
                                   # NOTE: public/manifest.json is STORE truth (optional_host_permissions);
                                   # the default dev build rewrites them to required so CDP suites
                                   # never hit the native permission prompt (tools/build.mjs --store skips)
                                   # RELEASE: bump version in public/manifest.json + package.json →
                                   # commit → `git tag vX.Y.Z` → `git push origin main --tags`;
                                   # .github/workflows/release.yml gates, packages, and publishes
                                   # the GitHub Release with the zip attached (tag must match manifest)
node tools/rank-of.mjs <substr> "q" ...  # where a bookmark ranks per query (full scored list)
node tools/tune.mjs                # fusion-weight sweep over goldens (via message override)
node tools/tag-scores.mjs <substr> # zero-shot tag cosines for a live record's tag text
node tools/seed-bookmark.mjs <url> "title"  # add a test bookmark (idempotent by url)
```

Standard iteration: **edit → `npm run reload` → `npm run smoke` → view
`tools/screenshots/smoke-popup.png`**. Reload clears Chrome's sticky extension
error log first, so reported errors always belong to the current code.

## Test data — real bookmarks

The user's real bookmarks (~1,341) live in their main Comet profile (the `Default`
profile dir). `npm run import` (`tools/import-bookmarks.mjs`) reads that profile's
`Bookmarks` JSON from disk (read-only) and recreates the tree in the dev browser
under a folder named `Imported bookmarks` — any previous import folder is replaced,
so re-run any time the bookmarks change. Pass a profile display name as an argument
to import a different profile; names → dirs resolve via `<User Data>/Local State`.
Note: the "Claude" profile has NO bookmarks.

## Why the dev browser is not the user's Claude profile

A profile's user-data-dir can only be open in one browser process, Chromium 136+
blocks `--remote-debugging-port` on the default user-data-dir, and dev churn on
real profile data is risky. Instead: **two channels, two browsers** — CDP drives
the isolated dev instance (a superset of the extension tools' abilities:
navigation, clicks, JS eval, screenshots, plus `chrome://` pages), while the
Claude-in-Chrome extension stays connected in the user's main browser for
anything needed in their real browsing context. Both work simultaneously.

## Hard rules

- **Never touch the user's main Comet browser** (their profile, their process).
  The dev instance is fully isolated via `--user-data-dir=.dev-profile` and is the
  only thing listening on CDP port 9222. `tools/stop.mjs` only closes via that port.
- The user's main browser has the Claude-in-Chrome extension connected — never
  reload/kill that extension; it is the session's browser control channel.
- Extension ID is derived from the unpacked path (currently `dist/`), so it is stable per
  machine but CHANGES if the load path moves — never hardcode it; read it from
  `npm run browser` output or `findExtension()` in `tools/cdp.mjs`.

## How it works (tools/)

- `config.mjs` — Comet exe path, CDP port (9222), extension dir/name.
- `cdp.mjs` — CDP helpers: target listing, `Runtime.evaluate` on any target,
  `chrome.developerPrivate.*` via a `chrome://extensions` page target
  (list/reload/clear-errors/dev-mode), tab open/close, PNG screenshots.
- `launch.mjs` — spawns Comet detached with `--user-data-dir`, `--remote-debugging-port`,
  `--load-extension`, `--enable-unsafe-extension-debugging`; falls back to CDP
  `Extensions.loadUnpacked` if the flag is ignored.
- `reload.mjs` / `smoke.mjs` — see loop above; both exit non-zero on failure.

Useful primitives for ad-hoc debugging (import from `tools/cdp.mjs`):
`createTab(url)` + `evalOnTarget(tab, expr)` runs JS in any page — including
extension pages, where all `chrome.*` extension APIs are available (used for
seeding test bookmarks). `screenshot(tab, file)` for visual checks.

## Environment notes

- Comet exe: `%LOCALAPPDATA%/Perplexity/Comet/Application/comet.exe`
  (Chromium 149 base). Override with `COMET_EXE`; port with `CDP_PORT`.
- `comet://`/`chrome://` pages cannot be driven by the Claude browser extension or
  by computer use (browsers are read-only there) — that's why this CDP setup exists.
