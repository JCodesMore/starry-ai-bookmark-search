# 008 — Personalized re-ranking from the user's own clicks (local frecency)

**Decision (2026-07-10).** Result activations teach the ranking, entirely locally. Modeled on
Chrome's omnibox ShortcutsProvider (learned query→doc associations) and Firefox's NewFrecency
(continuous exponential decay), bounded so it can only ever re-order good candidates:

- **Recording.** The popup sends `open-result`; the **service worker** opens the tab, stores a
  `ClickRow` (`queryNorm` token-sorted, tokens, recordId, ts, 1-based rank, sat) in the new v2
  `clicks` store (capped 2,000 rows, pruned oldest-first), and watches the created tab: closed
  within 25 s ⇒ `sat=false` (Chrome's ML omnibox misclick signal) — bounces teach nothing.
- **Boost.** `signal = min(ln(1 + Σ sim·posWeight·decay), 1.1)` over SAT clicks;
  `score ×= 1 + 0.25·signal` (max ×1.275). `sim`: 1 for the same normalized query, Jaccard ≥ 0.5
  for overlapping queries, else 0 (gate closed). `posWeight`: 1 at ranks 1–3 ramping to 1.5 deeper
  (cascade model: a deep click deliberately rejected everything above). `decay`: half-life 30 days.
- **Safety by construction.** Multiplicative + capped (near-zero base stays near-zero — no
  resurrection), re-rank-only over already-retrieved hits (breaks the rich-get-richer loop),
  log-saturated counts, recency decay lets a newer choice for the same query take over.

**Eval integrity.** `tools/eval.mjs` sends `personalized:false` — goldens measure base ranking,
reproducibly; personalization is covered by unit tests (`feedback.test.ts`).

**Why this design.** It solves the per-user vocabulary gap generically (e.g. a user who calls the
"Runescape gold market" site their "osrs prices" site teaches that mapping in one click) — exactly
the class of preference no honest base ranking can hardcode.

**Rejected.** Dwell-time SAT gating (popup can't observe dwell; tab-bounce is the observable
equivalent); query-embedding similarity tier (exact/near-exact recurrence dominates for a single
user — revisit if partial-overlap proves too strict); impression/skip negative signals (v1 keeps
only click evidence).

**Invalidated if:** real usage shows the ×1.275 cap too weak to matter or the Jaccard 0.5 gate too
strict — both are named constants in `feedback.ts`, tune against usage, not vibes.

Source: research task 2026-07-10 (Firefox frecency docs, Chromium shortcuts_database.cc, Kim et al. WSDM 2014, Craswell et al. position-bias).
