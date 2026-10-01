import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { loadAllPackages } from './ragEngine.js';

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function toPaise(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 1_000_000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
    throw httpError(400, 'Amount must be ₹1–₹10,00,000 with at most two decimal places');
  }
  return Math.round(value * 100);
}

// BOOKING_CHARGE_INR caps what confirming a booking collects now (1 makes every
// booking a ₹1 confirmation charge). The booking and receipt still carry the
// full value. Unset or invalid means the full price is charged.
export function bookingCharge(price, cap = process.env.BOOKING_CHARGE_INR) {
  const limit = Number(cap);
  return cap != null && cap !== '' && Number.isFinite(limit) && limit >= 1 ? Math.min(price, limit) : price;
}

function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw httpError(503, 'Checkout is not configured');
  return process.env.JWT_SECRET;
}

function bookingData(item, type) {
  const price = Number(item.price_inr ?? item.price ?? item.price_per_night_inr);
  toPaise(price);
  const name = item.title || item.name
    || (item.airline && `${item.airline} ${item.flight_number || ''}`.trim())
    || (item.operator && `${item.operator} bus`)
    || 'Travel booking';
  return {
    itemId: String(item.package_id || item.id || item.flight_id || item.bus_id || crypto.randomUUID()),
    name: String(name).slice(0, 160),
    type, price,
    location: String(item.destination || item.city || `${item.from} → ${item.to}`).slice(0, 120),
    guests: Number(item.capacity_people) || 1,
    details: item.days
      ? `${item.days} days / ${item.nights} nights`
      : item.estimated
        ? `Estimated fare${item.time ? `, departs ${item.time}` : ''}. Demo booking: no ticket is issued`
        : 'Supplier confirmation pending',
    estimated: item.estimated === true,
  };
}

export function attachQuote(item, type) {
  // A computed estimate is not supplier inventory: it can only be booked while
  // bookings are confirmed with a capped demo charge (BOOKING_CHARGE_INR), and
  // the booking says no ticket is issued. At full price it stays unbookable.
  const cappedCharge = Number.isFinite(bookingCharge(Infinity));
  const bookable = item.estimated
    ? cappedCharge && (type === 'flight' || type === 'bus')
    : type === 'package' || item.booking_enabled === true;
  if (!bookable) return { ...item, bookable: false };
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return item;
  return { ...item, bookable: true, quote: jwt.sign({ ...bookingData(item, type), bookable: true }, secret(), {
    algorithm: 'HS256', expiresIn: '30m', issuer: 'travo-quote', audience: 'travo-checkout',
  }) };
}

// Only catalogue data or a server-signed search quote may determine price.
export function resolveBooking(input = {}) {
  if (typeof input?.package_id === 'string') {
    const item = loadAllPackages().find(p => p.package_id === input.package_id);
    if (!item) throw httpError(404, 'Package not found');
    return bookingData(item, 'package');
  }
  if (typeof input?.quote !== 'string' || input.quote.length > 5000) throw httpError(400, 'A valid search quote or package ID is required');
  try {
    const payload = jwt.verify(input.quote, secret(), { algorithms: ['HS256'], issuer: 'travo-quote', audience: 'travo-checkout' });
    if (payload.bookable !== true) throw httpError(400, 'Supplier booking is not available for this estimate');
    // An estimate quoted under the capped charge must not be charged in full if the cap is removed.
    if (payload.estimated && !Number.isFinite(bookingCharge(Infinity))) throw httpError(400, 'Supplier booking is not available for this estimate');
    const { itemId, name, type, price, location, guests, details, estimated } = payload;
    toPaise(price);
    return { itemId, name, type, price, location, guests, details, estimated: estimated === true };
  } catch {
    throw httpError(400, 'Quote is invalid or expired. Search again for a fresh quote');
  }
}

export function verifySignature(orderId, paymentId, signature, keySecret) {
  if (!/^order_[A-Za-z0-9]+$/.test(orderId || '') || !/^pay_[A-Za-z0-9]+$/.test(paymentId || '') || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) throw httpError(400, 'Invalid payment fields');
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw httpError(400, 'Invalid payment signature');
}

export function verifyCapturedPayment(payment, order) {
  if (!payment || payment.order_id !== order.orderId || payment.status !== 'captured' || payment.captured !== true || payment.currency !== 'INR' || Number(payment.amount) !== order.amountPaise || Number(payment.amount_refunded || 0) !== 0) throw httpError(400, 'Payment must be captured in INR for the exact order amount');
}
