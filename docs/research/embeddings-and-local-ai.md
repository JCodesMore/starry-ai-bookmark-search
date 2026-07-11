# Embeddings & Local AI for "Bookmark Semantic Search" (MV3)

**Research date:** 2026-07-10
**Target:** MV3 extension, ~1,300–5,000 bookmarks, loose semantic search, **zero recurring cost** (local/on-device or free-tier only), quality must work on *meaning* not substrings.
**Runtime targets:** Comet (Chromium-149 fork by Perplexity) *and* stock Chrome.

---

## 0. Recommendation (read this first)

**Primary engine: `transformers.js` v4 (WASM/CPU, WebGPU when available) running a small transformer embedding model, indexed with hand-rolled brute-force cosine over `Float32Array` stored in IndexedDB.**

The single most important finding: **Chrome's built-in AI (Gemini Nano Prompt API, and the proposed Embedding API) cannot be relied upon in Comet.** Built-in AI "currently depends on Google-internal (Google Chrome only) code that is not publicly available to Chromium/CEF," and the Gemini Nano weights are delivered by Google's component-update servers that forks (Brave, and by extension Comet) do not wire up. There is also **no shipping embedding API at all** — Chrome's Embedding API is only at "Intent to Prototype." So the built-in route is out as a dependency; treat it strictly as an opportunistic optimization on stock Chrome.

### Ranked matrix

| Rank | Engine | Model | Size (download) | Dims | Quality (loose bookmark search) | Cost | Confidence |
|------|--------|-------|-----------------|------|-------------------------------|------|-----------|
| **1 (primary)** | transformers.js v4, WASM+WebGPU | `bge-small-en-v1.5` or `all-MiniLM-L6-v2` (q8) | ~23–33 MB | 384 | Strong; genuine semantic match | $0 | **High** |
| **2 (ultra-light default / fast path)** | transformers.js v4, `model_type:'model2vec'` | `potion-retrieval-32M` (or `potion-base-8M`) | ~8–120 MB | 256 | Good enough for *loose* search; ~82–92% of MiniLM | $0 | **Med-High** |
| **3 (quality ceiling, opt-in)** | transformers.js v4, WebGPU | `embeddinggemma-300m` (MRL→256) | ~200–400 MB | 768→256 | Best-in-class on-device | $0 | **Med** (footprint/hardware) |
| 4 (opportunistic, stock Chrome only) | Chrome built-in Prompt API (Gemini Nano) for query expansion only | Gemini Nano | ~4 GB (Google-delivered) | n/a | Cannot embed; only helps rewrite queries | $0 | **Low** for Comet |
| — (rejected as dependency) | Chrome Embedding API | shared on-device model | n/a | n/a | Not shipped (Intent to Prototype) | $0 | **N/A** |

**Recommended concrete build:** ship **`potion-retrieval-32M` as the instant default** (tiny download, sub-second index build, static embeddings ~20k+ sentences/sec on CPU) and offer **`bge-small-en-v1.5` q8 as an optional "higher quality" toggle**. Both run identically through transformers.js; vectors are pre-L2-normalized and searched by brute-force dot product in a Web Worker. This satisfies zero-cost, works on Comet and stock Chrome, and 5,000 vectors is trivially within brute-force range.

**What would invalidate this:** (a) Chrome ships the Embedding API to stable *and* Comet enables Google component delivery (unlikely near-term) — then built-in becomes a free zero-download primary on stock Chrome; (b) potion quality proves too weak on your real bookmark queries in testing — then promote bge-small to default; (c) WebGPU proves unavailable in Comet's service-worker/offscreen context — WASM fallback still works, just slower on first index.

See §6 for the full rationale.

---

## 1. transformers.js in MV3 (2026 state)

### Current version
- Package: **`@huggingface/transformers` v4.2.0** (verified from the repo `packages/transformers/package.json`), depending on **`onnxruntime-web` 1.26.0-dev.20260416**. (The old `@xenova/transformers` name is deprecated → renamed to `@huggingface/transformers`.)
- **v4** (announced "Transformers.js v4: Now Available on NPM", after development starting March 2025) headline: a **WebGPU runtime rewritten in C++** with the ONNX Runtime team, tested across ~200 architectures, giving **~4× speedup for BERT-based embedding models** and the same code path across browser/Node/Bun/Deno.

