import express from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import { paymentMode, paymentProductionIssues } from '../utils/productionConfig.js';
import User from '../models/User.js';
import auth from '../utils/auth.js';
import { buildInvoice } from '../utils/invoice.js';
import { httpError, toPaise, resolveBooking, verifySignature, verifyCapturedPayment, bookingCharge } from '../utils/checkout.js';

export function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'Account storage is unavailable. Please try again later.' });
  next();
}

export async function requireVerifiedLedger(req, res, next) {
  const user = await User.findById(req.userId).select('ledgerVersion paymentReviewRequired');
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.ledgerVersion !== 2) return res.status(409).json({ error: 'This legacy wallet needs payment reconciliation before it can be used. Contact support.' });
  if (user.paymentReviewRequired) return res.status(409).json({ error: 'This account needs payment review before further financial activity. Contact support.' });
  next();
}

export function createBookingRecord(booking, orderId, invoice, paymentId = '', chargedAmount = booking.price) {
  return {
    ...booking, orderId, booking_id: `BK-${orderId}`, item_name: booking.name,
    item_type: booking.type, destination: booking.location, actual_price: booking.price,
    nominal_amount: booking.price, charged_amount: chargedAmount,
    status: 'success', supplier_status: 'pending', pnr: 'Pending supplier confirmation',
    ticket_number: 'Pending supplier confirmation',
    booking_date: new Date().toISOString(), createdAt: new Date(),
    payment_id: paymentId, txn_id: orderId, invoice,
  };
}

export async function settlePayment({ orderId, paymentId, userId, client }) {
    const user = await User.findOne({ ...(userId ? { _id: userId } : {}), 'paymentOrders.orderId': orderId }).select('paymentOrders wallet username ledgerVersion paymentReviewRequired');
    const order = user?.paymentOrders.find(o => o.orderId === orderId);
    if (!order) throw httpError(404, 'Order not found');
    if (user.ledgerVersion !== 2 || user.paymentReviewRequired) throw httpError(409, 'Account requires payment reconciliation');
    if (order.status === 'fulfilled') {
      if (order.paymentId !== paymentId) throw httpError(409, 'Order already paid with a different payment');
      return { ...order.result, wallet: user.wallet, replayed: true };
    }
    let payment;
    try { payment = await client.payments.fetch(paymentId); }
    catch { throw httpError(502, 'Payment verification is unavailable. Retry with the same order'); }
    // Auto-capture is Razorpay's default, but an account set to manual capture
    // leaves the payment authorized; capture exactly this order's amount.
    if (payment?.status === 'authorized' && payment.order_id === order.orderId && Number(payment.amount) === order.amountPaise && payment.currency === 'INR') {
      try { payment = await client.payments.capture(paymentId, order.amountPaise, 'INR'); }
      catch {
        try { payment = await client.payments.fetch(paymentId); } catch { throw httpError(502, 'Payment capture is unavailable. Retry with the same order'); }
      }
    }
    verifyCapturedPayment(payment, order);
    const amount = order.amountPaise / 100;
    // A booking may be confirmed for less than its value (BOOKING_CHARGE_INR); the receipt keeps both.
    const invoice = buildInvoice({ nominalAmount: order.kind === 'booking' ? order.booking.price : amount, chargedAmount: amount, description: order.booking?.name || 'Wallet top-up', kind: order.kind, paymentId, orderId, customer: user.username });
    const booking = order.kind === 'booking' ? createBookingRecord(order.booking, orderId, invoice, paymentId, amount) : null;
    const result = { success: true, payment_id: paymentId, order_id: orderId, amount: order.amountPaise, currency: 'INR', credited: order.kind === 'wallet' ? amount : 0, invoice, booking };
    const update = {
      $set: { 'paymentOrders.$.status': 'fulfilled', 'paymentOrders.$.paymentId': paymentId, 'paymentOrders.$.result': result },
      $push: { walletHistory: { type: order.kind === 'wallet' ? 'topup' : 'gateway_payment', amount, orderId, paymentId, description: order.booking?.name || 'Wallet top-up', invoice, createdAt: new Date() } },
    };
    if (order.kind === 'wallet') update.$inc = { wallet: amount };
    else update.$push.bookings = booking;
    const updated = await User.findOneAndUpdate({ _id: user._id, ledgerVersion: 2, paymentReviewRequired: { $ne: true }, paymentOrders: { $elemMatch: { orderId, status: 'pending' } } }, update, { returnDocument: 'after' }).select('wallet');
    if (!updated) {
      const completed = await User.findById(user._id).select('paymentOrders wallet');
      const settled = completed?.paymentOrders.find(o => o.orderId === orderId);
      if (settled?.status === 'fulfilled' && settled.paymentId === paymentId) return { ...settled.result, wallet: completed.wallet, replayed: true };
      throw httpError(409, 'Order state changed. Please retry');
    }
    return { ...result, wallet: updated.wallet };
}

