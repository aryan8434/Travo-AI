import axios from 'axios';
let account = { wallet: 0, bookings: [], walletHistory: [] };
let owner = '';
export function clearAccount() { account = { wallet: 0, bookings: [], walletHistory: [] }; owner = ''; }
export function getWalletBalance() { return account.wallet || 0; }
export function getStoredBookings() {
  return (account.bookings || []).map(b => ({ ...b, status: b.status === 'success' ? 'CONFIRMED' : 'FAILED' }));
}
export function getStoredTransactions() {
  return (account.walletHistory || []).filter(h => h.invoice).map(h => ({
    id: `${h.orderId}-${h.type}`, item_name: h.description, item_type: h.type,
    // The receipt holds the item's full value; the ledger amount is what was paid.
    actual_price: h.invoice.nominal_amount ?? Math.abs(h.amount), charged_amount: Math.abs(h.amount), status: 'PAID',
    date: h.createdAt, payment_id: h.paymentId || '', order_id: h.orderId,
    payment_method: h.invoice.gateway, invoice: h.invoice,
  }));
}
export async function refreshAccount() {
  const token = axios.defaults.headers.common.Authorization;
  if (!token) { clearAccount(); return account; }
  if (owner !== token) { clearAccount(); owner = token; }
  const { data } = await axios.get('/user/me');
  if (axios.defaults.headers.common.Authorization === token) account = data;
  return account;
}
