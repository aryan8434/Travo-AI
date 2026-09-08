import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { vectraIndex as index, loadAllPackages, syncVectraIndex } from "./ragEngine.js";
import { embeddingProvider, embeddingModel, EMBED_DIM, INDEX_DIR } from "./embeddings.js";

import { rankChunks } from "./retrieval.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectraFolder = INDEX_DIR;

/**
 * Chunk-level RAG API — powers the RAG Explorer UI.
 *
 * Where ragEngine.retrievePackages() returns a business result (packages),
 * these expose the retrieval layer itself: the chunks, their similarity
 * scores, the query embedding, and the timings of each pipeline stage.
 */

export const CHUNK_CONFIG = {
  strategy: "section-aware sliding window over markdown",
  target_words: 350,
  overlap_words: 60,
  section_label: "nearest preceding H2/H3 heading",
  records_per_document: "1 structured summary vector + N guide chunks",
};

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Normalise a Vectra item into the shape the explorer UI renders. */
function toChunkView(item, extra = {}) {
  const m = item?.metadata || {};
  const text = m.text || "";
  return {
    id: item?.id,
    chunk_id:
      m.chunk_id ||
      `${m.package_id}::${m.kind}${m.chunk_index != null ? `::${m.chunk_index}` : ""}`,
    package_id: m.package_id,
    title: m.title,
    destination: m.destination,
    state: m.state,
    country: m.country,
    category: m.category,
    budget_tier: m.budget_tier,
    price_inr: m.price_inr,
    rating: m.rating,
    kind: m.kind,
    section: m.section,
    chunk_index: m.chunk_index ?? null,
    word_count: m.word_count ?? (text ? text.split(/\s+/).filter(Boolean).length : 0),
    char_count: text.length,
    text,
    vector_dim: item?.vector?.length || 0,
    ...extra,
  };
}

let _cache = { key: "", items: [] };

async function allIndexItems() {
  await syncVectraIndex();
  if (!(await index.isIndexCreated())) return [];
  let key = "0";
  try {
    key = String(fs.statSync(path.join(vectraFolder, "index.json")).mtimeMs);
  } catch {
    /* index file may not exist yet */
  }
  if (key === _cache.key && _cache.items.length) return _cache.items;
  const items = await index.listItems();
  _cache = { key, items };
  return items;
}

/**
 * Semantic + keyword search over CHUNKS (not packages).
 * Returns retrieved chunks with similarity scores, the query-embedding
 * metadata and per-stage timings, plus the exact context string a RAG prompt
 * would receive.
 */
export async function searchChunks(query, opts = {}) {
  const {
    topK = 10,
    packageId = null,
    kind = null,
    section = null,
    minScore = 0,
    hybrid = true,
  } = opts;

  const t0 = performance.now();
  const items = await allIndexItems();
  const { scores, embedded, candidates } = await rankChunks(items, query, { hybrid, filter: item => {
    const m = item.metadata;
    return (!packageId || m.package_id === packageId) && (!kind || m.kind === kind) && (!section || m.section.toLowerCase() === section.toLowerCase());
  } });
  const qv = embedded.vector;
  const embedMs = 0, searchMs = performance.now() - t0;
  const modeUsed = hybrid ? 'hybrid (dense + BM25)' : 'dense only';
  const raw = scores;
  const top = scores.filter(r => r.score >= minScore).slice(0, topK).map(r => toChunkView(r.item, { score: r.score, embedding_model: r.model }));
  const contextText = top
    .map((h, i) => `[${i + 1}] (${(h.score * 100).toFixed(1)}%) ${h.title} — ${h.section}\n${h.text}`)
    .join("\n\n---\n\n");

  return {
    query,
    retrieval: {
      embedding_provider: embedded.provider,
      vector_dim: qv.length,
      mode: modeUsed,
      candidates_scanned: candidates,
      returned: top.length,
      embed_ms: Math.round(embedMs * 10) / 10,
      search_ms: Math.round(searchMs * 10) / 10,
      total_ms: Math.round((embedMs + searchMs) * 10) / 10,
    },
    query_vector_preview: qv.slice(0, 12).map((v) => Math.round(v * 10000) / 10000),
    chunks: top,
    context_text: contextText,
    context_chars: contextText.length,
  };
}

