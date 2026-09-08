import React from 'react';
import { IndianRupee } from 'lucide-react';
export default function CurrencyWidget() { return <div className="glass-card p-4 rounded-2xl border border-slate-800"><div className="flex gap-2 text-cyan-300 text-sm font-semibold"><IndianRupee size={16}/>Pay in Indian rupees</div><p className="text-xs text-slate-400 mt-2">All package prices, flight estimates and payments are in INR (₹).</p></div>; }
