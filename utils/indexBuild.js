/**
 * Build the deployment's RAG index without letting an embedding-provider outage
 * fail the whole deploy.
 *
 * `sync` is the strict index build: it aborts if Gemini is configured but cannot
 * answer (rate limit, bad key), and leaves nothing half-written. When that happens
 * the build is repeated with the local embedder, so the index is uniform (every
 * vector from one model) rather than a mix. Search still works; it just uses the
 * local hash vectors for ranking until the index is rebuilt with Gemini.
 *
 * Set RAG_REQUIRE_GEMINI=1 to fail the build instead of degrading.
 */
export async function buildIndex(sync, { requireGemini = process.env.RAG_REQUIRE_GEMINI === '1', warn = console.warn } = {}) {
  try {
    return await sync();
  } catch (err) {
    if (requireGemini) throw err;
    warn(`WARNING: Gemini embeddings were unavailable during the build (${err.message}). Building a uniform local-vector index instead. Rebuild once the quota resets, or set RAG_REQUIRE_GEMINI=1 to fail the build in this case.`);
    process.env.EMBEDDING_PROVIDER = 'local';
    return sync({ force: true });
  }
}