export function createPaymentRouter({ gateway, keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET, webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET, mode = process.env.RAZORPAY_MODE, bookingChargeInr = process.env.BOOKING_CHARGE_INR } = {}) {
  const router = express.Router();
  const settings = { RAZORPAY_MODE: mode, RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_WEBHOOK_SECRET: webhookSecret, JWT_SECRET: process.env.JWT_SECRET };
  const configured = paymentProductionIssues(settings).length === 0;
  const checkoutMode = paymentMode(settings);
  const client = gateway || (configured ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null);
  // Mounted before express.json(): verification must use the untouched request bytes.
  router.post('/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), requireDatabase, async (req, res) => {
    if (!configured || !webhookSecret || webhookSecret.length < 32) throw httpError(503, 'Webhook is not configured');
    const signature = req.get('x-razorpay-signature');
    if (!Buffer.isBuffer(req.body) || !/^[a-f0-9]{64}$/i.test(signature || '')) throw httpError(400, 'Invalid webhook signature');
    const expected = crypto.createHmac('sha256', webhookSecret).update(req.body).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw httpError(400, 'Invalid webhook signature');
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { throw httpError(400, 'Invalid webhook body'); }
    if (['refund.processed', 'payment.dispute.created'].includes(event.event)) {
      const paymentId = event.payload?.refund?.entity?.payment_id || event.payload?.dispute?.entity?.payment_id;
      if (!/^pay_[A-Za-z0-9]+$/.test(paymentId || '')) throw httpError(400, 'Invalid payment reference');
      let payment;
      try { payment = await client.payments.fetch(paymentId); } catch { throw httpError(502, 'Gateway lookup unavailable'); }
      if (!payment?.order_id) throw httpError(400, 'Payment order is missing');
      // Do not guess a reversal amount after money may have been spent. Freeze and reconcile.
      await User.updateOne({ 'paymentOrders.orderId': payment.order_id }, { $set: { paymentReviewRequired: true } });
      return res.json({ received: true });
    }
    if (!['payment.captured', 'order.paid'].includes(event.event)) return res.json({ received: true, ignored: true });
    const payment = event.payload?.payment?.entity;
    if (!/^pay_[A-Za-z0-9]+$/.test(payment?.id || '') || !/^order_[A-Za-z0-9]+$/.test(payment?.order_id || '')) throw httpError(400, 'Invalid payment reference');
    try { await settlePayment({ orderId: payment.order_id, paymentId: payment.id, client }); }
    catch (err) {
      if (err.status === 404) return res.json({ received: true, ignored: true });
      if (err.status === 409) return res.status(409).json({ error: 'Payment requires reconciliation' });
      throw err;
    }
    res.json({ received: true });
  });
  // Public: lets the site show test-card instructions before checkout.
  router.get('/payments/config', (req, res) => {
    const cap = bookingCharge(Infinity, bookingChargeInr);
    res.json({ enabled: configured, mode: checkoutMode, booking_charge: Number.isFinite(cap) ? cap : null });
  });
  router.use(auth, requireDatabase, requireVerifiedLedger);
  router.use((req, res, next) => configured ? next() : res.status(503).json({ error: 'Payments are not configured on this server' }));

  router.post('/create-order', async (req, res) => {
    const kind = req.body?.kind;
    if (!['wallet', 'booking'].includes(kind)) throw httpError(400, 'kind must be wallet or booking');
    const booking = kind === 'booking' ? resolveBooking(req.body?.item) : null;
    const amountPaise = toPaise(kind === 'wallet' ? req.body?.amount : bookingCharge(booking.price, bookingChargeInr));
    const user = await User.findById(req.userId).select('paymentOrders');
    if (!user) throw httpError(404, 'User not found');
    if (user.paymentOrders.filter(o => o.status === 'pending' && new Date(o.createdAt) > new Date(Date.now() - 86400000)).length >= 30) throw httpError(429, 'Too many pending orders');
    let order;
    try { order = await client.orders.create({ amount: amountPaise, currency: 'INR', receipt: crypto.randomUUID(), notes: { user_id: req.userId, kind } }); }
    catch { throw httpError(502, 'Could not create a payment order'); }
    if (!/^order_[A-Za-z0-9]+$/.test(order.id) || Number(order.amount) !== amountPaise || order.currency !== 'INR') throw httpError(502, 'Unexpected gateway order');
    await User.updateOne({ _id: req.userId }, { $push: { paymentOrders: { orderId: order.id, amountPaise, kind, booking, status: 'pending', createdAt: new Date() } } });
    res.json({ success: true, order_id: order.id, amount: amountPaise, currency: 'INR', key_id: keyId, mode: checkoutMode });
  });

  router.post('/verify-payment', async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    verifySignature(orderId, paymentId, signature, keySecret);
    res.json(await settlePayment({ orderId, paymentId, userId: req.userId, client }));
  });
  return router;
}
