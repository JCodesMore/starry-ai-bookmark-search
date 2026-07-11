# 007 — Ranking v2: distribution-aware fusion + description-field lexical evidence

**Decision (2026-07-10).** Three general changes to the 003 ranking, driven by a measured failure
(a doc at semantic rank 3 of 1,346 buried at fused rank 19 under bare single-token title matches):

1. **Full-corpus semantic ranking.** The top-60 neighbor cutoff is gone — brute-force cosine over
   every embedded record is sub-ms at this scale, fusion gets true corpus-relative ranks, and the
   "outside top-60 = exactly 0" cliff disappears.
2. **Distribution-aware semantic channel.** `sem = rankBlend · rankQuality + (1−rankBlend) ·
   magnitude`, where `rankQuality = (k+1)/(k+rank)` (weighted-RRF shape normalized to [0,1],
   k = `rankSharpness`, default 15 — small k sharpens the top ranks, per Elastic/Azure guidance for
   short lists) and `magnitude = clamp((cos − floor)/(maxCos_thisQuery − floor))` (per-query max —
   Bruch et al.'s TM2C2 convex-combination normalization, ACM TOIS 2023). A fixed cosine ceiling
   cannot see that 0.674 is this query's 3rd-best score; rank can. The absolute floor (0.5) still
   gates the whole channel: "rank 1 of the corpus" for a nonsense query is not relevance.
3. **Description-field lexical evidence.** Crawled meta description + headings + site name join the
   lexical components at the weakest weight (0.35 < folder 0.4 < url < tag < title) — author-written
   page summaries are real literal evidence; the body excerpt stays excluded (too noisy — body
   meaning is the semantic channel's job).

**Why not pure RRF.** RRF discards score magnitude; bge cosine is calibrated enough that magnitude
is real signal (Bruch et al.: tuned convex combination beats RRF when you can tune — we have the
golden harness). The blend keeps rank as the backbone and magnitude as the tie-breaker.

**Quality arbiter.** goldens.json grew regression queries for this class ("gold prices" →
merchants.to on the first screen among ~20 literal-title competitors). All parameters live in
`RankWeights`, overridable per search message (sanitized) so the harness can sweep without rebuilds.

**Rejected.** Per-site/synonym hardcoding (owner constraint: general mechanisms only — the
osrs↔runescape vocabulary gap is bridged by the embedding + click learning, decision 008);
z-score/DBSF normalization (min-max vs per-query max is rank-equivalent per Bruch, simpler);
corpus-mean tag calibration (probe showed it suppresses genuinely-common tags on skewed corpora).

**Invalidated if:** the harness shows rank-credit flooding results with weak semantic hits on tiny
corpora (<100 bookmarks) — then gate rankQuality by a stronger absolute floor.

Source: research task 2026-07-10 (RRF/Bruch/Weaviate/OpenSearch citations in session notes), decision 003.
