import React, { useState } from 'react';
import { Wallet, PlusCircle, CreditCard, ArrowLeft, ShieldCheck, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { initializePayment } from '../../utils/razorpay';
import { getWalletBalance } from '../../utils/storage';
import InvoiceCard from '../Payment/InvoiceCard';

export default function WalletView({ onBackToHome, onBalanceUpdate }) {
  const [balance, setBalance] = useState(getWalletBalance());
  const [customAmount, setCustomAmount] = useState('2000');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [invoice, setInvoice] = useState(null);

  const presetAmounts = [500, 1000, 2000, 5000, 10000, 50000];

  const handleAddMoney = () => {
    const amount = Math.round(Number(customAmount));
    if (!amount || amount < 1) return;

    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    setInvoice(null);

    const walletItem = {
      title: `TravoAI Wallet Top-Up (₹${amount.toLocaleString('en-IN')})`,
      price: amount,
      package_id: 'WALLET_TOPUP',
    };

    initializePayment(
      walletItem,
      (result) => {
        const newBal = result.wallet;
        setBalance(newBal);
        if (onBalanceUpdate) onBalanceUpdate(newBal);
        setInvoice(result?.invoice || null);
        setSuccessMsg(`🎉 ₹${amount.toLocaleString('en-IN')} credited to your TravoAI Wallet. The full amount was verified by Razorpay.`);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err?.message || 'Wallet top-up failed. Please try again.');
        setLoading(false);
      },
    );
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
            <Wallet className="w-6 h-6 text-cyan-400" /> TravoAI Digital Wallet
          </h2>
          <p className="text-xs text-slate-400">Pay in rupees. Your wallet is credited only after the full payment is verified.</p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-xl">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {invoice && (
        <div className="max-w-lg">
          <InvoiceCard invoice={invoice} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* Current Balance Card */}
        <div className="glass-card rounded-3xl p-6 border border-cyan-500/30 bg-gradient-to-br from-cyan-950/60 via-slate-900 to-blue-950/60 shadow-2xl flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-cyan-400 font-bold tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-cyan-400" /> Available Balance
              </span>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-500/20 font-bold uppercase">
                Active Pass
              </span>
            </div>
            <div className="text-4xl font-extrabold text-white mt-4 tracking-tight">
              ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-400 mt-1">Ready for 1-click flight, bus & hotel bookings</p>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" /> Razorpay Standard Checkout
            </span>
          </div>
        </div>

        {/* Add Money Input Card */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-5">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-cyan-400" /> Add Money to Wallet
          </h3>

          <div className="space-y-3">
            <label className="text-xs text-slate-400 block font-semibold">Enter Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-lg font-bold text-cyan-400">₹</span>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="2000"
                className="w-full bg-slate-900/90 text-white font-extrabold text-xl rounded-2xl pl-9 pr-4 py-3 border border-slate-700 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Quick Preset Chips */}
            <div className="flex flex-wrap gap-2 pt-1">
              {presetAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCustomAmount(amt.toString())}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    customAmount === amt.toString()
                      ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  +₹{amt.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAddMoney}
            disabled={loading || !customAmount || Number(customAmount) < 1}
            className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <CreditCard className="w-4 h-4" />
            <span>{loading ? 'Opening Razorpay…' : `Credit ₹${Number(customAmount || 0).toLocaleString('en-IN')} · pay in full`}</span>
          </button>
          <p className="text-[10px] text-slate-500 text-center">The full selected amount is charged. ₹{Number(customAmount || 0).toLocaleString('en-IN')} is added to your wallet.</p>
        </div>
      </div>
    </div>
  );
}
