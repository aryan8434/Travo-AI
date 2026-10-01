import React from 'react';
import { BadgeIndianRupee, FlaskConical } from 'lucide-react';
import { usePaymentConfig } from '../../utils/paymentConfig';

// Tells visitors what checkout will actually take before they book: the ₹1
// confirmation charge, and in Razorpay test mode how to pay without real
// money (details from Razorpay's test card and test UPI documentation).
export default function PaymentBanner() {
  const { enabled, mode, booking_charge: charge } = usePaymentConfig();
  const testMode = mode === 'test';
  if (!enabled || (!charge && !testMode)) return null;

  const Icon = testMode ? FlaskConical : BadgeIndianRupee;
  return (
    <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-[11px] text-amber-200 flex items-center justify-center gap-2 text-center">
      <Icon className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      <span>
        {charge && (
          <>
            <strong className="text-amber-300">Any booking is confirmed with a ₹{charge} payment.</strong> Your receipt shows the full booking value.{' '}
          </>
        )}
        {testMode && (
          <>
            Razorpay test mode, no real money: card <span className="font-mono">4100 2800 0000 1007</span>, any future expiry, any CVV and OTP, or UPI{' '}
            <span className="font-mono">success@razorpay</span>
          </>
        )}
      </span>
    </div>
  );
}
