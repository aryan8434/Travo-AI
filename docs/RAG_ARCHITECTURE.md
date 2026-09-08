# RAG implementation

Package JSON is the source of truth. `utils/ragEngine.js` loads generated and legacy records, deduplicates by package ID, caches the catalogue, and detects changes using sorted file paths, sizes and modification times. A five-second watcher triggers incremental sync.

Each package receives a structured summary record. Completed guides produce 350-word passages with 60-word overlap and the nearest preceding Markdown section label. Skeleton instructions are not indexed as guide passages. Metadata includes package ID, chunk ID, section, price, tier, destination, word count, actual embedding model and content hash.

Vectra provides the persistent local index. IDs derive deterministically from chunk IDs. Reindex computes added/changed/deleted records and commits one atomic Vectra update. Forced rebuilds replace records rather than appending duplicates. Source JSON and embedding cache files are also written atomically. Use one index writer per workspace; the deployment model is a single Node process, not a distributed cluster.

`utils/embeddings.js` uses the configurable Gemini embedding API with 768 output dimensions, task-specific cache keys, bounded network timeouts and a local fallback. API failures are not cached as Gemini output. `utils/retrieval.js` compares stored/query vectors only when their model names agree; otherwise both sides use deterministic local vectors. BM25 supplies lexical relevance. Per-chunk model metadata remains visible in the explorer.

Hard metadata filters apply before ranking. A missing budget/location/tier/category/capacity match stays empty. Natural-language rupee budgets are intersected with explicit numeric filters. Candidate vector scores are grouped to parent package IDs and combined with relevance, budget, rating and season signals. Match scores are ranking heuristics, not calibrated probabilities or a guarantee of suitability.

Package list responses are paginated and omit long guides. Full content is loaded through `GET /api/packages/:id`. `POST /api/packages/ask` answers inclusion, price and season questions directly from structured catalogue facts with a summary citation. Other questions retrieve passages, pass bounded source context to the configured chat model and return numbered sources. The prompt treats retrieved prose as untrusted data and prohibits unsupported claims. Offline answers use source excerpts. Generated prose never authorizes a payment; checkout prices come from the catalogue or a signed quote.

The UI provides the catalogue, a full-guide reader with questions, and a RAG Explorer. The latter shows retrieved context, model information, chunk filters and index statistics. Browsing the explorer does not itself call a chat model.

The current corpus includes a 2,257-word Goa reference guide, 117 generated skeletons, eleven oversized pre-existing guide drafts and eight legacy packages. Run `npm run validate:packages` for current editorial status rather than assuming `content_status` alone means a draft meets the word limit.

References: [Google embedding API](https://ai.google.dev/gemini-api/docs/embeddings), [Google model retirement dates](https://ai.google.dev/gemini-api/docs/deprecations), [Vectra source](https://github.com/Stevenic/vectra).
