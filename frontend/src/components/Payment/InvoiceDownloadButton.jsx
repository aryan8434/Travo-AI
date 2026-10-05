import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { downloadInvoice } from '../../utils/invoice';

export default function InvoiceDownloadButton({ invoiceNo, label = 'Download invoice PDF', compact = false }) {
  const [state, setState] = useState('idle');
  if (!invoiceNo) return null;

  const handleClick = async () => {
    setState('busy');
    try {
      await downloadInvoice(invoiceNo);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={state === 'busy'}
      title={state === 'error' ? 'Download failed. Sign in and try again.' : undefined}
      className={`${compact ? 'px-3 py-1.5' : 'px-3.5 py-2'} bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all disabled:opacity-60`}
    >
      {state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      <span>{state === 'busy' ? 'Preparing…' : state === 'error' ? 'Retry download' : label}</span>
    </button>
  );
}
