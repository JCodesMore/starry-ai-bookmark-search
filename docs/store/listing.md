# Chrome Web Store listing — Starry

Everything to paste into the developer dashboard, field by field.
Copy rules honored: no unattributed testimonials, "bookmark(s)" kept to ~5 natural uses in the
description (spam policy flags >5 repeats), no fake status claims, no "Chrome" in the name.

## Identity

- **Name (manifest, ≤75 chars):** `Starry — AI Bookmark Search`
- **Summary (≤132 chars, user-approved final):**
  `Find your bookmarks like a simple Google search. Local, private, and free. It just works.`
  - Fallback if review ever objects to the trademark reference: `Find your bookmarks like a
    simple web search. Local, private, and free. It just works.`
- **Category:** Tools (alternative: Workflow & Planning)
- **Language:** English (US)

## Detailed description (plain text; CWS renders no markdown)

```
You saved it. Somewhere. You remember what it was about, just not what it was called. Starry finds it anyway.

Type what you remember, in your own words. "that ai chat app". "cheap proxies". "the mortgage calculator". Starry understands meaning, not just letters, so the right result comes up even when no word matches the title.

PRIVATE BY ARCHITECTURE
The AI runs entirely on your computer. No server, no account, no tracking. Your bookmarks and searches never leave your machine. That is not a promise to trust, it is how Starry is built: there is nothing to send data to, so it cannot be leaked, sold, or shut down.

WORKS ON WHAT YOU ALREADY HAVE
No importing, no re-saving into someone else's cloud, no new habits. Starry learns your existing library the moment you set it up, and keeps learning as you save new things. If you ever uninstall it, everything is exactly where it always was.

WHAT YOU GET
• Search by meaning: describe it, find it
• Results that learn: what you pick rises next time
• Topics discovered for you: your library organizes itself, no manual tagging
• Deeper matching, only if you allow it: Starry can read your saved pages locally so a search can match what a page is about
• Address bar search: type bm, then a space
• Delete with undo, reveal in the manager, and a marker on links that no longer respond
• Clean and fast, at home in light and dark

FREE, WITH NOTHING TO UPSELL
There is no server behind Starry, so there is nothing to charge for. No trial, no caps, no premium tier.

ABOUT PERMISSIONS, PLAINLY
Starry asks to read your bookmarks because that is the whole point. Page reading is optional and off until you allow it, and you can revoke it in settings any time. On first setup Starry downloads its AI model (about 30 MB) from Hugging Face; that is a one-time file download and none of your data is ever sent.
```

## Privacy tab

- **Single purpose:** "Starry lets the user search their existing browser bookmarks by meaning:
  they describe the bookmark they remember and Starry finds it, using an AI model that runs
  entirely on their device."
- **Permission justifications:**
  - `bookmarks` — Core function. Reads titles, URLs and folders to build the on-device search
    index. Write access is used only when the user deletes a bookmark inside Starry (with undo).
  - `favicon` — Shows each result's site icon in the results list, via Chrome's built-in favicon
    cache.
  - `offscreen` — Hosts the on-device AI model (WASM) in an offscreen document; MV3 service
    workers cannot run it.
  - `alarms` — Resumes the user-consented page-reading pass if the browser or service worker
    restarts mid-run.
  - `omnibox` — Provides the optional "bm" address-bar keyword for searching.
  - `optional_host_permissions (<all_urls>)` — Requested at the moment the user enables "Read
    page content" (setup or settings), never at install. Used exclusively to fetch pages the
    user has bookmarked, locally, to improve matching and capture site icons. Toggling the
    setting off revokes it.
- **Remote code:** No, I am not using remote code. (Executable code — the ONNX WASM runtime — is
  bundled. The AI model downloaded at first run is data files, not code.)
- **Data usage:** nothing is transmitted off-device. Read the dashboard's inline definition when
  filling it: if "collect" means transmitted off the device (the common reading — most local-only
  extensions carry the "does not collect data" badge), certify that no data is collected. All
  processing and storage is local; the privacy policy discloses local handling regardless, which
  satisfies the user-data policy's disclosure requirement.
- **Privacy policy URL:** `https://github.com/JCodesMore/starry-ai-bookmark-search/blob/main/docs/store/privacy-policy.md`
  (hosted in the public repo; the manifest's homepage_url points at the repo too).

## Account & compliance

- One-time $5 developer registration; 2FA required on the Google account; contact email is
  fixed at signup (choose deliberately).
- EU DSA trader status: **Non-Trader** (free, no monetization, hobbyist).
- After publish: self-nominate for the Featured badge via the One Stop Support page (criteria:
  free core features, no login, privacy-respecting, polished listing — all true).

## Assets checklist (specs verified July 2026)

- Store icon 128×128 PNG (artwork ~96×96 + 16px transparent padding; must read on dark).
- Screenshots: 1–5, 1280×800 preferred. Plan: (1) popup with a meaning-mismatch query and the
  right top hit, (2) hover detail card with topics, (3) onboarding hero, (4) dark mode popup,
  (5) omnibox "bm" in action.
- Small promo tile 440×280 (required in practice — tiles without it rank behind).
- Marquee 1400×560 (optional; only for marquee featuring).