/** Browse / filter the chunk store without a vector query. */
export async function listChunks(opts = {}) {
  const { page = 1, limit = 25, q = "", packageId = null, kind = null, section = null } = opts;
  const items = await allIndexItems();
  let views = items.map((it) => toChunkView(it));

  if (packageId) views = views.filter((v) => v.package_id === packageId);
  if (kind) views = views.filter((v) => v.kind === kind);
  if (section) views = views.filter((v) => (v.section || "").toLowerCase() === section.toLowerCase());
  if (q) {
    const needle = q.toLowerCase();
    views = views.filter(
      (v) =>
        v.text.toLowerCase().includes(needle) ||
        (v.title || "").toLowerCase().includes(needle) ||
        (v.section || "").toLowerCase().includes(needle) ||
        (v.destination || "").toLowerCase().includes(needle),
    );
  }

  views.sort(
    (a, b) =>
      String(a.package_id).localeCompare(String(b.package_id)) ||
      (a.chunk_index ?? -1) - (b.chunk_index ?? -1),
  );

  const total = views.length;
  const start = (Math.max(1, page) - 1) * limit;
  return {
    total,
    page: Math.max(1, page),
    limit,
    pages: Math.ceil(total / limit) || 1,
    chunks: views.slice(start, start + limit),
  };
}

/** One chunk, with its vector preview and nearest neighbours in embedding space. */
export async function getChunkById(chunkId, { neighbours = 5 } = {}) {
  const items = await allIndexItems();
  const item = items.find((it) => (it.metadata?.chunk_id || "") === chunkId);
  if (!item) return null;

  const view = toChunkView(item);
  view.vector_preview = (item.vector || []).slice(0, 24).map((v) => Math.round(v * 10000) / 10000);

  const near = items
    .filter((it) => it.id !== item.id && it.metadata?.embedding_model === item.metadata?.embedding_model)
    .map((it) => ({ it, score: cosine(item.vector || [], it.vector || []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, neighbours)
    .map(({ it, score }) => toChunkView(it, { score }));

  return { chunk: view, neighbours: near };
}

/** Index-wide statistics for the explorer dashboard. */
export async function ragStats() {
  const packages = loadAllPackages();
  const items = await allIndexItems();
  const views = items.map((it) => toChunkView(it));

  const byKind = {};
  const bySection = {};
  const byTier = {};
  const byPackage = {};
  let words = 0;

  for (const v of views) {
    byKind[v.kind] = (byKind[v.kind] || 0) + 1;
    if (v.kind === "guide") bySection[v.section] = (bySection[v.section] || 0) + 1;
    if (v.budget_tier) byTier[v.budget_tier] = (byTier[v.budget_tier] || 0) + 1;
    byPackage[v.package_id] = (byPackage[v.package_id] || 0) + 1;
    words += v.word_count || 0;
  }

  const complete = packages.filter((p) => p.content_status === "complete");
  const guideWords = complete.reduce((s, p) => s + (p.word_count || 0), 0);

  let indexBytes = 0;
  try {
    indexBytes = fs.statSync(path.join(vectraFolder, "index.json")).size;
  } catch {
    /* ignore */
  }

  return {
    documents: {
      total_packages: packages.length,
      with_full_guide: complete.length,
      guide_words_total: guideWords,
      guide_words_avg: complete.length ? Math.round(guideWords / complete.length) : 0,
    },
    chunks: {
      total: views.length,
      words_total: words,
      words_avg: views.length ? Math.round(words / views.length) : 0,
      by_kind: byKind,
      by_section: bySection,
      by_tier: byTier,
      top_packages: Object.entries(byPackage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([id, n]) => ({ package_id: id, chunks: n })),
    },
    embedding: {
      provider: embeddingProvider(),
      dim: EMBED_DIM,
      model: embeddingModel(),
    },
    chunking: CHUNK_CONFIG,
    index: {
      engine: "Vectra LocalIndex",
      retrieval: "hybrid dense + BM25",
      size_bytes: indexBytes,
      size_mb: Math.round((indexBytes / 1048576) * 100) / 100,
    },
  };
}

/** Distinct facet values, for the explorer's filter dropdowns. */
export async function chunkFacets() {
  const items = await allIndexItems();
  const sections = new Set();
  const kinds = new Set();
  const packages = new Map();
  for (const it of items) {
    const m = it.metadata || {};
    if (m.section) sections.add(m.section);
    if (m.kind) kinds.add(m.kind);
    if (m.package_id) packages.set(m.package_id, m.title || m.package_id);
  }
  return {
    kinds: [...kinds].sort(),
    sections: [...sections].sort(),
    packages: [...packages.entries()]
      .map(([id, title]) => ({ package_id: id, title }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}