### MV3 integration: service worker vs offscreen document
- **WASM/CPU backend can run directly inside the MV3 service worker.** This is the simplest path and is enough for embedding models (no DOM needed).
- **WebGPU generally requires an offscreen document.** Pattern: the service worker (`background.js`) is the coordinator; it calls `chrome.offscreen.createDocument()` (needs the `"offscreen"` permission + a `justification`) to spin up a hidden `offscreen.html`/`offscreen.js` where `navigator.gpu` is reachable; the two exchange results via `chrome.runtime` messaging.
- Service workers are **suspended/restarted on idle**, so treat the loaded pipeline as recoverable state and re-init on wake. Persist settings in `chrome.storage.local`; persist vectors in **IndexedDB** (see §5).

### CSP / `wasm-unsafe-eval` / bundling
- MV3 forbids **remotely-hosted code**. transformers.js by default fetches ONNX/WASM helper files at runtime → **MV3 blocks this**. Fix: **bundle the ONNX runtime `.wasm`/`.mjs` files locally at build time** (e.g. a small Vite/webpack copy step into `dist/`), then set `env.backends.onnx.wasm.wasmPaths` / `env.localModelPath` to the bundled files and `env.allowRemoteModels = false` (or host the model files in the extension package). Also host the model weights locally or in the extension to avoid runtime remote fetch.
- The ONNX WASM backend uses `WebAssembly.instantiate` → the manifest CSP must include **`wasm-unsafe-eval`** in `content_security_policy.extension_pages` (e.g. `"script-src 'self' 'wasm-unsafe-eval'"`).
- Multi-threaded WASM (SIMD + threads via `SharedArrayBuffer`) requires **COOP/COEP** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`); in an extension you typically run single-thread WASM or handle this in the offscreen doc — single-thread SIMD is already fine for small embedding models.

### Known extension examples/templates
- Hugging Face official blog: *"How to Use Transformers.js in a Chrome Extension."*
- `tantara/transformers.js-chrome` (generative AI in-browser extension, service-worker + offscreen + WebGPU pattern).
- Medium write-ups documenting the exact MV3 patch (Vite plugin to copy runtime files) and the WebGPU-in-offscreen architecture.

### Cold start & memory
- `all-MiniLM-L6-v2` q8 ONNX is **~23 MB**. First load (download + graph deserialize + JIT warm-up) is typically **~2–5 s** on a normal connection (8–12 s only on throttled 3G). transformers.js caches weights via the **browser Cache API / IndexedDB**, so subsequent loads are fast.
- Warm inference for MiniLM is **~8–12 ms** per short text on an M2-class laptop (WASM). RAM footprint on the order of tens of MB for the model (~43 MB fp16 reference; less for q8). **Do the initial full-corpus embedding once in a Web Worker/offscreen doc** and store vectors — you never re-embed unless bookmarks change.

---

## 2. Best small embedding models for this corpus size

All are ONNX/transformers.js-ready. "MTEB avg" is the general benchmark; for bookmark search, retrieval quality and *robustness to short/noisy titles* matter most.

| Model | Params | Download (q8) | Dims | MTEB avg (approx) | Notes |
|-------|--------|--------------|------|-------------------|-------|
| **all-MiniLM-L6-v2** | 22–33M | **~23 MB** | 384 | ~56 | The proven browser default; fast, tiny, well-understood. |
| **bge-small-en-v1.5** | 33M | ~30 MB | 384 | ~62 (strong retrieval) | Better retrieval than MiniLM at same size/dims; use `pooling:'cls'`, `normalize:true`. **Best size/quality sweet spot.** |
| **snowflake-arctic-embed-s** | 33M | ~30 MB | 384 | retrieval-tuned | No true "xs"; smallest is `-s` (based on e5-small). Retrieval-focused; competitive with bge-small. |
| **EmbeddingGemma-300m** | 308M | ~200 MB q / ~400 MB fp | 768 (MRL→512/256/128) | ~69 EN / 61 multilingual | Best-in-class on-device; multilingual; Matryoshka truncation. Heavier download/RAM. |
| **Qwen3-Embedding-0.6B** | 596M | ~560 MB | 1024 | top open-weight on MTEB | Highest quality here, but download too large for a bookmark utility; needs task-instruction prefix. |

**Quantization:** transformers.js maps `dtype:'q8'` → `onnx/model_quantized.onnx`, `dtype:'q4'`/`'q4f16'` for smaller/WebGPU-optimized. q8 halves size with negligible retrieval loss for these small encoders; q4 is more aggressive (test quality). Name the file `model_quantized.onnx` (common gotcha: `q8` does **not** look for `model_q8.onnx`).

**WASM-CPU vs WebGPU:** For a one-time index of 1,300–5,000 short bookmark strings, WASM/CPU is adequate (embeddings computed once, cached forever). WebGPU (available via offscreen doc in v4's C++ runtime, ~4× faster on BERT embeddings) is a nice-to-have that shortens the initial index build and speeds re-indexing, but **must not be a hard dependency** (WebGPU availability in Comet's extension context is unverified — see §6 risks).

**Verdict for this corpus:** `bge-small-en-v1.5` (q8, 384-d) is the best *transformer* choice — small download, strong retrieval, cheap storage (5,000 × 384 × 4 B ≈ 7.7 MB of vectors). MiniLM is the safe fallback. Gemma/Qwen are overkill in footprint for a bookmark utility unless the user opts in for max quality/multilingual.

---

## 3. Static / ultra-light embeddings (model2vec / potion)

**What they are:** Model2Vec distills a sentence-transformer into a **static token-embedding lookup** (no attention at inference) — **up to ~50× smaller and up to ~500× faster on CPU** (20k–30k+ sentences/sec), for a modest quality drop. They run in transformers.js via `AutoModel.from_pretrained(..., { config:{ model_type:'model2vec' }, dtype:'fp32' })` — the potion models have ONNX weights uploaded specifically for transformers.js (community-ported in 2025 after Model2Vec moved to numpy inference).

| Model | Params | Size | Dims | Quality vs all-MiniLM-L6-v2 |
|-------|--------|------|------|-----------------------------|
| **potion-base-8M** | 7.6M | **~8–30 MB** | 256 | MTEB 51.32 (~92% of MiniLM) |
| **potion-base-32M** | ~32M vocab | ~120 MB | 256 | MTEB 52.83 (~95%) |
| **potion-retrieval-32M** | ~32M vocab | ~120 MB | 256 | **retrieval 35.06 (~82% of MiniLM retrieval) — best static retriever** |
| potion-mxbai-256d-v2 (2026) | — | small | 256 | ~71.45 MTEB avg @ 15k+ sent/s CPU; `potion-mxbai-micro` ~0.7 MB for embedded/extension use |
| potion-multilingual-128M (2025) | 128M | larger | 256 | 101 languages |

**int8 quantization** (2025 update) cuts model2vec models to ~25% of size with no meaningful loss.

**Good enough for loose bookmark search?** Yes, very likely. Your requirement is *loose* matching ("warmup iphone ai" → warmr.so; "ai chat" → grok.com), where recall of the right handful of bookmarks in a ~5k corpus matters more than fine-grained ranking. Static embeddings capture topical/lexical-semantic proximity well; they weaken mainly on word-order/context nuance, which is not central here. The killer advantages: **~8–30 MB download, essentially instant full-corpus indexing, negligible RAM, and no WebGPU needed** — ideal for an MV3 extension that must feel snappy on first run.

**Recommendation:** Use **`potion-retrieval-32M`** as the default engine (retrieval-tuned, 256-d), with `potion-base-8M` as the smallest possible option. Offer `bge-small-en-v1.5` as the "higher quality" upgrade for users who want it. Since all three go through the same transformers.js `feature-extraction`/model2vec path and produce normalized vectors, switching models = re-embed the corpus once.

---

## 4. Chrome built-in AI APIs (July 2026 status)

### What's shipping
- **Prompt API (LanguageModel / Gemini Nano):** **stable for Chrome Extensions since Chrome 138** (`chrome.languageModel` / global `LanguageModel`); on-device, **no API key, nothing sent to Google**. Web-page use is still origin-trial/flagged. From **Chrome 149** the models support EN/ES/JA/DE/FR I/O.
- **Summarizer, Translator, Language Detector:** stable (Chrome 138+). **Writer/Rewriter, Proofreader:** origin trial (Proofreader OT runs Chrome 141–145).
- **Embedding API:** **NOT shipped.** Only an **"Intent to Prototype"** (crbug.com/428233906, chromestatus 5115796490682368, explainer `explainers-by-googlers/embedding-api`). Experimental, may change or never ship. **Do not design around it.**

### Hardware / requirements (Gemini Nano)
- GPU path: **>4 GB VRAM**; or CPU path: **≥16 GB RAM + ≥4 cores**; **≥22 GB free disk** on the profile volume; OS Win10/11, macOS 13+, Linux, ChromeOS (Chromebook Plus). The **~4 GB model** downloads separately on first use via Chrome's component updater. Real-world eligibility is uneven (one analysis: ~60% of users).

### The decisive question: do they work in Comet (Chromium-149 fork)?
**No — not reliably.** Evidence:
- Chrome for Developers states built-in AI **"currently depends on Google-internal (Google Chrome only) code that is not publicly available to Chromium/CEF."**
- The Gemini Nano weights come from **Google's component-delivery servers**. Forks like **Brave** show the "Optimization Guide On Device Model" component **missing** from `brave://components` and **no `weights.bin` delivered** even when flags are toggled. The same gating (server-side experiment config, region, vendor wiring) applies to any fork that hasn't integrated Google's optimization-guide pipeline.
- **Comet's own AI uses cloud frontier models** (Sonar, Claude, GPT, Gemini Pro, etc.), not the local Nano Prompt API. Nothing indicates Comet ships/enables Gemini Nano or the built-in AI extension surface.

