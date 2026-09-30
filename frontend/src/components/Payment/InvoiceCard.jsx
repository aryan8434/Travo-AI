import React, { useState } from 'react';
import { FileText, ShieldCheck, Download, Loader2 } from 'lucide-react';
import { downloadInvoice } from '../../utils/invoice';

const rupees = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Renders a TravoAI payment receipt. The invoice is for the full item value; the
 * gateway verified the full INR amount.
 */
export default function InvoiceCard({ invoice, compact = false }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  if (!invoice) return null;

  const {
    invoice_no,
    issued_at_display,
    customer,
    line_items = [],
    nominal_amount,
    amount_charged,
    settlement_note,
    payment_id,
    gateway = 'Razorpay',
    test_mode,
  } = invoice;

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadInvoice(invoice_no);
    } catch {
      setDownloadError('Download failed. Sign in and try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-cyan-500/20 overflow-hidden text-slate-200">
      <div className="bg-gradient-to-r from-cyan-950/70 via-slate-900 to-blue-950/70 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <div>
            <h4 className="text-sm font-extrabold text-white leading-tight">Payment Receipt</h4>
            <span className="text-[10px] text-cyan-400 font-mono">{invoice_no}</span>
            {test_mode && (
              <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Test mode
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-[10px] text-slate-400">
          <div>{issued_at_display}</div>
          <div>Billed to {customer || 'Guest'}</div>
        </div>
      </div>

      <div className="p-4 space-y-2 text-xs">
        {line_items.map((li, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-slate-400">{li.label}</span>
            <span className="font-mono text-slate-200">{rupees(li.amount)}</span>
          </div>
        ))}

        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <span className="font-bold text-white">Invoice total</span>
          <span className="font-mono font-extrabold text-cyan-400 text-sm">{rupees(nominal_amount)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Charged via {gateway} now</span>
          <span className="font-mono font-bold text-emerald-400">{rupees(amount_charged)}</span>
        </div>

        {!compact && (
          <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-800 leading-relaxed">
            {settlement_note}
          </p>
        )}
      </div>

      <div className="px-4 py-2.5 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="w-3 h-3" /> {payment_id ? `Razorpay ${payment_id}` : 'Verified'}
        </span>
        {!compact && invoice_no && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1 text-cyan-400 hover:underline font-semibold disabled:opacity-60"
          >
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        )}
      </div>
      {downloadError && <p className="px-4 pb-2.5 text-[10px] text-rose-400">{downloadError}</p>}
    </div>
  );
}
