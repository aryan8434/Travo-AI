import express from 'express';
import crypto from 'node:crypto';
import User from '../models/User.js';
import auth from '../utils/auth.js';
import { buildInvoice } from '../utils/invoice.js';
import { resolveBooking, httpError } from '../utils/checkout.js';
import { createBookingRecord, requireDatabase, requireVerifiedLedger } from './payments.js';

const router = express.Router();
router.use(auth, requireDatabase);
router.get('/me', async (req, res) => {
  const user = await User.findById(req.userId).select('username wallet bookings walletHistory');
  if (!user) throw httpError(404, 'User not found');
  res.json(user);
});

router.post('/book', requireVerifiedLedger, async (req, res) => {
  const { requestId } = req.body || {};
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) throw httpError(400, 'A UUID requestId is required');
  const priced = resolveBooking(req.body?.item);
  const orderId = `wallet_${requestId}`;
  const invoice = buildInvoice({ nominalAmount: priced.price, description: priced.name, orderId, customer: req.username, gateway: 'TravoAI Wallet' });
  const booking = { ...createBookingRecord(priced, orderId, invoice), paid_via_wallet: true };
  const updated = await User.findOneAndUpdate({ _id: req.userId, ledgerVersion: 2, paymentReviewRequired: { $ne: true }, wallet: { $gte: priced.price }, 'bookings.orderId': { $ne: orderId } }, {
    $inc: { wallet: -priced.price },
    $push: { bookings: booking, walletHistory: { type: 'booking_charge', amount: -priced.price, description: priced.name, orderId, invoice, createdAt: new Date() } },
  }, { returnDocument: 'after' }).select('wallet');
  if (!updated) {
    const existing = await User.findById(req.userId).select('wallet bookings');
    const previous = existing?.bookings.find(b => b.orderId === orderId);
    if (previous) return res.json({ success: true, booking: previous, wallet: existing.wallet, replayed: true });
    throw httpError(400, 'Insufficient wallet balance');
  }
  res.json({ success: true, booking, wallet: updated.wallet });
});

// Legacy endpoint cannot independently mint credit or reuse a payment.
router.post('/wallet/topup', (req, res) => res.status(410).json({ error: 'Use create-order and verify-payment; verification credits the wallet exactly once' }));

router.post('/bookings/cancel', requireVerifiedLedger, async (req, res) => {
  const { orderId } = req.body || {};
  if (typeof orderId !== 'string' || orderId.length > 100) throw httpError(400, 'Valid orderId is required');
  const user = await User.findById(req.userId).select('bookings');
  const booking = user?.bookings.find(b => b.orderId === orderId);
  if (!booking) throw httpError(404, 'Booking not found');
  if (booking.status !== 'success') throw httpError(409, 'Only successful bookings can be cancelled');
  const hours = (Date.now() - new Date(booking.createdAt).getTime()) / 3_600_000;
  const feePercent = hours <= 4 ? 20 : hours <= 12 ? 60 : 100;
  const feeAmount = Math.round(booking.price * feePercent) / 100;
  const refundAmount = Math.round((booking.price - feeAmount) * 100) / 100;
  const cancellation = { cancelledAt: new Date(), feePercent, feeAmount, refundAmount };
  const updated = await User.findOneAndUpdate({ _id: req.userId, ledgerVersion: 2, paymentReviewRequired: { $ne: true }, bookings: { $elemMatch: { orderId, status: 'success' } } }, {
    $set: { 'bookings.$.status': 'cancelled', 'bookings.$.cancellation': cancellation },
    $inc: { wallet: refundAmount },
    $push: { walletHistory: { type: 'refund', amount: refundAmount, description: `Cancellation refund for ${booking.name}`, orderId, createdAt: new Date() } },
  }, { returnDocument: 'after' }).select('wallet bookings walletHistory');
  if (!updated) throw httpError(409, 'Booking was already cancelled');
  res.json({ success: true, ...updated.toObject(), booking: { ...booking, status: 'cancelled', cancellation }, refundAmount, feePercent, feeAmount });
});
export default router;
