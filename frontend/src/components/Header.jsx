import React from 'react';
import { motion } from 'framer-motion';
import { Menu, Compass, MapPin, Database, Cpu, Wallet, UserCheck, LogIn, LogOut, Layers } from 'lucide-react';

export default function Header({
  onToggleDrawer,
  activeCity,
  selectedCategory,
  setSelectedCategory,
  walletBalance = 0,
  onOpenWallet,
  currentUser,
  onOpenAuthModal,
  onLogout,
  onOpenRagModal,
}) {
  const categories = [
    { id: 'all', label: '🤖 AI Agent' },
    { id: 'package', label: '🌴 Tour Packages' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800 px-4 py-3 flex items-center justify-between">
      {/* Top Left Hamburger + Brand Logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleDrawer}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all shadow-md group"
          title="Open Navigation Menu"
        >
          <Menu className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Compass className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                Travo<span className="gradient-text">AI</span>
              </h1>
              <span className="hidden md:flex text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-400" /> Groq AI
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Database className="w-3 h-3 text-emerald-400" /> Vectra DB
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-slate-400">Your holiday, planned around you</p>
          </div>
        </div>
      </div>

      {/* Category Pills & Flashy RAG Architecture Button */}
      <div className="hidden sm:flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`relative px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 ${
                selectedCategory === cat.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {selectedCategory === cat.id && (
                <motion.span
                  layoutId="header-cat-pill"
                  className="absolute inset-0 rounded-lg bg-cyan-500 shadow-md shadow-cyan-500/25"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Flashy Red-Green Blinking RAG Architecture Button (0.5s interval) */}
        <button
          onClick={onOpenRagModal}
          className="px-3.5 py-1.5 text-xs font-extrabold rounded-xl text-white animate-flashy-btn transform transition-transform hover:scale-105 flex items-center gap-1.5 cursor-pointer border shadow-lg"
          title="Click to view RAG Pipeline Architecture & System Design"
        >
          <Layers className="w-4 h-4 animate-bounce" />
          <span>⚡ RAG Architecture</span>
        </button>
      </div>

      {/* Top Right User Auth & Wallet Controls */}
      <div className="flex items-center gap-2">
        {currentUser ? (
          <div className="flex items-center gap-2">
            {/* Logged in User Greeting Badge */}
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold shadow-md">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Hello {currentUser.username}</span>
            </div>

            {/* Wallet Button */}
            <button
              onClick={onOpenWallet}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-950 via-slate-900 to-blue-950 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 transition-all font-extrabold shadow-md hover:shadow-cyan-500/10"
              title="Open TravoAI Wallet"
            >
              <Wallet className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>₹{walletBalance.toLocaleString('en-IN')}</span>
            </button>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 transition-all"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold shadow-lg shadow-cyan-500/20 transition-all"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Login / Sign Up</span>
          </button>
        )}

        {/* Location Badge */}
        <div className="hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          <span>{activeCity || 'Detecting City...'}</span>
        </div>
      </div>
    </header>
  );
}
