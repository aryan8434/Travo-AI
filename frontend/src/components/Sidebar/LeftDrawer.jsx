import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Plane, Package, CreditCard, BookmarkCheck, Wallet, HelpCircle, Info, Settings, X, Compass, Sparkles, ExternalLink, ShieldCheck, Database } from 'lucide-react';
import { backdrop, slideInLeft } from '../../lib/motion';

export default function LeftDrawer({ isOpen, onClose, currentView, setCurrentView }) {
  const menuItems = [
    { id: 'home', label: 'Home (AI Agent)', icon: Home, badge: 'RAG' },
    { id: 'wallet', label: 'TravoAI Wallet', icon: Wallet, badge: 'Pay' },
    { id: 'flights', label: 'Flight Distances', icon: Plane, badge: 'INR' },
    { id: 'packages', label: 'Travel Packages', icon: Package, badge: 'Catalog' },
    { id: 'transactions', label: 'Transaction History', icon: CreditCard, badge: 'Live' },
    { id: 'bookings', label: 'My Bookings', icon: BookmarkCheck, badge: 'Tickets' },
    { id: 'rag', label: 'RAG Explorer', icon: Database, badge: 'Vectors' },
    { id: 'admin', label: 'Admin RAG Panel', icon: Settings, badge: 'Control' },
    { id: 'support', label: 'Help & Support', icon: HelpCircle, badge: '24/7' },
    { id: 'about', label: 'About TravoAI', icon: Info, badge: 'v1.0' },
  ];

  const handleNavClick = (id) => {
    setCurrentView(id);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="relative z-50">
          {/* Backdrop overlay */}
          <motion.div
            variants={backdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Sliding Drawer Panel (YouTube style) */}
          <motion.aside
            variants={slideInLeft}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed left-0 top-0 bottom-0 w-72 overflow-y-auto glass-panel border-r border-slate-800 bg-[#0f172a]/95 text-slate-100 flex flex-col justify-between p-4 shadow-2xl z-50"
          >
        {/* Top Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
                <Compass className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-1">
                  Travo<span className="gradient-text">AI</span>
                </h2>
                <span className="text-[10px] text-slate-400">Navigation Menu</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav Menu Items */}
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/20'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-cyan-400 group-hover:text-cyan-300'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-cyan-400 border border-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Drawer Footer Info */}
        <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" /> Lead Developer
            </div>
            <p className="text-[11px] text-slate-300 font-bold">Mr. Aryan Kumar Raj</p>
            <a href="mailto:arkrraj@gmail.com" className="text-[10px] text-cyan-400 hover:underline block">
              arkrraj@gmail.com
            </a>
            <a
              href="https://www.linkedin.com/in/aryan-kumar-raj-988587b3/"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 pt-1"
            >
              <span>LinkedIn Profile</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <div className="text-[10px] text-center text-slate-500">
            TravoAI v1.0 • Groq + Vectra RAG
          </div>
        </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
