import crypto from 'node:crypto';
const inr = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Payment receipt only. Tax treatment needs supplier billing information.
export function buildInvoice({ nominalAmount, chargedAmount = nominalAmount, description = 'Travel booking', kind = 'booking', paymentId = '', orderId = '', customer, gateway = 'Razorpay', testMode = process.env.RAZORPAY_MODE === 'test' }) {
  const amount = Math.round(nominalAmount * 100) / 100;
  const charged = Math.round(chargedAmount * 100) / 100;
  const balance = Math.round((amount - charged) * 100) / 100;
  const now = new Date();
  const testNote = testMode ? ' Issued in Razorpay test mode: no real money was charged.' : '';
  const paidNote = balance > 0
    ? `${inr(charged)} paid via ${gateway} as a booking confirmation charge. Booking value ${inr(amount)}; the remaining ${inr(balance)} is not collected online.`
    : `${inr(amount)} paid in full via ${gateway}.`;
  return {
    test_mode: testMode,
    invoice_no: `TRV/${crypto.createHash('sha256').update(orderId).digest('hex').slice(0, 16).toUpperCase()}`,
    issued_at: now.toISOString(), issued_at_display: now.toLocaleString('en-IN'),
    customer, kind, currency: 'INR', gateway,
    line_items: [{ label: description, amount }],
    nominal_amount: amount, nominal_amount_display: inr(amount),
    amount_charged: charged, amount_charged_display: inr(charged),
    balance_amount: balance, balance_amount_display: inr(balance),
    settlement_note: `${paidNote} This is a payment receipt; supplier confirmation and any tax invoice are separate.${testNote}`,
    payment_id: paymentId, order_id: orderId,
  };
}
