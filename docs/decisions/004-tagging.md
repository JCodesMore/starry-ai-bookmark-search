# 004 — Auto-tagging: curated taxonomy, zero-shot via the same embedder

**Decision (2026-07-10).** Ship a curated taxonomy (~50 tags: dev, ai, design, shopping, docs,
video, social, finance, gaming, news, …). Each tag has a short natural-language description that
is embedded ONCE with the same model as bookmarks. A bookmark's tags = top-k taxonomy entries by
cosine above a threshold, boosted/overridden by domain & URL heuristics (github.com → dev;
youtube.com/watch → video; etc.). Heuristics run first and are authoritative for well-known
domains.

**Why.** Zero extra model, zero cost, reuses vectors we already compute; KeyBERT-style zero-shot
is exactly this pattern. No mature keyword-extraction JS lib exists (YAKE/RAKE ports are stale or
fragile per research); free-form keyword tags produce noisy, unbounded vocab — a curated set stays
clean in the UI (progressive disclosure: tags must be *useful filters*, not clutter).

**Rejected.** Local generative tagging via Chrome built-in LanguageModel (unavailable in Comet —
see 001); RAKE/TextRank JS ports (unmaintained); unbounded auto-vocab (UI noise, dedup pain).

**Invalidated if:** taxonomy coverage proves too coarse on the real corpus (→ expand taxonomy or
add per-domain subtags); zero-shot precision too low (→ raise threshold, add heuristics).

Source: docs/research/signal-collection-and-tagging.md §6, prior-art.md takeaway 9 (adapted: their
LanguageModel route is Comet-incompatible).
