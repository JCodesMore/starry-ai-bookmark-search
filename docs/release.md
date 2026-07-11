# Releasing & the Chrome Web Store

**Load when:** packaging, bumping versions, cutting a release, editing the CI/release
workflows, or doing store-listing work (assets, copy, privacy policy).

## Two manifests, one file

`public/manifest.json` is the STORE truth: host access is declared as
`optional_host_permissions`, so a store install prompts for nothing up front. The default dev
build (`tools/build.mjs`) rewrites those to required so CDP suites never hit the native
permission prompt; `tools/build.mjs --store` skips the rewrite — `npm run package` uses the
store build.

## Packaging

`npm run package` — store-manifest build → sanity checks → `release/starry-vX.Y.Z.zip` with
`manifest.json` at the zip root (what Load Unpacked expects). Zipping is cross-platform:
`Compress-Archive` on Windows, `zip(1)` elsewhere — so the Linux CI runner builds the identical
artifact.

## Cutting a release — one command

```
npm run release -- patch                      # or minor | major | X.Y.Z
npm run release -- patch notes.md             # with hand-written release notes
```

Arguments are positional and order-independent (a bump word or exact version, and optionally a
path to an existing notes file) — no flags, because PowerShell strips a bare `--` and npm then
claims `--foo` flags for itself.

`tools/release.mjs` runs the whole cycle: preflight (clean `main`, synced with origin, tag
free) → bumps `public/manifest.json` + `package.json`/`package-lock.json` together → runs
`npm run package` (store build + sanity checks → `release/starry-vX.Y.Z.zip`, the CWS
upload) → commits `Release vX.Y.Z` (the pre-commit hook runs the full gate) → tags → pushes
main + tag atomically → watches `.github/workflows/release.yml` gate, package, and publish
the GitHub Release with the zip attached (tag ↔ manifest version enforced; a mismatch fails
the run) → applies the notes file if given, else the generated notes stand. It prints the
release URL and the local zip path when done.

Write notes install-first, and always state that manual installs don't auto-update. The one
manual step left afterward: upload `release/starry-vX.Y.Z.zip` (same bytes as the GitHub
asset) at the CWS dashboard.

Dry run: trigger `release.yml` via workflow_dispatch — it gates and packages but only uploads
the zip as a workflow artifact, publishing nothing. `ci.yml` independently runs the full gate
on every push and PR.

## Brand & store assets

- `node tools/gen-icons.mjs` — regenerate `public/icons` from the SVG mark (the single source
  of truth for the brand artwork; in-app marks in popup/onboarding must match it).
- `node tools/gen-store-assets.mjs` — CWS store icon (padded) + 440×280 promo tile.
- `node tools/gen-screenshots.mjs` — CWS 1280×800 screenshots (composited popup + onboarding).
  It asserts the popup actually entered search mode with the expected top hit before shooting;
  if it throws, the captured state was wrong — fix the state, never screenshot around it.
- Store listing copy: `docs/store/listing.md`. Privacy policy: `docs/store/privacy-policy.md`
  — its GitHub URL is referenced from the CWS dashboard, and the manifest `homepage_url`
  points at the repo; if the repo is ever renamed or moved, update all of them together.
