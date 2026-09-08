import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Search, Star, Calendar, Users, MapPin, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';
import { initializePayment } from '../../utils/razorpay';
import { useMotion } from '../../lib/motion';
const PackageDetail = lazy(() => import('./PackageDetail'));

const TIERS = [
  { key: 'ALL', label: 'All tiers' },
  { key: 'economical', label: 'Economical' },
  { key: 'premium', label: 'Premium' },
  { key: 'luxury', label: 'Luxury' },
];
const CATEGORIES = ['ALL', 'Beach & Wellness', 'Mountains & Adventure', 'Heritage & Culture', 'Wildlife & Safari', 'Hills & Tea Country', 'Backwaters & Nature'];
const MIN_BUDGET = 10000;
const MAX_BUDGET = 500000;

export default function PackagesView({ onBackToHome, onBookingComplete, onBookingError, currentUser, onOpenAuthModal }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('ALL');
  const [tier, setTier] = useState('ALL');
  const [maxBudget, setMaxBudget] = useState(MAX_BUDGET);
  const { fadeInUp, staggerParent } = useMotion();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const [error, setError] = useState('');


  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const params = new URLSearchParams({ query: searchTerm, category, tier, budgetMax: String(maxBudget), page: String(page) });
        const { data } = await axios.get('/api/packages?' + params, { signal: controller.signal });
        setPackages(data.packages || []); setTotal(data.total || 0); setHasMore(data.hasMore);
      } catch (err) { if (!axios.isCancel(err)) { setPackages([]); setError('Unable to load packages. Please try again.'); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [searchTerm, category, tier, maxBudget, page]);

  const visible = useMemo(
    () => packages.filter((p) => (p.price_inr || p.price || 0) <= maxBudget),
    [packages, maxBudget],
  );

  const handleBookPackage = (pkg) => {
    if (!currentUser) return onOpenAuthModal?.();
    initializePayment(pkg, (b) => onBookingComplete?.(b), (e) => onBookingError?.(e));
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#0b0f17] text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button onClick={onBackToHome} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline mb-1 font-semibold">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to AI Concierge
          </button>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-cyan-400" /> RAG Travel Packages Catalog
          </h2>
          <p className="text-xs text-slate-400">Economical, premium &amp; luxury holidays from ₹10,000 to ₹5,00,000 — find a trip that fits you</p>
        </div>
        <span className="text-xs font-bold text-emerald-400 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5 self-start">
          <Sparkles className="w-4 h-4" /> {total} packages
        </span>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Search destination, activity, vibe…"
              className="w-full bg-slate-900/90 text-xs text-slate-100 placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 border border-slate-700 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 whitespace-nowrap">Max ₹{maxBudget.toLocaleString('en-IN')}</span>
            <input
              type="range"
              min={MIN_BUDGET}
              max={MAX_BUDGET}
              step={5000}
              value={maxBudget}
              onChange={(e) => { setMaxBudget(Number(e.target.value)); setPage(1); }}
              className="w-full accent-cyan-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTier(t.key); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                tier === t.key ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="w-px bg-slate-800 mx-1" />
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => { setCategory(c); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                category === c ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {c === 'ALL' ? 'All categories' : c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card rounded-2xl h-64 border border-slate-800 shimmer" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-panel p-8 rounded-2xl text-center space-y-3 max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No packages match your filters</h3>
          <p className="text-xs text-slate-400">Raise the budget or clear the tier/category filters.</p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          variants={staggerParent}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence mode="popLayout">
            {visible.map((pkg) => (
              <motion.div
                key={pkg.package_id}
                layout
                variants={fadeInUp}
                exit="exit"
                whileHover={{ y: -5 }}
                className="glass-card rounded-2xl overflow-hidden border border-cyan-500/20 hover:border-cyan-500/50 transition-colors duration-300 shadow-xl flex flex-col justify-between group"
              >
                <div>
                  <div className="bg-gradient-to-r from-cyan-950/80 via-slate-900 to-blue-950/80 p-4 border-b border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {pkg.budget_tier || pkg.package_id}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-amber-400 font-bold">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{pkg.rating || 4.8}★</span>
                      </div>
                    </div>
                    <h3 className="text-base font-extrabold text-white group-hover:text-cyan-300 transition-colors">{pkg.title}</h3>
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-cyan-400" />
                      <span>{pkg.destination}, {pkg.state || pkg.country || 'India'}</span>
                    </div>
                    {pkg.match_reason && (
                      <p className="text-[11px] text-emerald-400 font-medium pt-1">💡 {pkg.match_reason}</p>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 text-slate-300">
                      <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-cyan-400" /><span>{pkg.days || 3}D / {pkg.nights || 2}N</span></div>
                      <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-cyan-400" /><span>{pkg.capacity_people || 2} Guests</span></div>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">{pkg.description}</p>
                  </div>
                </div>

                <div className="p-4 pt-0 border-t border-slate-800/60 flex items-center justify-between mt-2">
                  <div>
                    <div className="text-lg font-extrabold text-cyan-400">₹{Number(pkg.price_inr || pkg.price || 0).toLocaleString('en-IN')}</div>
                    <span className="text-[10px] text-slate-400">total price</span>
                  </div>
                  <button onClick={() => setDetailId(pkg.package_id)} className="text-xs text-cyan-300 hover:underline px-2 py-2">View guide</button>
                  <button
                    onClick={() => handleBookPackage(pkg)}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all"
                  >
                    <span>Book Package</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
      {error && <p role="alert" className="text-rose-300 text-sm">{error}</p>}
      <div className="flex justify-center items-center gap-4 text-sm">
        <button disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30">Previous</button>
        <span>Page {page}</span>
        <button disabled={!hasMore || loading} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30">Next</button>
      </div>
      <Suspense fallback={null}><AnimatePresence>{detailId && <PackageDetail packageId={detailId} onClose={closeDetail}/>}</AnimatePresence></Suspense>
    </div>
  );
}
