# Starry promo video — storyboard (v2)

43.8s · 1920×1080 · 30fps · text-driven (works muted — ~85% of views are) · no fabricated UI:
every popup detail mirrors the real extension (tokens.css light theme, store screenshots,
listing copy). Structure follows demo-video best practice: problem-first hook, ONE demo done
fully, trust beat, concrete CTA.

Continuous night-sky background (brand: icon's #2d4f96→#14305e indigo) with a deterministic
drifting/twinkling star field behind all scenes. Scenes play back-to-back with clean-stage
fades (outgoing content fully clears before the next scene enters — no cross-scene overlap).

| # | Scene    | Frames | Beats & on-screen copy |
|---|----------|--------|------------------------|
| 1 | Hook     | 168    | A: "You saved it. **Somewhere.**" → B: "You just can't remember what it was called." Ghost bookmark titles drift faintly behind (slot-placed, no collisions). Beats are sequential, never overlapping. |
| 2 | Solution | 84     | Bridge into the reveal: "What if you could just *describe it*?" (accent on "describe it"). |
| 3 | Intro    | 111    | Star-mark tile springs in + wordmark "Starry". Sub = the store/GitHub tagline verbatim: "Find your bookmarks like a simple Google search." / "Local, private, and free. It just works." |
| 4 | Demo     | 429    | Split layout: captions left, live popup mock right (faithful: header, search field, ranked rows, favicon, bold matched words). Types "that visual tool for building ai agents" → results cascade (Flowise top — real store-screenshot corpus) → top hit blooms into detail card (full URL, folder, added date, topic chips). Captions: 1 "Type what you remember." / 2 "Starry matches meaning." / 3 "Topics learned automatically." |
| 5 | Privacy  | 180    | "Private by design." Brand shield (night-sky gradient + star) with pulse rings. Lines: "Everything runs locally." / "Your bookmarks never leave your machine." |
| 6 | Free     | 126    | "Free. Nothing to upsell." Chips: No account · No subscription · No limits. Sub: "There's no server behind Starry — so there's nothing to charge for." |
| 7 | CTA      | 216    | Lockup: tile + "Starry" + "AI Bookmark Search". Pill: "Add to Chrome — free". Footer: "Free & open source · github.com/JCodesMore/starry-ai-bookmark-search". Holds the final frame (embed poster / end frame). |

Also registered: `thumbnail` (1280×720 still) — custom YouTube/README thumbnail with play
affordance, rendered via `npx remotion still`.

Render commands (from `promo/`):

    npx remotion render src/index.ts promo out/starry-promo.mp4 --codec h264
    npx remotion still src/index.ts thumbnail out/thumbnail.png

Accuracy sources: README.md, docs/store/listing.md, docs/store/assets/shot-1/2, public/tokens.css.
