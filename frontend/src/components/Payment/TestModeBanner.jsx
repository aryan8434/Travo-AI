import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FlaskConical } from 'lucide-react';

// Shown only while the server runs Razorpay in test mode, so visitors know how
// to complete a demo checkout without real money. Details from Razorpay's
// test card and test UPI documentation.
export default function TestModeBanner() {
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    axios.get('/api/payments/config', { signal: controller.signal })
      .then(({ data }) => setTestMode(data?.enabled === true && data?.mode === 'test'))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!testMode) return null;
  return (
    <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-[11px] text-amber-200 flex items-center justify-center gap-2 text-center">
      <FlaskConical className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      <span>
        <strong className="text-amber-300">Demo payments</strong> (Razorpay test mode, no real money): card{' '}
        <span className="font-mono">4100 2800 0000 1007</span>, any future expiry, any CVV and OTP, or UPI{' '}
        <span className="font-mono">success@razorpay</span>
      </span>
    </div>
  );
}
