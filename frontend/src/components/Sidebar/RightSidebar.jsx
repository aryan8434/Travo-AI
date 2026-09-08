import React from 'react';
import WeatherWidget from './WeatherWidget';
import LocationWidget from './LocationWidget';
import CurrencyWidget from './CurrencyWidget';
import { Calendar, Database, Cpu, ShieldCheck } from 'lucide-react';

export default function RightSidebar({ activeCity, onCityChange }) {
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <aside className="w-80 h-[calc(100vh-65px)] overflow-y-auto glass-panel border-l border-slate-800 p-4 space-y-4 hidden lg:block shrink-0">
      {/* Date & System Status */}
      <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-1.5 font-medium text-slate-300">
          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
          <span>{currentDate}</span>
        </div>
        <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
          ● Vectra DB Active
        </span>
      </div>

      {/* 1. Live Weather Widget */}
      <WeatherWidget city={activeCity || 'Delhi'} />

      {/* 2. Location Detector Widget */}
      <LocationWidget activeCity={activeCity} onCityChange={onCityChange} />

      {/* 3. Live Currency Converter */}
      <CurrencyWidget />

      {/* 4. Vector DB Badge & Architecture Info */}
      <div className="glass-card rounded-2xl p-4 border border-cyan-500/20 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>Vector Database Architecture</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Indexed travel package chunks into vector embeddings using <strong className="text-emerald-400">Vectra Vector Database</strong> for instant semantic search.
        </p>
        <div className="flex items-center justify-between text-[11px] pt-1">
          <span className="text-slate-400">LLM Provider:</span>
          <span className="text-cyan-400 font-mono font-bold">Configured provider</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Vector Engine:</span>
          <span className="text-emerald-400 font-mono font-bold">Vectra DB</span>
        </div>
      </div>
    </aside>
  );
}
