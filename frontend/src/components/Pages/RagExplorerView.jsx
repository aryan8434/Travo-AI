import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Search, ArrowLeft, Layers, Cpu, Zap, FileText, X, ChevronLeft, ChevronRight,
  Sparkles, Copy, Check, Binary, Network, BarChart3, Filter,
} from 'lucide-react';
import { fadeInUp, staggerParent } from '../../lib/motion';

const SAMPLE_QUERIES = [
  'where can I see one-horned rhinos on a safari',
  'what should I pack for a high-altitude cold desert',
  'houseboat stay with backwater village canoe rides',
  'best months to visit before the monsoon breaks',
  'is scuba diving safe for someone who cannot swim',
  'vegetarian and Jain food options on the trip',
  'how do I get an inner line permit for the north-east',
  'luxury island resort with an overwater villa',
];

const num = (n) => Number(n || 0).toLocaleString('en-IN');

/* ---------------- small building blocks ---------------- */

function Stat({ icon: Icon, label, value, sub, accent = 'cyan' }) {
  return (
    <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1">
      <div className={`flex items-center gap-1.5 text-${accent}-400 text-[11px] font-bold uppercase tracking-wider`}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-extrabold text-white leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function ScoreBar({ score }) {
  const pct = Math.max(0, Math.min(100, score * 100));
  const tone = pct > 70 ? 'from-emerald-500 to-teal-400' : pct > 45 ? 'from-cyan-500 to-sky-400' : 'from-slate-600 to-slate-500';
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="text-[11px] font-mono font-bold text-slate-300 tabular-nums w-11 text-right">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

/** Highlight query terms inside chunk text so retrieval is visible. */
function Highlighted({ text, terms }) {
  const parts = useMemo(() => {
    if (!terms?.length) return [text];
    const esc = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter((t) => t.length > 2);
    if (!esc.length) return [text];
    return text.split(new RegExp(`(${esc.join('|')})`, 'gi'));
  }, [text, terms]);

  const lower = terms.map((t) => t.toLowerCase());
  return (
    <>
      {parts.map((p, i) =>
        lower.includes(String(p).toLowerCase()) ? (
          <mark key={i} className="bg-cyan-500/25 text-cyan-200 rounded px-0.5">{p}</mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

function ChunkCard({ chunk, terms = [], onOpen, rank }) {
  return (
    <motion.button
      variants={fadeInUp}
      whileHover={{ y: -3 }}
      onClick={() => onOpen(chunk)}
      className="w-full text-left glass-card rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition-colors p-4 space-y-2.5 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {rank != null && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 shrink-0">
              #{rank}
            </span>
          )}
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
            chunk.kind === 'summary'
              ? 'bg-violet-500/10 text-violet-300 border-violet-500/25'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}>
            {chunk.kind}
          </span>
          <span className="text-[11px] font-semibold text-cyan-400 truncate">{chunk.section}</span>
        </div>
        {chunk.score != null && <ScoreBar score={chunk.score} />}
      </div>

      <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
        {chunk.title}
      </div>

      <p className="text-[11.5px] text-slate-300 leading-relaxed line-clamp-4">
        <Highlighted text={chunk.text} terms={terms} />
      </p>

      <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 font-mono pt-0.5">
        <span className="text-slate-400">{chunk.chunk_id}</span>
        <span>·</span>
        <span>{chunk.word_count}w</span>
        {chunk.budget_tier && (<><span>·</span><span className="capitalize">{chunk.budget_tier}</span></>)}
        {chunk.destination && (<><span>·</span><span>{chunk.destination}</span></>)}
      </div>
    </motion.button>
  );
}

/* ---------------- chunk detail drawer ---------------- */

function ChunkDetail({ chunkId, onClose, onOpenChunk }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;

    axios
      .get('/api/rag/chunk', { params: { id: chunkId, neighbours: 5 } })
      .then((r) => live && setData(r.data))
      .catch(() => live && setData(null))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [chunkId]);

  const copy = () => {
    navigator.clipboard?.writeText(data?.chunk?.text || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const c = data?.chunk;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-[#0f172a] border-l border-slate-800 overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur border-b border-slate-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Binary className="w-5 h-5 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-white">Chunk Inspector</h3>
              <p className="text-[10px] text-slate-400 font-mono truncate">{chunkId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse">Loading chunk…</div>
        ) : !c ? (
          <div className="p-8 text-center text-xs text-slate-400">Chunk not found.</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              {[
                ['Kind', c.kind], ['Section', c.section],
                ['Words', c.word_count], ['Chars', c.char_count],
                ['Vector dim', c.vector_dim], ['Index', c.chunk_index ?? '—'],
                ['Tier', c.budget_tier || '—'], ['Price', c.price_inr ? `₹${num(c.price_inr)}` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-900/70 rounded-xl p-2.5 border border-slate-800">
                  <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">{k}</div>
                  <div className="text-slate-200 font-semibold truncate">{v}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-[11px] font-bold uppercase text-cyan-400 tracking-wider">Chunk text</h4>
                <button onClick={copy} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                {c.text}
              </div>
            </div>

            {c.vector_preview && (
              <div>
                <h4 className="text-[11px] font-bold uppercase text-cyan-400 tracking-wider mb-1.5">
                  Embedding vector <span className="text-slate-500 normal-case font-normal">— first 24 of {c.vector_dim} dims</span>
                </h4>
                <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 font-mono text-[10px] text-emerald-300/90 break-all leading-relaxed">
                  [{c.vector_preview.join(', ')}, …]
                </div>
                <div className="flex gap-px mt-2 h-8 items-end">
                  {c.vector_preview.map((v, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.min(100, Math.abs(v) * 700 + 4)}%` }}
                      transition={{ delay: i * 0.012 }}
                      className={`flex-1 rounded-sm ${v >= 0 ? 'bg-cyan-500/60' : 'bg-rose-500/60'}`}
                      title={String(v)}
                    />
                  ))}
                </div>
              </div>
            )}

            {data.neighbours?.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold uppercase text-cyan-400 tracking-wider mb-2 flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5" /> Nearest neighbours in embedding space
                </h4>
                <div className="space-y-2">
                  {data.neighbours.map((n) => (
                    <button
                      key={n.chunk_id}
                      onClick={() => onOpenChunk(n.chunk_id)}
                      className="w-full text-left bg-slate-900/70 hover:bg-slate-900 rounded-xl p-3 border border-slate-800 hover:border-cyan-500/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-bold text-slate-200 truncate">{n.title}</span>
                        <ScoreBar score={n.score} />
                      </div>
                      <div className="text-[10px] text-cyan-400 font-semibold">{n.section}</div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">{n.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.aside>
    </motion.div>
  );
}

/* ---------------- main view ---------------- */

export default function RagExplorerView({ onBackToHome }) {
  const [tab, setTab] = useState('search');
  const [stats, setStats] = useState(null);
  const [facets, setFacets] = useState({ kinds: [], sections: [], packages: [] });

  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(8);
  const [hybrid, setHybrid] = useState(true);
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showContext, setShowContext] = useState(false);

  const [browse, setBrowse] = useState(null);
  const [bPage, setBPage] = useState(1);
  const [bQ, setBQ] = useState('');
  const [bKind, setBKind] = useState('');
  const [bSection, setBSection] = useState('');
  const [bPkg, setBPkg] = useState('');
  const [bLoading, setBLoading] = useState(false);

  const [openChunk, setOpenChunk] = useState(null);

  useEffect(() => {
    axios.get('/api/rag/stats').then((r) => setStats(r.data)).catch(() => {});
    axios.get('/api/rag/facets').then((r) => setFacets(r.data)).catch(() => {});
  }, []);

  const runSearch = useCallback(async (q) => {
    const text = (q ?? query).trim();
    if (!text) return;
    setSearching(true);
    setResult(null);
    try {
      const r = await axios.post('/api/rag/search', { query: text, topK, hybrid });
      setResult(r.data);
    } catch (e) {
      setResult({ error: e.response?.data?.message || e.message });
    } finally {
      setSearching(false);
    }
  }, [query, topK, hybrid]);

  const loadBrowse = useCallback(async () => {
    setBLoading(true);
    try {
      const r = await axios.get('/api/rag/chunks', {
        params: { page: bPage, limit: 20, q: bQ, kind: bKind || undefined, section: bSection || undefined, package_id: bPkg || undefined },
      });
      setBrowse(r.data);
    } catch { setBrowse(null); } finally { setBLoading(false); }
  }, [bPage, bQ, bKind, bSection, bPkg]);

  useEffect(() => {
    if (tab === 'browse') {
      const t = setTimeout(loadBrowse, 250);
      return () => clearTimeout(t);
    }
  }, [tab, loadBrowse]);



  const terms = useMemo(
    () => (result?.query || '').split(/\s+/).filter((w) => w.length > 3),
    [result],
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-[#0b0f17] text-slate-100">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button onClick={onBackToHome} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline mb-1 font-semibold">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to AI Concierge
          </button>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Database className="w-6 h-6 text-cyan-400" /> RAG Explorer
          </h2>
          <p className="text-xs text-slate-400">
            Inspect the retrieval layer directly — embeddings, chunks, similarity scores and the exact context a prompt receives.
          </p>
        </div>
        <div className="flex bg-slate-900/70 p-1 rounded-xl border border-slate-800 self-start">
          {[['search', 'Semantic Search', Search], ['browse', 'Chunk Browser', Layers], ['stats', 'Index Stats', BarChart3]].map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`relative px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === k ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === k && (
                <motion.span layoutId="rag-tab" className="absolute inset-0 rounded-lg bg-cyan-500 shadow-md shadow-cyan-500/25"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
              )}
              <Icon className="w-3.5 h-3.5 relative z-10" />
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* top-line stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={FileText} label="Documents" value={num(stats.documents.with_full_guide)}
            sub={`${num(stats.documents.guide_words_total)} words · avg ${num(stats.documents.guide_words_avg)}/doc`} />
          <Stat icon={Layers} label="Vector chunks" value={num(stats.chunks.total)}
            sub={`avg ${stats.chunks.words_avg} words · ${stats.chunking.overlap_words}w overlap`} />
          <Stat icon={Cpu} label="Embeddings" value={`${stats.embedding.dim}d`}
            sub={stats.embedding.model} />
          <Stat icon={Zap} label="Retrieval" value="Hybrid"
            sub={`${stats.index.engine} · ${stats.index.size_mb} MB`} />
        </div>
      )}

      {/* ---------------- SEARCH ---------------- */}
      {tab === 'search' && (
        <div className="space-y-4">
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Ask the corpus anything — natural language, not keywords…"
                  className="w-full bg-slate-900/90 text-sm text-slate-100 placeholder-slate-500 rounded-xl pl-9 pr-4 py-3 border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                onClick={() => runSearch()}
                disabled={searching || !query.trim()}
                className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-1.5 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                {searching ? 'Retrieving…' : 'Retrieve'}
              </button>
            </div>

            <div className="flex items-center gap-4 flex-wrap text-[11px]">
              <label className="flex items-center gap-2 text-slate-400">
                top-K
                <input type="range" min={3} max={25} value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="accent-cyan-500 w-28" />
                <span className="font-mono font-bold text-cyan-400 w-5">{topK}</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                <input type="checkbox" checked={hybrid} onChange={(e) => setHybrid(e.target.checked)} className="accent-cyan-500" />
                Hybrid (dense + BM25)
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {SAMPLE_QUERIES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); runSearch(s); }}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-slate-800 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {searching && (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card rounded-2xl h-28 border border-slate-800 shimmer" />
              ))}
            </div>
          )}

          {result?.error && (
            <div className="glass-panel p-4 rounded-2xl border border-rose-500/30 text-rose-300 text-xs">{result.error}</div>
          )}

          {result?.retrieval && (
            <>
              <div className="glass-panel p-3.5 rounded-2xl border border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[11px]">
                {[
                  ['Mode', result.retrieval.mode],
                  ['Provider', result.retrieval.embedding_provider],
                  ['Vector dim', result.retrieval.vector_dim],
                  ['Scanned', `${result.retrieval.candidates_scanned} chunks`],
                  ['Embed', `${result.retrieval.embed_ms} ms`],
                  ['Search', `${result.retrieval.search_ms} ms`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">{k}</div>
                    <div className="text-slate-200 font-semibold capitalize">{v}</div>
                  </div>
                ))}
              </div>

              <div className="glass-panel p-3 rounded-2xl border border-slate-800">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-1.5">
                  Query embedding — first 12 of {result.retrieval.vector_dim} dims
                </div>
                <div className="font-mono text-[10px] text-emerald-300/80 break-all">
                  [{result.query_vector_preview.join(', ')}, …]
                </div>
              </div>

              <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid gap-3">
                {result.chunks.map((c, i) => (
                  <ChunkCard key={c.chunk_id} chunk={c} terms={terms} rank={i + 1} onOpen={(ch) => setOpenChunk(ch.chunk_id)} />
                ))}
              </motion.div>

              <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
                <button
                  onClick={() => setShowContext((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-200 hover:bg-slate-900/60 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    Retrieved source context
                    <span className="text-slate-500 font-normal">({num(result.context_chars)} chars)</span>
                  </span>
                  <span className="text-cyan-400">{showContext ? '−' : '+'}</span>
                </button>
                <AnimatePresence>
                  {showContext && (
                    <motion.pre
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4 text-[11px] text-slate-300 whitespace-pre-wrap font-mono overflow-x-auto max-h-96 overflow-y-auto"
                    >
                      {result.context_text}
                    </motion.pre>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- BROWSE ---------------- */}
      {tab === 'browse' && (
        <div className="space-y-4">
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                value={bQ} onChange={(e) => { setBQ(e.target.value); setBPage(1); }}
                placeholder="Filter chunk text…"
                className="w-full bg-slate-900/90 text-xs text-slate-100 placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 border border-slate-700 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <select value={bKind} onChange={(e) => { setBKind(e.target.value); setBPage(1); }}
              className="bg-slate-900/90 text-xs text-slate-100 rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-cyan-500">
              <option value="">All kinds</option>
              {facets.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={bSection} onChange={(e) => { setBSection(e.target.value); setBPage(1); }}
              className="bg-slate-900/90 text-xs text-slate-100 rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-cyan-500">
              <option value="">All sections</option>
              {facets.sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={bPkg} onChange={(e) => { setBPkg(e.target.value); setBPage(1); }}
              className="md:col-span-4 bg-slate-900/90 text-xs text-slate-100 rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-cyan-500">
              <option value="">All documents ({facets.packages.length})</option>
              {facets.packages.map((p) => <option key={p.package_id} value={p.package_id}>{p.title}</option>)}
            </select>
          </div>

          {bLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="glass-card rounded-2xl h-24 border border-slate-800 shimmer" />)}
            </div>
          ) : browse ? (
            <>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{num(browse.total)} chunks · page {browse.page} of {browse.pages}</span>
                <div className="flex gap-1.5">
                  <button disabled={browse.page <= 1} onClick={() => setBPage((p) => p - 1)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-30 hover:border-cyan-500/40 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button disabled={browse.page >= browse.pages} onClick={() => setBPage((p) => p + 1)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-30 hover:border-cyan-500/40 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid gap-3">
                {browse.chunks.map((c) => (
                  <ChunkCard key={c.chunk_id} chunk={c} terms={bQ ? [bQ] : []} onOpen={(ch) => setOpenChunk(ch.chunk_id)} />
                ))}
              </motion.div>
            </>
          ) : null}
        </div>
      )}

      {/* ---------------- STATS ---------------- */}
      {tab === 'stats' && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Cpu className="w-4 h-4 text-cyan-400" /> Pipeline configuration</h3>
            {[
              ['Chunking strategy', stats.chunking.strategy],
              ['Target chunk size', `${stats.chunking.target_words} words`],
              ['Overlap', `${stats.chunking.overlap_words} words`],
              ['Section label', stats.chunking.section_label],
              ['Records per doc', stats.chunking.records_per_document],
              ['Embedding model', stats.embedding.model],
              ['Vector dimensions', stats.embedding.dim],
              ['Vector store', stats.index.engine],
              ['Retrieval', stats.index.retrieval],
              ['Index size', `${stats.index.size_mb} MB`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 text-xs border-b border-slate-800/70 pb-2">
                <span className="text-slate-400">{k}</span>
                <span className="text-slate-200 font-semibold text-right">{v}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-cyan-400" /> Chunks per section</h3>
              <div className="space-y-1.5">
                {Object.entries(stats.chunks.by_section).sort((a, b) => b[1] - a[1]).map(([s, n]) => {
                  const max = Math.max(...Object.values(stats.chunks.by_section));
                  return (
                    <div key={s} className="flex items-center gap-2 text-[11px]">
                      <span className="w-40 truncate text-slate-400">{s}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }}
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
                      </div>
                      <span className="w-8 text-right font-mono font-bold text-slate-300">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-cyan-400" /> Largest documents</h3>
              <div className="space-y-1.5">
                {stats.chunks.top_packages.map((p) => (
                  <button key={p.package_id} onClick={() => { setBPkg(p.package_id); setTab('browse'); }}
                    className="w-full flex items-center justify-between text-[11px] hover:bg-slate-900/60 rounded-lg px-2 py-1 transition-colors">
                    <span className="text-slate-400 font-mono truncate">{p.package_id}</span>
                    <span className="font-bold text-cyan-400">{p.chunks} chunks</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {openChunk && (
          <ChunkDetail key={openChunk} chunkId={openChunk} onClose={() => setOpenChunk(null)} onOpenChunk={setOpenChunk} />
        )}
      </AnimatePresence>
    </div>
  );
}
