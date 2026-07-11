# 006 — Build tooling: TypeScript strict + esbuild + ESLint 10 + Prettier + Vitest

**Decision (2026-07-10, implemented).** TS 6 strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), esbuild 0.28 bundling `src/` entries to flat `dist/` (ESM, MV3
module SW) + `public/` statics copied in; ESLint 10 flat config (typescript-eslint,
no-magic-numbers, max-lines 500, max-depth 4); Prettier; Vitest 4. One `npm run gate` command,
enforced by `.githooks/pre-commit` via `core.hooksPath`.

**Why esbuild over Vite/CRXJS.** Our CDP dev loop (build → `developerPrivate.reload` → smoke) is
deterministic and already proven; CRXJS's HMR magic would fight it, and its maintenance history is
shaky. esbuild is fast (<100 ms builds), zero-config, and handles the multi-entry MV3 shape
(background SW + popup + future offscreen doc) trivially.

**Versions verified by installation** (package-lock is the source of truth): typescript 6.0.3,
esbuild 0.28.1, eslint 10.6.0, prettier 3.9.4, vitest 4.1.9.

**Invalidated if:** we need dev-time HMR for UI iteration (unlikely — reload loop is ~2 s) or
esbuild can't express a future packaging need.
