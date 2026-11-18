import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Plane, ArrowLeft } from 'lucide-react';
import { useMotion } from '../../lib/motion';

const todayInIndia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function FlightsView({ onBackToHome }) {
  const [airports, setAirports] = useState([]);
  const [from, setFrom] = useState('DEL');
  const [to, setTo] = useState('BOM');
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { fadeInUp, staggerParent } = useMotion();
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/api/airports', { signal: controller.signal }).then(({ data }) => setAirports(data.airports.sort((a, b) => a.city.localeCompare(b.city)))).catch(err => { if (!axios.isCancel(err)) setError('Unable to load airport cities.'); });
    return () => controller.abort();
  }, []);
  const search = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { setRoute((await axios.get('/api/flights', { params: { from, to, ...(date ? { date } : {}) } })).data); }
    catch (err) { setRoute(null); setError(err.response?.data?.error || 'Unable to calculate this route.'); }
    finally { setBusy(false); }
  };
  const reset = setter => e => { setter(e.target.value); setRoute(null); };
  return <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#0b0f17] text-slate-100">
    <button onClick={onBackToHome} className="text-xs text-cyan-300 flex gap-2 items-center"><ArrowLeft size={14}/>Back to AI Concierge</button>
    <div><h2 className="text-2xl font-bold flex gap-2 items-center"><Plane className="text-cyan-400"/>Flight distances & fares</h2><p className="text-sm text-slate-400 mt-2">Explore {airports.length} Indian airport cities. Pick a date for live airline fares where available; without one, estimates use great-circle distance at ₹2.00–₹2.50 per kilometre.</p></div>
    <form onSubmit={search} className="glass-panel p-5 rounded-2xl grid sm:grid-cols-4 gap-4 border border-slate-800">
      {[['From airport', from, setFrom], ['To airport', to, setTo]].map(([label, value, setter]) => <label key={label} className="text-xs text-slate-400">{label}<select aria-label={label} value={value} onChange={reset(setter)} className="block w-full mt-2 p-3 bg-slate-900 rounded-xl border border-slate-700 text-slate-100">{airports.map(a => <option key={a.iata} value={a.iata}>{a.city} ({a.iata})</option>)}</select></label>)}
      <label className="text-xs text-slate-400">Date (optional)<input type="date" aria-label="Travel date" min={todayInIndia()} value={date} onChange={reset(setDate)} className="block w-full mt-2 p-3 bg-slate-900 rounded-xl border border-slate-700 text-slate-100"/></label>
      <button disabled={busy || !airports.length || from === to} className="self-end p-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-semibold text-sm disabled:opacity-40">{busy ? 'Searching…' : date ? 'Find fares' : 'Estimate fare'}</button>
    </form>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {route && <motion.div variants={fadeInUp} initial="hidden" animate="show" className="rounded-2xl border border-cyan-700/40 p-5 bg-cyan-950/20" aria-live="polite">
      <p className="text-2xl font-bold text-cyan-300">{route.distanceKm.toLocaleString('en-IN')} km</p>
      <p className="text-sm text-slate-400 mt-2">{route.from.city} → {route.to.city}</p>
      {route.live
        ? <>
            {route.flights.length
              ? <div className="grid sm:grid-cols-3 gap-3 mt-4">{route.flights.slice(0, 6).map(f => <div key={f.id} className="bg-slate-900 p-4 rounded-xl"><p className="text-xl font-bold">₹{f.price.toLocaleString('en-IN')}</p><p className="text-xs text-slate-300 mt-1">{f.airline} {f.flight_number}</p><p className="text-xs text-slate-400 mt-1">{f.time} → {f.arrival_time} · {f.duration} · {f.stops ? `${f.stops} stop${f.stops > 1 ? 's' : ''}` : 'non-stop'}</p></div>)}</div>
              : <p className="text-sm text-slate-300 mt-4">No fares in INR were found for this date{route.skipped_non_inr ? ' (the provider only returned other currencies)' : ''}.</p>}
            <p className="text-xs text-emerald-300 mt-4">{route.test_mode ? 'Test-mode data from Duffel: these are not real prices.' : `Live airline fares, checked ${new Date(route.fetched_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST. Fares change; book with the airline.`}</p>
          </>
        : <>
            <div className="grid sm:grid-cols-3 gap-3 mt-4">{route.flights.slice(0, 3).map(f => <div key={f.id} className="bg-slate-900 p-4 rounded-xl"><p className="text-xl font-bold">₹{f.price.toLocaleString('en-IN')}</p><p className="text-xs text-slate-400 mt-1">{f.distance_km} km × ₹{f.rate_per_km.toFixed(2)}/km</p></div>)}</div>
            {route.live_error && <p className="text-xs text-slate-300 mt-4">{route.live_error}, so these are estimates.</p>}
            <p className="text-xs text-amber-200 mt-4">Illustrative estimates. Actual routes, schedules, taxes and availability need airline confirmation.</p>
          </>}
    </motion.div>}
    <label className="block text-sm text-slate-400">Find an airport city<input value={query} onChange={e => setQuery(e.target.value)} placeholder="City, airport or IATA code" className="block w-full mt-2 p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100"/></label>
    <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{airports.filter(a => `${a.city} ${a.name} ${a.iata}`.toLowerCase().includes(query.toLowerCase())).map(a => <motion.div key={a.iata} variants={fadeInUp} className="glass-card p-4 rounded-xl border border-slate-800"><div className="flex justify-between"><strong>{a.city}</strong><span className="font-mono text-cyan-300">{a.iata}</span></div><p className="text-xs text-slate-400 mt-2">{a.name}</p></motion.div>)}</motion.div>
  </div>;
}
