import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const EMBED_DIM = 768;
export const GEMINI_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
export const READ_ONLY_INDEX = process.env.RAG_READ_ONLY === '1';
export const INDEX_DIR = process.env.RAG_INDEX_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), READ_ONLY_INDEX ? '../.vercel-rag' : '../vectra_index');
const LOCAL_MODEL = 'local-hash-v2';
const cachePath = path.join(INDEX_DIR, 'embed_cache_v2.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* first run */ }
let dirty = false;
let unavailableUntil = 0;
let degraded = 0;
export const degradedEmbeddingCount = () => degraded;
export const embeddingProvider = () => process.env.EMBEDDING_PROVIDER !== 'local' && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) && Date.now() >= unavailableUntil ? 'gemini' : 'local';
export const embeddingModel = () => embeddingProvider() === 'gemini' ? GEMINI_MODEL : LOCAL_MODEL;
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

// A vector always carries its actual model; a fallback never enters Gemini's cache.
export async function embedRecord(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const clean = String(text || '').slice(0, 8000).trim() || 'empty';
  const provider = embeddingProvider();
  const model = provider === 'gemini' ? GEMINI_MODEL : LOCAL_MODEL;
  const key = crypto.createHash('sha256').update(`${model}:${taskType}:${clean}`).digest('hex');
  if (cache[key]) return { vector: cache[key], provider, model };
  let vector;
  if (provider === 'gemini') {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY },
        body: JSON.stringify({ content: { parts: [{ text: clean }] }, taskType, outputDimensionality: EMBED_DIM }),
      });
      if (!response.ok) throw new Error(`Embedding provider HTTP ${response.status}`);
      vector = (await response.json())?.embedding?.values;
      if (!Array.isArray(vector) || vector.length !== EMBED_DIM || !vector.every(Number.isFinite) || !Math.hypot(...vector)) throw new Error('Invalid embedding');
      const norm = Math.hypot(...vector);
      vector = vector.map(v => v / norm);
    } catch {
      degraded++;
      unavailableUntil = Date.now() + 60000;
      return { vector: localEmbedding(clean), model: LOCAL_MODEL, provider: 'local' };
    }
  } else vector = localEmbedding(clean);
  // Bound cache growth from arbitrary public search queries.
  if (Object.keys(cache).length >= 12000) cache = Object.fromEntries(Object.entries(cache).slice(-10000));
  cache[key] = vector;
  dirty = true;
  return { vector, provider, model };
}
export async function embedText(text) { return (await embedRecord(text)).vector; }
export async function embedRecords(texts, { concurrency = 3 } = {}) {
  const out = new Array(texts.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, async () => {
    while (cursor < texts.length) { const i = cursor++; out[i] = await embedRecord(texts[i]); }
  }));
  flushEmbedCache();
  return out;
}
export async function embedBatch(texts) { return (await embedRecords(texts)).map(r => r.vector); }
