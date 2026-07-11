# 003 — Search: hybrid semantic + lexical fusion with explainable matches

**Decision (2026-07-10).** Query pipeline: embed the query (same model as index) → cosine against
all vectors; in parallel score lexical hits (title/URL/domain/tag term matches, prefix + word
boundary aware) → fuse scores (weighted sum, weights tuned by the golden harness) → ranked results
each carrying **match-reason metadata** (`semantic | title | url | tag | domain`) for the UI.

**Why hybrid.** Every serious competitor ships it: pure vector search under-serves exact/short
queries ("github" must rank github.com #1 instantly), pure lexical can't do "warmup iphone ai" →
warmr.so. Short queries are ambiguous for vectors alone (research Q3).

**Explainability rule.** UI shows one honest reason per result (tag chip, bolded literal match, or
"related" for pure-semantic) — NEVER fabricated highlights for non-literal matches, never raw
similarity scores (UX research: Algolia/Perplexity reasoning).

**Quality arbiter.** `tools/eval.mjs` golden-query suite against the real 1,342-bookmark corpus
(canonical: "warmup iphone ai" → warmr.so, "ai chat" → grok.com) reporting hit@k/MRR gates every
ranking change. Tuning happens against data, not vibes.

**Rejected.** BM25 library dependency (corpus is small; weighted term scoring suffices, revisit if
harness disagrees); ANN indexes (unneeded ≤100k vectors); query LLM-expansion (needs a generative
model we don't ship — optional later behind feature detection).

**Invalidated if:** harness shows fusion can't hit targets (→ add real BM25, query expansion, or
stronger model per 001 invalidators).

Source: docs/research/embeddings-and-local-ai.md §5, signal-collection-and-tagging.md §3, prior-art.md takeaway 5.
