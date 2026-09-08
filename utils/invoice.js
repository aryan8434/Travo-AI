import crypto from 'node:crypto';
const inr = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Payment receipt only. Tax treatment needs supplier billing information.
export function buildInvoice({ nominalAmount, description = 'Travel booking', kind = 'booking', paymentId = '', orderId = '', customer, gateway = 'Razorpay' }) {
  const amount = Math.round(nominalAmount * 100) / 100;
  const now = new Date();
  return {
    invoice_no: `TRV/${crypto.createHash('sha256').update(orderId).digest('hex').slice(0, 16).toUpperCase()}`,
    issued_at: now.toISOString(), issued_at_display: now.toLocaleString('en-IN'),
    customer, kind, currency: 'INR', gateway,
    line_items: [{ label: description, amount }],
    nominal_amount: amount, nominal_amount_display: inr(amount),
    amount_charged: amount, amount_charged_display: inr(amount),
    settlement_note: `${inr(amount)} paid in full via ${gateway}. This is a payment receipt; supplier confirmation and any tax invoice are separate.`,
    payment_id: paymentId, order_id: orderId,
  };
}
