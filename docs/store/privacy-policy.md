# Privacy policy — Starry (AI Bookmark Search)

Last updated: July 11, 2026

Starry runs entirely on your device. It has no server, no accounts, and no analytics.
Starry is also open source — the complete code is public at
https://github.com/JCodesMore/starry-ai-bookmark-search, so every claim below can be verified.

## What Starry accesses

- **Your bookmarks** (titles, URLs, folder names): read to build a search index on your device.
  The index lives in your browser's local storage (IndexedDB) and nowhere else.
- **Your searches inside Starry**: processed on your device to rank results and, over time,
  improve your own results. They are never transmitted.
- **Optionally, with your permission — the content of pages you have bookmarked.** If you enable
  "Read page content" during setup or in settings, Starry fetches your bookmarked pages so a
  search can match what a page is about, and captures site icons. The fetching happens from your
  device, the extracted text is stored only on your device, and you can turn this off at any
  time in settings, which also revokes the browser permission behind it.

## What Starry sends over the network

- **Nothing about you.** Starry has no telemetry, no analytics, no error reporting, and no
  account system.
- **One exception on first setup:** Starry downloads its AI model (about 30 MB of model files)
  from the Hugging Face Hub, the standard host for open AI models. This is an ordinary file
  download, like fetching an image; it contains none of your data. The model is cached locally
  and the download does not repeat.
- If "Read page content" is enabled, your browser fetches your own bookmarked pages, the same
  way it would if you opened them.

## What Starry shares

Nothing, with anyone. No selling, no sharing, no transfer of user data to any party.

## Removing your data

"Reset data" in Starry's settings erases everything Starry stores. Uninstalling the extension
removes it all as well. Your actual bookmarks are never moved or copied; they stay exactly where
they always were in your browser.

## Changes

If this policy ever changes, the change will be visible in this document and in the extension's
listing before it applies.

## Contact

Questions: subs@sparkn.com