**Implication for this project:**
1. There is **no built-in embedding capability** to use, on any browser (Embedding API unshipped).
2. Even the Prompt API (which can't embed anyway — only text-gen) is unavailable-by-default in Comet.
3. Therefore built-in AI is at most an **opportunistic enhancement on stock Chrome** — e.g. feature-detect `LanguageModel.availability()` and, if `"available"`, use Gemini Nano to **expand/rewrite the query** ("warmup iphone ai" → richer text) before embedding it locally. It **cannot** be the embedding engine. Always ship the transformers.js path as the real engine.

---

## 5. Vector storage & search at this scale

### Is brute-force cosine fast enough? Yes — comfortably.
- Rule of thumb: **brute-force exact KNN is fine under ~100k vectors**; ANN only pays off above that. Your corpus is 1,300–5,000.
- Cost per query = O(n·d). At **5,000 × 384 ≈ 1.9M multiply-adds** — trivial for a modern JS engine, **sub-millisecond to low-single-digit ms**. Even 5,000 × 768 (~3.8M) is fine.
- **Pre-L2-normalize vectors at insert time**, then query = plain **dot product** (identical ranking to cosine, skips the divide). Loop over `Float32Array`s in a tight loop.
- Real browser reference: RxDB (transformers.js embeddings in IndexedDB) reports **~88 ms** end-to-end query — "fast enough you don't need a spinner." Your dominant cost is the **initial IndexedDB read**, not the math.

### IndexedDB patterns for Float32Array vectors
- Store each vector as a **`Float32Array`** (IndexedDB structured-clone handles typed arrays natively; no JSON stringify). Key by bookmark id; keep a parallel `{id, title, url}` record.
- **Bulk-load once** into an in-memory array on startup (one range/`getAll` read), then search in memory. **Avoid per-id `get()` in a loop** (slow) and avoid IndexedDB's reverse-sorted index queries (RxDB found descending index scans much slower — do the top-K sort in JS instead).
- Re-embed only on bookmark add/remove/edit (listen to `chrome.bookmarks` events); persist vectors so cold start = read, not re-embed.

### JS vector libs vs hand-rolled
| Option | Algorithm | Size | Latency | Fit |
|--------|-----------|------|---------|-----|
| **Hand-rolled dot-product** | brute force | ~0 | sub-ms–few ms | **Recommended** — full control, no dep, perfect at this scale |
| Orama | brute force (+ full-text/hybrid) | ~80 KB | 5–10 ms | Good if you also want lexical/hybrid search out of the box |
| Voy | k-d tree (WASM) | 75 KB gz | ~2 ms | Overkill; k-d trees degrade at high dims anyway |
| altor-vec | HNSW (WASM) | 54 KB gz | ~0.6 ms | Overkill for <100k |
| idb-vector (Paul Kinlan) | brute force over IDB | small | — | Reference impl for IDB cosine |
| EdgeVec (Rust/WASM) | — | — | 329 µs @ 100k×768 | Only if you scale far beyond bookmarks |

**Verdict:** **Hand-roll it.** A ~30-line normalized dot-product + top-K over a bulk-loaded `Float32Array` array is faster to ship, dependency-free, and more than fast enough. Consider **Orama** only if you want built-in **hybrid** (keyword + vector) search — which could actually help "loose" queries by combining lexical and semantic signals, at the cost of an ~80 KB dep.

---

## 6. Recommendation (detailed)

**Engine:** transformers.js v4.2.0, WASM/CPU primary with optional WebGPU (offscreen doc) acceleration, bundled locally (no remote code), running in a Web Worker / offscreen document so the popup UI never blocks.

**Model tiering (all via the same pipeline; switching = one-time re-embed):**
1. **Default (instant):** `potion-retrieval-32M` (static, 256-d, ~120 MB or `potion-base-8M` ~8–30 MB) — near-instant corpus indexing, no WebGPU needed, ~82–92% of MiniLM quality. Excellent for *loose* bookmark search and a great first-run experience.
2. **Quality toggle:** `bge-small-en-v1.5` q8 (384-d, ~30 MB) — genuine transformer retrieval quality, still tiny; ~7.7 MB of stored vectors at 5k.
3. **Max quality opt-in:** `embeddinggemma-300m` (MRL→256, ~200–400 MB) for power users / multilingual bookmark sets.

**Storage/search:** pre-normalized `Float32Array` vectors in IndexedDB, bulk-loaded to memory, brute-force dot-product top-K in a worker. No vector DB dependency needed.

**Built-in AI:** feature-detect only. On stock Chrome where `LanguageModel.availability() === "available"`, optionally use Gemini Nano to expand queries before local embedding. Never a dependency; irrelevant on Comet.

**Why this over built-in AI:** built-in AI (a) has no embedding capability (Embedding API unshipped), (b) is Google-Chrome-only code absent from Chromium forks, and (c) won't deliver the Nano model in Comet. transformers.js is the only route that is **zero-cost, works identically on Comet and stock Chrome, and genuinely embeds meaning.**

**Confidence:** **High** on the transformers.js + brute-force IndexedDB architecture (mature, well-benchmarked at this scale). **Medium-High** on potion static embeddings being "good enough" — validate on your real bookmark queries; if ranking feels weak, promote bge-small to default (trivial swap). **High** that built-in AI cannot be a dependency for Comet.

**What could invalidate:**
- Chrome ships the Embedding API to stable **and** Comet enables Google component delivery → built-in becomes a free, zero-download primary on stock Chrome (still keep transformers.js for Comet). Watch chromestatus 5115796490682368.
- potion quality insufficient on real queries → switch default to bge-small (already planned as toggle).
- WebGPU unavailable/unstable in Comet's offscreen context → WASM fallback covers it (slower first index only).
- transformers.js v4 API churn (still evolving; onnxruntime-web on a dev build) → pin versions and bundle.

---

## Sources

**transformers.js / MV3**
- How to Use Transformers.js in a Chrome Extension — Hugging Face — https://huggingface.co/blog/transformersjs-chrome-extension
- Transformers.js v4: Now Available on NPM — Hugging Face — https://huggingface.co/blog/transformersjs-v4
- `@huggingface/transformers` package.json (v4.2.0, onnxruntime-web 1.26.0-dev.20260416) — https://raw.githubusercontent.com/huggingface/transformers.js/main/packages/transformers/package.json
- Releases · huggingface/transformers.js — https://github.com/huggingface/transformers.js/releases
- Running Transformers.js inside a Chrome extension (MV3): a practical patch — https://medium.com/@vprprudhvi/running-transformers-js-inside-a-chrome-extension-manifest-v3-a-practical-patch-d7ce4d6a0eac
- Transformers.js + ONNX Runtime WebGPU in Chrome extension — https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9
- tantara/transformers.js-chrome — https://github.com/tantara/transformers.js-chrome
- Migrate to a service worker — Chrome for Developers — https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
- Optimizing Transformers.js for Production Web Apps — SitePoint — https://www.sitepoint.com/optimizing-transformers-js-production/
- WebGPU vs WebASM: Browser Inference Benchmarks — SitePoint — https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/

**Embedding models**
- Xenova/all-MiniLM-L6-v2 — https://huggingface.co/Xenova/all-MiniLM-L6-v2
- onnx-community/bge-small-en-v1.5-ONNX — https://huggingface.co/onnx-community/bge-small-en-v1.5-ONNX
- BAAI/bge-small-en-v1.5 — https://huggingface.co/BAAI/bge-small-en-v1.5
- Snowflake-Labs/arctic-embed — https://github.com/Snowflake-Labs/arctic-embed
- EmbeddingGemma (Google) release — https://developers.googleblog.com/en/introducing-embeddinggemma/ ; HF: https://huggingface.co/blog/embeddinggemma
- In-browser semantic search with EmbeddingGemma (Transformers.js demo) — https://glaforge.dev/posts/2025/09/08/in-browser-semantic-search-with-embeddinggemma/ ; https://github.com/glaforge/embedding-gemma-semantic-search
- Qwen3-Embedding-0.6B-ONNX — https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX ; https://simonwillison.net/2025/Jun/8/qwen3-embedding/

**Static embeddings (model2vec / potion)**
- MinishLab/model2vec — https://github.com/MinishLab/model2vec ; results: https://github.com/MinishLab/model2vec/blob/main/results/README.md
- potion-base-8M — https://huggingface.co/minishlab/potion-base-8M (ONNX for transformers.js discussion: /discussions/1)
- potion-base-32M — https://huggingface.co/minishlab/potion-base-32M
- potion-retrieval-32M — https://huggingface.co/minishlab/potion-retrieval-32M
- POTION: bag of tricks blog — https://minishlab.github.io/tokenlearn_blogpost/

**Chrome built-in AI**
- The Prompt API — Chrome for Developers — https://developer.chrome.com/docs/ai/prompt-api
- Built-in AI / Built-in AI APIs — https://developer.chrome.com/docs/ai/built-in ; https://developer.chrome.com/docs/ai/built-in-apis
- Join the Prompt API for Chrome Extensions origin trial — https://developer.chrome.com/blog/prompt-api-origin-trial
- The Proofreader API — https://developer.chrome.com/docs/ai/proofreader-api
- Intent to Prototype: Embedding API (blink-dev) — https://groups.google.com/a/chromium.org/g/blink-dev/c/EjL1gAy3k3Q/m/31Cnh22MBgAJ ; explainer: https://github.com/explainers-by-googlers/embedding-api
- Chrome built-in AV feature status / Chromium-CEF limitation — https://github.com/chromiumembedded/cef/issues/3982
- Missing brave://components "Optimization Guide On Device Model" (Brave) — https://github.com/brave/brave-browser/issues/40599
- Chrome Silently Downloads 4GB Gemini Nano (component updater behavior) — https://knightli.com/en/2026/05/09/chrome-gemini-nano-silent-download/
- Perplexity Comet uses cloud frontier models — https://www.superchargebrowser.com/library/perplexity-comet-vs-chrome-extensions/

**Vector storage & search**
- IndexedDB as a Vector Database (Paul Kinlan) — https://paul.kinlan.me/idb-as-a-vector-database/ ; idb-vector: https://github.com/PaulKinlan/idb-vector
- Local JavaScript Vector Database that works offline (RxDB, 88ms benchmark) — https://rxdb.info/articles/javascript-vector-database.html
- Browser-based vector search (Nearform, chose Orama; 5–10ms) — https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/
- Orama — https://github.com/oramasearch/orama ; vector search docs: https://docs.orama.com/docs/orama-js/search/vector-search
- altor-vec (HNSW, comparison table) — https://github.com/Altor-lab/altor-vec
- EdgeVec (Rust/WASM) — https://github.com/matte1782/edgevec
- client-vector-search — https://github.com/yusufhilmi/client-vector-search
