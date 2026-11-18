import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const EMBED_DIM = 768;
export const GEMINI_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
export const READ_ONLY_INDEX = process.env.RAG_READ_ONLY === '1';
export const INDEX_DIR = process.env.RAG_INDEX_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), READ_ONLY_INDEX ? '../.vercel-rag' : '../vectra_index');
const LOCAL_MODEL = 'local-hash-v2';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const BATCH_SIZE = 50; // the API accepts up to 100 texts per batch call
const cachePath = path.join(INDEX_DIR, 'embed_cache_v2.json');
// Waits between attempts after a 429/5xx. Exposed so tests can shrink them.
export const retryPolicy = { delaysMs: [1000, 3000, 8000] };
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* first run */ }
let dirty = false;
let unavailableUntil = 0;
let degraded = 0;
export const degradedEmbeddingCount = () => degraded;
const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const geminiConfigured = () => process.env.EMBEDDING_PROVIDER !== 'local' && Boolean(apiKey());
// What queries use right now: drops to local for a minute after a provider error.
export const embeddingProvider = () => geminiConfigured() && Date.now() >= unavailableUntil ? 'gemini' : 'local';
export const embeddingModel = () => embeddingProvider() === 'gemini' ? GEMINI_MODEL : LOCAL_MODEL;
// What the index is supposed to be built with. Unlike embeddingModel() it does not
// flip during an outage, so a blip never makes every stored chunk look "changed".
export const configuredEmbeddingModel = () => geminiConfigured() ? GEMINI_MODEL : LOCAL_MODEL;
export function flushEmbedCache() {
  if (READ_ONLY_INDEX || !dirty) return;
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  fs.writeFileSync(`${cachePath}.tmp`, JSON.stringify(cache));
  fs.renameSync(`${cachePath}.tmp`, cachePath);
  dirty = false;
}
process.on('exit', flushEmbedCache);

export function localEmbedding(text, dim = EMBED_DIM) {
  const vec = Array(dim).fill(0);
  const words = String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  for (let i = 0; i < words.length; i++) {
    for (const [token, weight] of [[words[i], 1], [`${words[i]}_${words[i + 1] || ''}`, 0.5]]) {
      const hash = crypto.createHash('sha256').update(token).digest();
      vec[hash.readUInt32LE(0) % dim] += weight * (hash[4] % 2 ? 1 : -1);
    }
  }
  const norm = Math.hypot(...vec) || 1;
  return vec.map(v => v / norm);
}

const cleanText = text => String(text || '').slice(0, 8000).trim() || 'empty';
const cacheKey = (model, taskType, clean) => crypto.createHash('sha256').update(`${model}:${taskType}:${clean}`).digest('hex');
const localRecord = clean => ({ vector: localEmbedding(clean), model: LOCAL_MODEL, provider: 'local' });
function markDegraded(count = 1) { degraded += count; unavailableUntil = Date.now() + 60000; }
function remember(key, vector) {
  // Bound cache growth from arbitrary public search queries.
  if (Object.keys(cache).length >= 12000) cache = Object.fromEntries(Object.entries(cache).slice(-10000));
  cache[key] = vector;
  dirty = true;
}
function unitVector(values) {
  if (!Array.isArray(values) || values.length !== EMBED_DIM || !values.every(Number.isFinite) || !Math.hypot(...values)) throw new Error('Invalid embedding');
  const norm = Math.hypot(...values);
  return values.map(v => v / norm);
}

// POST with retry on rate limits and server errors. Other 4xx responses are
// permanent (bad key, bad request) and fail immediately.
async function postGemini(endpoint, body, { timeoutMs, delaysMs }) {
  let lastError;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      const response = await fetch(`${GEMINI_API}/${endpoint}`, {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
        body: JSON.stringify(body),
      });
      if (response.ok) return await response.json();
      lastError = Object.assign(new Error(`Embedding provider HTTP ${response.status}`), { permanent: response.status !== 429 && response.status < 500 });
    } catch (err) { lastError = err; }
    if (lastError.permanent || attempt === delaysMs.length) break;
    await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
  }
  throw lastError;
}

// A vector always carries its actual model; a fallback never enters Gemini's cache.
// Single texts (search queries) get one quick attempt: a slow retry would stall the user.
export async function embedRecord(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const clean = cleanText(text);
  const provider = embeddingProvider();
  const model = provider === 'gemini' ? GEMINI_MODEL : LOCAL_MODEL;
  const key = cacheKey(model, taskType, clean);
  if (cache[key]) return { vector: cache[key], provider, model };
  let vector;
  if (provider === 'gemini') {
    try {
      const data = await postGemini(`${encodeURIComponent(model)}:embedContent`, { content: { parts: [{ text: clean }] }, taskType, outputDimensionality: EMBED_DIM }, { timeoutMs: 8000, delaysMs: [] });
      vector = unitVector(data?.embedding?.values);
    } catch {
      markDegraded();
      return localRecord(clean);
    }
  } else vector = localEmbedding(clean);
  remember(key, vector);
  return { vector, provider, model };
}
export async function embedText(text) { return (await embedRecord(text)).vector; }

/**
 * Embed document texts for indexing, using batched requests with retry/backoff.
 *
 * strict: true is for index builds. If Gemini is configured but cannot supply a
 * vector, this throws instead of quietly storing a lower-quality local vector.
 * Finished batches stay in the on-disk cache, so a re-run resumes where it stopped.
 */
export async function embedRecords(texts, { strict = false } = {}) {
  const clean = texts.map(cleanText);
  const out = new Array(clean.length);
  const fillLocal = indexes => { for (const i of indexes) out[i] = localRecord(clean[i]); };
  const everything = clean.map((_, i) => i);

  if (embeddingProvider() !== 'gemini') {
    if (strict && geminiConfigured()) throw new Error('Gemini embeddings are cooling down after a provider error; retry shortly');
    fillLocal(everything);
    return out;
  }

  const misses = [];
  for (const i of everything) {
    const cached = cache[cacheKey(GEMINI_MODEL, 'RETRIEVAL_DOCUMENT', clean[i])];
    if (cached) out[i] = { vector: cached, provider: 'gemini', model: GEMINI_MODEL };
    else misses.push(i);
  }
  for (let start = 0; start < misses.length; start += BATCH_SIZE) {
    const batch = misses.slice(start, start + BATCH_SIZE);
    if (embeddingProvider() !== 'gemini') { fillLocal(batch); continue; }
    try {
      const data = await postGemini(`${encodeURIComponent(GEMINI_MODEL)}:batchEmbedContents`, {
        requests: batch.map(i => ({ model: `models/${GEMINI_MODEL}`, content: { parts: [{ text: clean[i] }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBED_DIM })),
      }, { timeoutMs: 30000, delaysMs: retryPolicy.delaysMs });
      if (!Array.isArray(data?.embeddings) || data.embeddings.length !== batch.length) throw new Error('Embedding batch size mismatch');
      const vectors = data.embeddings.map(e => unitVector(e?.values));
      batch.forEach((i, j) => {
        remember(cacheKey(GEMINI_MODEL, 'RETRIEVAL_DOCUMENT', clean[i]), vectors[j]);
        out[i] = { vector: vectors[j], provider: 'gemini', model: GEMINI_MODEL };
      });
      flushEmbedCache(); // keep paid-for work if a later batch fails
    } catch (err) {
      flushEmbedCache();
      if (strict) throw err;
      markDegraded(batch.length);
      fillLocal(batch);
    }
  }
  return out;
}
export async function embedBatch(texts) { return (await embedRecords(texts)).map(r => r.vector); }
