import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, RefreshCw, Upload, FileText, Database, Layers, CheckCircle2, ArrowLeft, Trash2, Eye, ShieldCheck, Sparkles } from 'lucide-react';

export default function AdminView({ onBackToHome }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('travoai_admin_key') || '');

  const authHeaders = () => ({ headers: { 'x-admin-key': adminKey } });

  const saveKey = (v) => {
    setAdminKey(v);
    try { sessionStorage.setItem('travoai_admin_key', v); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (adminKey) fetchChunks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchChunks() {
    if (!adminKey) return;
    try {
      const res = await axios.get('/api/admin/chunks', authHeaders());
      if (res.data && res.data.success) {
        setChunks(res.data.chunks || []);
        setTotalCount(res.data.totalPackages || 0);
      }
    } catch (e) {
      setMessage(`⚠️ ${e.response?.data?.error || e.message}`);
    }
  };

  const handleReindex = async () => {
    if (!adminKey) return setMessage('⚠️ Enter the admin key first.');
    setLoading(true);
    setMessage(null);
    try {
      const res = await axios.post('/api/admin/reindex', {}, authHeaders());
      if (res.data && res.data.success) {
        setMessage(`✅ ${res.data.message}`);
        fetchChunks();
      }
    } catch (e) {
      setMessage(`⚠️ Re-indexing failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#0b0f17] text-slate-100 animate-fade-in">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={onBackToHome}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline mb-1 font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to AI Concierge
          </button>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-cyan-400" /> Admin RAG Engine Control Panel
          </h2>
          <p className="text-xs text-slate-400">Manage vector embeddings, brochure ingestion, and inspect Vectra DB index</p>
        </div>

        <button
          onClick={handleReindex}
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Re-Indexing Vector DB...' : 'Refresh & Re-Index Vector DB'}</span>
        </button>
      </div>

      <div className="glass-card p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
        <label className="text-xs text-slate-400 font-semibold shrink-0">Admin key</label>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => saveKey(e.target.value)}
          placeholder="x-admin-key (ADMIN_KEY on the server)"
          className="flex-1 bg-slate-900 text-xs text-slate-100 rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
        />
        <button onClick={fetchChunks} className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700">
          Connect
        </button>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>{message}</span>
        </div>
      )}

      {/* RAG Engine Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
            <Database className="w-4 h-4" /> Total Vector Items
          </div>
          <div className="text-2xl font-extrabold text-white">{totalCount}</div>
          <span className="text-[10px] text-slate-400">Packages & Chunks</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
            <Layers className="w-4 h-4" /> Vector DB Engine
          </div>
          <div className="text-sm font-extrabold text-emerald-300">Vectra Local DB</div>
          <span className="text-[10px] text-slate-400">128-d Cosine Index</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-sky-400 text-xs font-bold">
            <FileText className="w-4 h-4" /> Data Source Path
          </div>
          <div className="text-xs font-mono font-bold text-slate-200 truncate">data/packages/</div>
          <span className="text-[10px] text-slate-400">Recursive JSON Hierarchy</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" /> Hybrid Search
          </div>
          <div className="text-sm font-extrabold text-amber-300">Metadata + Vector</div>
          <span className="text-[10px] text-slate-400">4-Stage Reranking</span>
        </div>
      </div>

      {/* Vector Chunks Preview Table */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" /> Vector Database Chunks & Embeddings Preview
          </h3>
          <span className="text-xs text-slate-400 font-mono">Showing top {chunks.length} items</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] font-mono">
                <th className="p-3">Package ID</th>
                <th className="p-3">Title</th>
                <th className="p-3">Destination</th>
                <th className="p-3">Price</th>
                <th className="p-3">Category</th>
                <th className="p-3">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {chunks.map((item) => (
                <tr key={item.package_id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="p-3 font-mono text-cyan-400 font-bold">{item.package_id}</td>
                  <td className="p-3 font-bold text-white">{item.title}</td>
                  <td className="p-3">{item.destination}</td>
                  <td className="p-3 font-bold text-cyan-300">₹{Number(item.price_inr || item.price || 0).toLocaleString('en-IN')}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                      {item.category || 'General'}
                    </span>
                  </td>
                  <td className="p-3 text-amber-400 font-bold">{item.rating || 4.8}★</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
