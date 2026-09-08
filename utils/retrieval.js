import { embedRecord, localEmbedding } from './embeddings.js';
const STOP = new Set('a an the is are was were be this that these those what which how do does it its of in on at for to and or my me your you i we us can with about package holiday travel please tell'.split(' '));
const words = s => (String(s).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(w => !STOP.has(w)).map(w => /^(included|includes|including|inclusions)$/.test(w) ? 'include' : w);
const dot = (a, b) => a.reduce((n, v, i) => n + v * (b[i] || 0), 0);
const docs = new Map();

// Filter before ranking. Compare dense vectors ONLY when their models agree;
// otherwise rank both query and document in the deterministic local space.
export async function rankChunks(items, query, { filter = () => true, hybrid = true } = {}) {
  const candidates = items.filter(filter);
  const embedded = await embedRecord(query, 'RETRIEVAL_QUERY');
  const localQuery = localEmbedding(words(query).join(' ') || query);
  const terms = [...new Set(words(query))];
  const documents = candidates.map(item => {
    const text = item.metadata?.text || '';
    const key = `${item.id}:${item.metadata?.record_hash || text}`;
    if (!docs.has(key)) docs.set(key, { tokens: words(text), local: localEmbedding(words(text).join(' ') || text) });
    return { item, ...docs.get(key) };
  });
  if (docs.size > 10000) docs.clear();
  const avgLen = documents.reduce((n, d) => n + d.tokens.length, 0) / (documents.length || 1);
  const frequencies = new Map(terms.map(t => [t, documents.filter(d => d.tokens.includes(t)).length]));
  const scores = documents.map(d => {
    const compatible = d.item.metadata?.embedding_model === embedded.model;
    const useRemote = compatible && embedded.provider !== 'local';
    const dense = Math.max(0, dot(useRemote ? embedded.vector : localQuery, useRemote ? d.item.vector : d.local));
    const bm25 = terms.reduce((score, t) => {
      const tf = d.tokens.filter(w => w === t).length;
      const df = frequencies.get(t);
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      return score + idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.tokens.length / (avgLen || 1)));
    }, 0);
    const lexical = bm25 / (bm25 + 4);
    return { item: d.item, score: hybrid ? dense * 0.6 + lexical * 0.4 : dense, dense, lexical, model: compatible ? embedded.model : 'local-hash-v2' };
  }).sort((a, b) => b.score - a.score);
  return { scores, embedded, candidates: candidates.length };
}
