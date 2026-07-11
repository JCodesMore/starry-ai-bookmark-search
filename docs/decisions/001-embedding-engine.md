# 001 — Embedding engine: transformers.js + bge-small-en-v1.5 (q8), local-only

**Decision (2026-07-10).** Embed with **transformers.js v4** running **bge-small-en-v1.5 q8**
(384-dim, ~30 MB) on WASM in the extension's own contexts. Vectors are L2-normalized
`Float32Array`s persisted in IndexedDB, each tagged with the embedding-model version. Search is
brute-force cosine (dot product on normalized vectors) — at ≤5k bookmarks that is sub-ms to few-ms
per query (5,000 × 384 ≈ 1.9M mults), no vector DB needed. All inference behind an
`EmbeddingProvider` interface so the model is a one-time re-embed swap.

**Why.** Zero recurring cost, architecturally local-first (prior art shows "local" claims get
audited), best retrieval quality per MB among small models. Cold start (~2–5 s first model load,
cached after) and ~10 ms warm embeds are trivial at our corpus size, so the speed advantage of
static models buys nothing we need.

**Rejected.**
- **Chrome built-in AI (Gemini Nano)** — decisive: weights ship via Google-internal components
  that Chromium forks (incl. Comet) don't get; no shipping embedding API exists anywhere (only an
  Intent to Prototype). May be used later as an optional, feature-detected query expander on stock
  Chrome — never a dependency.
- **potion-retrieval-32M (model2vec static, 256-d)** — kept as fallback if bge WASM latency ever
  hurts; its ~1000× throughput is wasted at 1.3k docs and retrieval quality is a step down.
- **EmbeddingGemma-300m** — better quality but ~200 MB; too heavy for an extension download.
- **Cloud embedding APIs** — recurring cost + privacy; violates the product's core promise.
- **Vector DB libs (voy/orama/etc.)** — unneeded complexity below ~100k vectors.

**MV3 constraints honored.** The executable code — ONNX runtime `.mjs`/`.wasm` — is bundled in the
package (no remotely hosted code); CSP `wasm-unsafe-eval`. The model **weights** (~30 MB of ONNX
data, not code) download once from the Hugging Face Hub on first run and live in the Cache API
after; no user data rides that request. Disclosed in the store privacy policy. Precedent: published
transformers.js extensions (incl. Featured ones) ship the same way. Bundling the weights into the
zip remains an option if policy ever tightens.

**Amendment (2026-07-10, empirical):** ORT's WASM backend dynamic-imports its loader, and MV3
service workers ban dynamic `import()` (verified live: "import() is disallowed on
ServiceWorkerGlobalScope"). The engine therefore runs in the **offscreen document**; the SW uses
`core/embedder/offscreen-proxy.ts` behind the same EmbeddingProvider seam. ORT selects the
*asyncify* runtime variant — build ships both `ort-wasm-simd-threaded{,.asyncify}.{mjs,wasm}`.
Measured in Comet: warm-up ~0.5 s (weights Cache-API-cached after first download), ~40 ms per
query embed, dim 384.

**Invalidated if:** golden-query harness shows bge-small too weak (→ EmbeddingGemma via optional
download) or index-time latency unacceptable (→ potion); Chrome ships a stable Embedding API AND
Comet wires Google components (unlikely).

Source: docs/research/embeddings-and-local-ai.md, docs/research/prior-art.md.
