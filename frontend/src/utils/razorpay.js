import axios from 'axios';
import { refreshAccount } from './storage';
let sdk;
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!sdk) sdk = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => { sdk = null; s.remove(); reject(new Error('Could not load checkout')); };
    document.body.appendChild(s);
  });
  return sdk;
}

export async function initializePayment(item, onSuccess, onError) {
  let completed = false;
  const fail = err => {
    if (completed) return;
    completed = true;
    onError?.({ message: err.response?.data?.error || err.message || 'Checkout failed' });
  };
  const success = async data => {
    if (completed) return;
    completed = true;
    await refreshAccount().catch(() => {});
    onSuccess?.(data.booking ? { ...data.booking, remaining_wallet_balance: data.wallet } : data);
  };
  try {
    if (!axios.defaults.headers.common.Authorization) throw new Error('Please sign in to pay');
    const kind = item.package_id === 'WALLET_TOPUP' ? 'wallet' : 'booking';
    const selection = { package_id: item.package_id, quote: item.quote };
    const account = await refreshAccount();
    const price = Number(item.price_inr ?? item.price ?? item.price_per_night_inr);
    if (kind === 'booking' && account.wallet >= price) {
      const { data } = await axios.post('/user/book', { item: selection, requestId: crypto.randomUUID() });
      return success(data);
    }
    await loadRazorpayScript();
    const { data: order } = await axios.post('/api/create-order', { kind, item: selection, amount: price });
    // The key prefix must agree with the mode the server reports (test keys only in test mode).
    const keyPattern = order.mode === 'test' ? /^rzp_test_/ : /^rzp_live_/;
    if (!order.success || !keyPattern.test(order.key_id)) throw new Error('Checkout is unavailable');
    let verifying = false;
    const rzp = new window.Razorpay({
      key: order.key_id, order_id: order.order_id, amount: order.amount, currency: 'INR',
      name: 'TravoAI', description: kind === 'wallet' ? 'Wallet top-up' : item.title || item.name || 'Travel booking',
      theme: { color: '#0ea5e9' },
      handler: async response => {
        verifying = true;
        // A failed network response can be retried without crediting twice.
        sessionStorage.setItem('travo_pending_payment', JSON.stringify(response));
        try {
          const { data } = await axios.post('/api/verify-payment', response);
          if (!data.success) throw new Error('Payment verification failed');
          sessionStorage.removeItem('travo_pending_payment');
          await success(data);
        } catch (err) { fail(err); }
      },
      modal: { ondismiss: () => { if (!verifying) fail(new Error('Payment cancelled')); } },
    });
    rzp.on('payment.failed', response => fail(new Error(response.error?.description || 'Payment failed')));
    rzp.open();
  } catch (err) { fail(err); }
}

export async function recoverPendingPayment() {
  const raw = sessionStorage.getItem('travo_pending_payment');
  if (!raw || !axios.defaults.headers.common.Authorization) return null;
  const { data } = await axios.post('/api/verify-payment', JSON.parse(raw));
  if (data.success) { sessionStorage.removeItem('travo_pending_payment'); await refreshAccount(); }
  return data;
}
