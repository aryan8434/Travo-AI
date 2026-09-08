import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

export default function PackageDetail({ packageId, onClose }) {
  const [pkg, setPkg] = useState(null);
  const [question, setQuestion] = useState('What is included in this package?');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const previous = document.activeElement;
    close.current?.focus();
    axios.get(`/api/packages/${encodeURIComponent(packageId)}`, { signal: controller.signal })
      .then(({ data }) => setPkg(data.package)).catch(err => { if (!axios.isCancel(err)) setError('Unable to load this guide. Please try again.'); });
    const escape = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const elements = close.current?.closest('[role="dialog"]')?.querySelectorAll('button, input, a[href]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => { controller.abort(); document.removeEventListener('keydown', escape); previous?.focus(); };
  }, [packageId, onClose]);
  const ask = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { setResult((await axios.post('/api/packages/ask', { query: question, package_id: packageId })).data); }
    catch { setError('Unable to answer right now. Please try again.'); }
    finally { setBusy(false); }
  };
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 p-3 md:p-8 flex justify-center" onClick={onClose}>
    <motion.section initial={{ y: 16 }} animate={{ y: 0 }} role="dialog" aria-modal="true" aria-labelledby="package-heading" onClick={e => e.stopPropagation()} className="w-full max-w-3xl overflow-y-auto rounded-2xl bg-slate-950 border border-slate-700 p-5 md:p-8 space-y-5 text-slate-200">
      <div className="flex justify-between gap-3"><h2 id="package-heading" className="font-bold text-lg">{pkg?.title || 'Travel guide'}</h2><button ref={close} onClick={onClose} aria-label="Close guide" className="p-2 rounded-lg hover:bg-slate-800"><X size={20}/></button></div>
      {error && <p role="alert" className="text-rose-300 text-sm">{error}</p>}
      {!pkg && !error && <div className="shimmer h-32 rounded-xl" />}
      {pkg && <>
        <p className="text-cyan-300 font-semibold">₹{pkg.price_inr.toLocaleString('en-IN')} · {pkg.capacity_people} guests · {pkg.days} days</p>
        <p className="text-xs text-slate-400">Catalogue itinerary. Property availability and supplier confirmation are required before travel.</p>
        <form onSubmit={ask} className="p-4 rounded-xl border border-cyan-900 bg-slate-900 space-y-3">
          <label htmlFor="package-question" className="text-sm font-semibold flex gap-2"><Sparkles size={16}/>Ask about this package</label>
          <input id="package-question" maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} className="w-full p-3 text-sm rounded-lg bg-slate-950 border border-slate-700" />
          <button disabled={busy || !question.trim()} className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg text-sm disabled:opacity-40">{busy ? 'Finding details…' : 'Find an answer'}</button>
          {result && <div className="text-sm leading-relaxed space-y-3" aria-live="polite"><ReactMarkdown>{result.answer}</ReactMarkdown><ol className="text-xs text-cyan-300 list-decimal pl-5">{result.sources.map(s => <li key={s.chunk_id}>{s.title} — {s.section}</li>)}</ol></div>}
        </form>
        {pkg.content_status === 'complete' ? <div className="guide-prose text-sm leading-7"><ReactMarkdown>{pkg.detailed_guide}</ReactMarkdown></div> : <div className="text-sm leading-7"><p className="text-amber-200 mb-3">The full guide is being prepared. You can browse the itinerary and ask about the available package details.</p><p>{pkg.description}</p>{pkg.itinerary?.map(day => <div key={day.day} className="mt-4"><h3 className="font-bold">Day {day.day}: {day.title}</h3><p>{day.description || day.activities?.join(' · ')}</p></div>)}</div>}
      </>}
    </motion.section>
  </motion.div>;
}
