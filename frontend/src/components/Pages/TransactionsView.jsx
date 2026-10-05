import React, { useState } from 'react';
import { CreditCard, CheckCircle2, XCircle, Clock, ShieldCheck, ArrowLeft, Search, Download } from 'lucide-react';
import { downloadInvoice } from '../../utils/invoice';

export default function TransactionsView({ transactions, onBackToHome }) {
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTxns = transactions.filter((t) => {
    const matchesFilter = filter === 'ALL' || t.status === filter;
    const matchesSearch =
      !searchTerm ||
      t.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.payment_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

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
            <CreditCard className="w-6 h-6 text-cyan-400" /> Transaction History
          </h2>
          <p className="text-xs text-slate-400">View payment records and verification details for your travel bookings</p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 self-start">
          {['ALL', 'PAID', 'FAILED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filter === st
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st} ({transactions.filter((t) => st === 'ALL' || t.status === st).length})
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by transaction ID, item name, or payment ID..."
          className="w-full bg-slate-900/90 text-xs text-slate-100 placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 border border-slate-700 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Transactions List */}
      {filteredTxns.length === 0 ? (
        <div className="glass-panel p-8 rounded-2xl text-center space-y-3 max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <CreditCard className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Transactions Found</h3>
          <p className="text-xs text-slate-400">No transactions match your criteria.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTxns.map((txn) => {
            const isPaid = txn.status === 'PAID';
            return (
              <div
                key={txn.id}
                className="glass-card rounded-2xl p-4 border border-slate-800 hover:border-cyan-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isPaid
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {isPaid ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{txn.item_name}</h4>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          isPaid
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {txn.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                      <span>Txn ID: <strong className="text-slate-200 font-mono">{txn.id}</strong></span>
                      <span>Payment ID: <strong className="text-cyan-400 font-mono">{txn.payment_id}</strong></span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(txn.date).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Amount Details */}
                <div className="text-left md:text-right border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
                  <div className="text-base font-extrabold text-cyan-400">
                    ₹{Number(txn.nominal_amount ?? txn.actual_price ?? 0).toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {txn.payment_method === 'TravoAI Wallet'
                      ? 'Settled from wallet'
                      : `Gateway charge: ₹${Number(txn.charged_amount ?? 1).toLocaleString('en-IN')}`}
                  </span>
                  {txn.invoice?.invoice_no && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-2 md:justify-end font-mono">
                      Invoice {txn.invoice.invoice_no}
                      <button
                        onClick={() => downloadInvoice(txn.invoice.invoice_no).catch(() => alert('Invoice download failed. Please sign in and try again.'))}
                        className="text-cyan-400 hover:underline font-sans font-semibold flex items-center gap-0.5"
                      >
                        <Download className="w-3 h-3" /> PDF
                      </button>
                    </span>
                  )}
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 md:justify-end mt-0.5">
                    <ShieldCheck className="w-3 h-3" /> {txn.payment_method || 'Razorpay PG'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
