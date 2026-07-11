# Starry promo video

A [Remotion](https://www.remotion.dev) project that renders Starry's promo video (for the
Chrome Web Store listing + YouTube) and the custom video thumbnail (for YouTube + the README).

Live video: <https://www.youtube.com/watch?v=fpB1Djvemlw> (linked from the README hero and the
CWS listing; if you re-render with meaningful changes, upload a new version and update both).

Everything on screen is faithful to the real product: colors/typography mirror
`public/tokens.css`, the mark is the exact geometry from `tools/gen-icons.mjs`, the demo
corpus and expanded-card layout mirror `docs/store/assets/shot-1-search-light.png`, and all
copy comes from `docs/store/listing.md`. See [STORYBOARD.md](STORYBOARD.md) for the scene map.

## Commands (run inside `promo/`)

```
npm install                # once; also auto-downloads Chrome Headless Shell on first render
npm run dev                # Remotion Studio — live-edit the composition
npm run lint               # eslint + tsc

npx remotion render src/index.ts promo out/starry-promo.mp4 --codec h264   # the video
npx remotion still src/index.ts thumbnail out/thumbnail.png                # the thumbnail
npx remotion still src/index.ts promo out/frame.png --frame=560            # QC a single frame
```

`out/` is gitignored — rendered artifacts are build products; re-render after edits.
The committed README/YouTube thumbnail lives at `docs/store/assets/promo-video-thumb.png`
(copy `out/thumbnail.png` there after re-rendering).

## Version pinning

All `remotion`/`@remotion/*` packages must stay on the **exact same version** (lockstep rule).
This machine's npm has a publish-cooldown (`before` date) configured, so the pinned version is
the newest one older than that window — bump all six Remotion deps together when upgrading.
