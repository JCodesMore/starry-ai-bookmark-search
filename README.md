<p align="center">
  <img src="public/icons/icon128.png" width="96" alt="Starry" />
</p>

<h1 align="center">Starry — AI Bookmark Search</h1>

<p align="center">
  Find your bookmarks like a simple Google search. Local, private, and free. It just works.
</p>

<p align="center">
  <a href="https://github.com/JCodesMore/starry-ai-bookmark-search/releases/latest"><img src="https://img.shields.io/github/v/release/JCodesMore/starry-ai-bookmark-search" alt="Latest release" /></a>
  <a href="https://github.com/JCodesMore/starry-ai-bookmark-search/actions/workflows/ci.yml"><img src="https://github.com/JCodesMore/starry-ai-bookmark-search/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=fpB1Djvemlw">
    <img src="docs/store/assets/promo-video-thumb.png" width="720" alt="Watch the Starry promo video — the quick tour" />
  </a>
</p>


You saved it. Somewhere. You remember what it was *about*, just not what it was called.
Ask in your own words and Starry matches meaning, not just letters. Hover any result and
it blooms into a card with the full URL, folder, and the topics Starry learned for it.

Everything runs **100% on your device**: a small embedding model (bge-small-en-v1.5, ~30 MB,
one-time download) indexes your bookmarks locally. No accounts, no cloud, no cost — and your
data never leaves your machine, architecturally, not just as a promise.

## What it does

- **Loose semantic search** — hybrid ranking fuses meaning (local vector embeddings) with
  exact matching (title/URL/tags/folders), so `github` is instant and literal while
  `that visual tool for building ai agents` still finds the right result.
- **Understands your pages** — an optional, permission-gated background crawl (throttled,
  resumable, revocable in settings any time) enriches each bookmark with its real title,
  description, and readable content; dead links and login walls degrade gracefully to
  title+URL signals instead of disappearing.
- **Auto-tags everything** — a curated taxonomy is matched zero-shot against each bookmark's
  embedding, plus cluster-discovered topics learned from your own library. No manual tagging.
- **Learns from you** — results you pick rise for the queries you picked them from. That
  feedback stays on your device like everything else.
- **Stays current** — bookmark add/edit/move/delete events update the index incrementally.
- **Honest, minimal UI** — click the toolbar icon (or `Alt+B`): one search box, ranked results
  as you type, a small chip explaining *why* each result matched — never fabricated highlights.
  Keyboard-first. Light/dark follows your OS. Or type `bm` + space in the address bar.
- **Manage lightly** — delete with undo, reveal in the bookmark manager, and a quiet marker on
  links that no longer respond.

## Install

### Chrome Web Store

Submission in review — the link will appear here the moment it's live. Store installs
auto-update.

### From a release (no build needed)

1. Download `starry-vX.Y.Z.zip` from the
   [latest release](https://github.com/JCodesMore/starry-ai-bookmark-search/releases/latest).
2. Unzip it somewhere you'll keep it — Chrome loads the extension from that folder.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and
   pick the unzipped folder.

Manual installs don't auto-update — grab a new zip from the
[releases page](https://github.com/JCodesMore/starry-ai-bookmark-search/releases) now and then.

### From source

1. `npm install && npm run build`
2. Load `dist/` the same way: `chrome://extensions` → **Developer mode** → **Load unpacked**.

Either way, search works within about a minute (baseline index). Optional page reading
continues quietly in the background — a status line in the popup shows progress and
disappears when done.

## Privacy

Local-first by construction: the model runs in the extension's offscreen document; vectors and
page signals live in IndexedDB; the only network traffic is (a) the one-time model download
from Hugging Face and (b) — only if you allow it — fetching your own bookmarked pages to index
them. Nothing is sent anywhere. The full policy is in
[docs/store/privacy-policy.md](docs/store/privacy-policy.md).

## Development

The repo has a fully automated dev loop against an isolated browser instance (CDP) — see
[AGENTS.md](AGENTS.md) and [docs/dev-loop.md](docs/dev-loop.md). Quality gate: `npm run gate`
(format + lint + strict types + 232 tests),
enforced by a pre-commit hook. Search quality is measured, not vibed: `node tools/eval.mjs`
runs a golden-query suite against a real 1,300+ bookmark corpus (hit@k / MRR; substring
baseline 25% → enriched hybrid pipeline 100%, MRR 0.82). Keep personal golden queries in a
gitignored `tools/goldens.local.json` (same shape as `tools/goldens.json` — it takes
precedence automatically).

Architecture and every major decision (with rejected alternatives) are documented in
[docs/architecture.md](docs/architecture.md) and [docs/decisions/](docs/decisions/).

## License

[MIT](LICENSE)
