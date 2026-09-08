import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.EMBEDDING_PROVIDER = 'local';
process.env.GROQ_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_API_KEY = '';
process.env.LLM_PROVIDER = 'groq';
process.env.RAG_INDEX_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'travo-test-index-'));
const { app: publicApp } = await import('../index.js');
const { createPaymentRouter } = await import('../routes/payments.js');
const { default: userRoutes } = await import('../routes/user.js');
const { default: User } = await import('../models/User.js');
const { toPaise, resolveBooking, attachQuote } = await import('../utils/checkout.js');
const { loadAllPackages, retrievePackages, syncVectraIndex, vectraIndex, chunkGuide, ingestPackageGuide } = await import('../utils/ragEngine.js');
const { rankChunks } = await import('../utils/retrieval.js');
const { searchChunks } = await import('../utils/ragChunks.js');
const { localEmbedding } = await import('../utils/embeddings.js');
const { parseTravelPreferences } = await import('../utils/travelPreferences.js');
const { buildFlights, haversineKm, resolveAirport, listAirports } = await import('../utils/flightEngine.js');
const keySecret = crypto.randomBytes(32).toString('hex');
const webhookSecret = crypto.randomBytes(32).toString('hex');
const payments = new Map();
const gateway = {
  orders: { create: async data => ({ ...data, id: `order_${crypto.randomBytes(10).toString('hex')}` }) },
  payments: { fetch: async id => payments.get(id) },
};
const app = express();
const paymentRouter = createPaymentRouter({ gateway, keyId: 'rzp_live_fixture', keySecret, webhookSecret });
app.use('/api', (req, res, next) => req.path === '/payments/webhook' ? paymentRouter(req, res, next) : next());
app.use(express.json());
app.use('/api', paymentRouter);
app.use('/user', userRoutes);
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
let mongo, user, token, otherToken;
const bearer = () => `Bearer ${token}`;
const signToken = u => jwt.sign({ userId: String(u._id), username: u.username }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h', issuer: 'travo-auth', audience: 'travo-user' });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  user = await User.create({ username: 'security-test', ledgerVersion: 2, passwordHash: await User.hashPassword('valid-password-123') });
  token = signToken(user);
  otherToken = signToken(await User.create({ username: 'other-user', ledgerVersion: 2, passwordHash: await User.hashPassword('valid-password-456') }));
}, { timeout: 180000 });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

function proof(order, overrides = {}) {
  const paymentId = `pay_${crypto.randomBytes(10).toString('hex')}`;
  payments.set(paymentId, { order_id: order.order_id, amount: order.amount, currency: 'INR', status: 'captured', captured: true, ...overrides });
  return { razorpay_order_id: order.order_id, razorpay_payment_id: paymentId, razorpay_signature: crypto.createHmac('sha256', keySecret).update(`${order.order_id}|${paymentId}`).digest('hex') };
}
async function walletOrder(amount = 10000) {
  return (await request(app).post('/api/create-order').set('Authorization', bearer()).send({ kind: 'wallet', amount }).expect(200)).body;
}

test('money rejects coercion, free, negative, invalid and fractional-paise amounts', () => {
  for (const input of [0, -1, '100', {}, NaN, Infinity, 1.001, 1000001]) assert.throws(() => toPaise(input));
  assert.equal(toPaise(10000), 1000000);
  assert.equal(toPaise(123.45), 12345);
});
test('catalogue prices override client prices; forged and auth JWT quotes are rejected', () => {
  const p = loadAllPackages()[0];
  assert.equal(resolveBooking({ package_id: p.package_id, price: 0 }).price, p.price_inr);
  assert.throws(() => resolveBooking({ price: 0 }));
  assert.throws(() => resolveBooking({ quote: token }));
  const item = attachQuote({ id: 'test-flight', price: 2222, airline: 'Test', from: 'Delhi', to: 'Mumbai', booking_enabled: true }, 'flight');
  assert.equal(resolveBooking(item).price, 2222);
  assert.throws(() => resolveBooking({ quote: item.quote.slice(0, -8) + 'tampered' }));
});
test('payments require authentication and reject simulation signatures', async () => {
  await request(app).post('/api/create-order').send({ kind: 'wallet', amount: 1 }).expect(401);
  for (const order of ['order_sim123', 'order_tmtest_1']) await request(app).post('/api/verify-payment').set('Authorization', bearer()).send({ razorpay_order_id: order, razorpay_payment_id: 'pay_fake', razorpay_signature: 'simulated_signature' }).expect(400);
});
test('test keys fail closed even when a gateway is provided', async () => {
  const disabled = express(); disabled.use(express.json()); disabled.use(createPaymentRouter({ gateway, keyId: 'rzp_test_fixture', keySecret }));
  await request(disabled).post('/create-order').set('Authorization', bearer()).send({ kind: 'wallet', amount: 1 }).expect(503);
});
test('order charge is full INR amount and only its owner can settle', async () => {
  const order = await walletOrder();
  assert.equal(order.amount, 1000000); assert.equal(order.currency, 'INR');
  await request(app).post('/api/verify-payment').set('Authorization', `Bearer ${otherToken}`).send(proof(order)).expect(404);
});
test('uncaptured, partial, refunded and wrong-currency payments do not credit wallets', async () => {
  const order = await walletOrder();
  for (const override of [{ amount: 100 }, { currency: 'USD' }, { status: 'authorized', captured: false }, { amount_refunded: 1 }, { order_id: 'order_wrong' }]) {
    await request(app).post('/api/verify-payment').set('Authorization', bearer()).send(proof(order, override)).expect(400);
  }
  assert.equal((await User.findById(user._id)).wallet, 0);
});
test('concurrent verification and replay credit exactly once, ignoring client amount', async () => {
  const order = await walletOrder(); const payload = { ...proof(order), amount: 999999, nominalAmount: 999999 };
  await Promise.all(Array.from({ length: 8 }, () => request(app).post('/api/verify-payment').set('Authorization', bearer()).send(payload).expect(200)));
  const updated = await User.findById(user._id);
  assert.equal(updated.wallet, 10000);
  assert.equal(updated.walletHistory.filter(h => h.orderId === order.order_id).length, 1);
  await request(app).post('/user/wallet/topup').set('Authorization', bearer()).send({ ...payload, amount: 10000 }).expect(410);
});
test('paid booking is persisted once, uses canonical price and has no fabricated supplier ticket', async () => {
  const p = loadAllPackages()[0];
  const order = (await request(app).post('/api/create-order').set('Authorization', bearer()).send({ kind: 'booking', item: { package_id: p.package_id, price: 1 } }).expect(200)).body;
  assert.equal(order.amount, p.price_inr * 100);
  const payload = proof(order);
  await Promise.all([1, 2].map(() => request(app).post('/api/verify-payment').set('Authorization', bearer()).send(payload).expect(200)));
  const bookings = (await User.findById(user._id)).bookings.filter(b => b.orderId === order.order_id);
  assert.equal(bookings.length, 1); assert.equal(bookings[0].supplier_status, 'pending');
  const cancels = await Promise.all([1, 2].map(() => request(app).post('/user/bookings/cancel').set('Authorization', bearer()).send({ orderId: order.order_id })));
  assert.deepEqual(cancels.map(r => r.status).sort(), [200, 409]);
  assert.equal((await User.findById(user._id)).walletHistory.filter(h => h.orderId === order.order_id && h.type === 'refund').length, 1);
});
test('wallet debits are atomic and replay-safe', async () => {
  await User.updateOne({ _id: user._id }, { $set: { wallet: 10000 } });
  const p = loadAllPackages().find(p => p.price_inr === 10000);
  const body = { item: { package_id: p.package_id, price: 0 }, requestId: crypto.randomUUID() };
  await Promise.all([1, 2, 3].map(() => request(app).post('/user/book').set('Authorization', bearer()).send(body).expect(200)));
  assert.equal((await User.findById(user._id)).wallet, 0);
  await request(app).post('/user/book').set('Authorization', bearer()).send({ ...body, requestId: crypto.randomUUID() }).expect(400);
});
test('new accounts start with zero wallet credit and object credentials are rejected', async () => {
  await request(publicApp).post('/auth/signup').send({ username: { $ne: null }, password: {} }).expect(400);
  const res = await request(publicApp).post('/auth/signup').send({ username: 'new-customer', password: 'a-good-password-123' }).expect(200);
  assert.equal(res.body.user.walletBalance, 0);
  await request(publicApp).get('/api/chat/user-history').expect(401);
});
test('137+ catalogue skeletons, INR spectrum and one valid full guide', () => {
  const pkgs = loadAllPackages();
  assert.ok(pkgs.length > 100);
  assert.equal(new Set(pkgs.map(p => p.package_id)).size, pkgs.length);
  assert.ok(pkgs.every(p => p.price_inr >= 10000 && p.price_inr <= 500000));
  assert.deepEqual([...new Set(pkgs.map(p => p.budget_tier))].sort(), ['economical', 'luxury', 'premium']);
  const sample = pkgs.find(p => p.package_id === 'PKG-GOA-PRE');
  assert.ok(sample.word_count >= 2000 && sample.word_count <= 2500);
  const chunks = chunkGuide(sample.detailed_guide);
  assert.ok(chunks.length >= 6);
  assert.ok(chunks.every(c => c.text.split(/\s+/).length <= 350));
  assert.equal(chunks[0].text.split(/\s+/).slice(-60).join(' '), chunks[1].text.split(/\s+/).slice(0, 60).join(' '));
});
test('RAG force sync replaces records and never duplicates them', async () => {
  await syncVectraIndex({ force: true }); const initial = await vectraIndex.listItems();
  await syncVectraIndex({ force: true }); const second = await vectraIndex.listItems();
  assert.equal(second.length, initial.length);
  assert.equal(new Set(second.map(i => i.metadata.chunk_id)).size, second.length);
});
test('RAG budget, tier, location, category and capacity constraints cannot be bypassed by vectors', async () => {
  const result = await retrievePackages('luxury Maldives beach', { city: 'Goa', budgetMax: 50000, budgetTier: 'economical', people: 2 }, 20);
  assert.ok(result.matches.length > 0);
  assert.ok(result.matches.every(p => /goa/i.test(p.destination) && p.price_inr <= 50000 && p.budget_tier === 'economical' && p.capacity_people >= 2));
  for (const filters of [{ budgetMax: 1 }, { city: 'Atlantis' }, { category: 'nonexistent-category' }, { people: 999 }]) assert.equal((await retrievePackages('Goa', filters)).matches.length, 0);
});
test('Gemini outage uses matching local query/document spaces', async () => {
  const text = 'Goa beaches seafood and Portuguese heritage';
  const { scores } = await rankChunks([
    { id: 'mixed', vector: Array(768).fill(0), metadata: { text, embedding_model: 'gemini-embedding-001' } },
    { id: 'offline', vector: localEmbedding(text), metadata: { text, embedding_model: 'local-hash-v2' } },
  ], text, { hybrid: false });
  for (const score of scores) {
    assert.ok(score.score > 0.99); assert.equal(score.model, 'local-hash-v2');
  }
});
test('chunk filters run before top-K and question answers cite the selected package', async () => {
  const result = await searchChunks('What meals are included?', { packageId: 'PKG-GOA-PRE', topK: 3 });
  assert.equal(result.chunks.length, 3); assert.ok(result.chunks.every(c => c.package_id === 'PKG-GOA-PRE'));
  const res = await request(publicApp).post('/api/packages/ask').send({ query: 'What food is included?', package_id: 'PKG-GOA-PRE' }).expect(200);
  assert.match(res.body.answer, /\[1\]/);
  assert.match(res.body.answer, /breakfast/i);
  assert.ok(res.body.sources.every(s => s.package_id === 'PKG-GOA-PRE'));
  await assert.rejects(ingestPackageGuide('PKG-GOA-PRE', 'too short'), /2000/);
});
test('catalogue pagination is compact and malformed inputs are rejected', async () => {
  const one = (await request(publicApp).get('/api/packages?page=1').expect(200)).body;
  const two = (await request(publicApp).get('/api/packages?page=2').expect(200)).body;
  assert.equal(one.packages.length, 24); assert.equal(two.packages.length, 24);
  assert.ok(!one.packages.some(p => 'detailed_guide' in p));
  assert.ok(!two.packages.some(p => one.packages.some(q => q.package_id === p.package_id)));
  await request(publicApp).get('/api/packages?budgetMax=abc').expect(400);
  await request(publicApp).get('/api/packages?tier=unknown').expect(400);
});
test('Indian airport routes use Haversine and exactly ₹2.00–₹2.50/km', () => {
  const km = haversineKm(resolveAirport('DEL'), resolveAirport('BOM'));
  assert.ok(km > 1100 && km < 1200);
  assert.ok(listAirports().length >= 50);
  assert.equal(resolveAirport('d'), null);
  assert.equal(buildFlights('Delhi', 'DEL').ok, false);
  assert.equal(buildFlights('Atlantis', 'Mumbai').ok, false);
  const route = buildFlights('Delhi', 'Mumbai', 100);
  assert.ok(route.flights.every(f => f.rate_per_km >= 2 && f.rate_per_km <= 2.5 && f.price === Math.round(f.distance_km * f.rate_per_km) && f.currency === 'INR' && f.estimated));
});
test('rupee shorthand and ranges are parsed without relaxing the maximum', () => {
  assert.equal(parseTravelPreferences('under Rs 2.5 lakh').budgetMax, 250000);
  assert.deepEqual(parseTravelPreferences('between 40k and 1 lakh'), { budgetMin: 40000, budgetMax: 100000 });
  assert.equal(parseTravelPreferences('₹10,000').budgetMax, 10000);
  assert.equal(parseTravelPreferences('premium under 90k').budgetTier, 'premium');
});

test('legacy ledger balances cannot be spent or credited', async () => {
  const legacy = await User.create({ username: 'legacy-account', passwordHash: await User.hashPassword('old-password-123'), wallet: 1000000 });
  const legacyToken = signToken(legacy);
  await request(app).post('/api/create-order').set('Authorization', `Bearer ${legacyToken}`).send({ kind: 'wallet', amount: 100 }).expect(409);
  await request(app).post('/user/book').set('Authorization', `Bearer ${legacyToken}`).send({ item: { package_id: loadAllPackages()[0].package_id }, requestId: crypto.randomUUID() }).expect(409);
});
test('natural-language catalogue constraints intersect numeric UI filters', async () => {
  const result = await retrievePackages('Goa economical under 30k for 2 people', { budgetMax: 500000 }, 50);
  assert.ok(result.matches.length > 0);
  assert.ok(result.matches.every(p => p.price_inr <= 30000 && p.budget_tier === 'economical' && /goa/i.test(p.destination)));
  assert.equal((await retrievePackages('Goa for 99 people', {})).matches.length, 0);
});
test('guest history is isolated from caller session IDs; package follow-ups keep destination', async () => {
  const alice = request.agent(publicApp), bob = request.agent(publicApp);
  const first = await alice.post('/chat').send({ sessionId: { $ne: null }, message: 'Goa packages under 100k' }).expect(200);
  assert.ok(first.headers['set-cookie'][0].includes('HttpOnly'));
  assert.ok(first.body.results.length > 0);
  const follow = await alice.post('/chat').send({ sessionId: 'shared', message: 'premium' }).expect(200);
  assert.ok(follow.body.results.length > 0);
  assert.ok(follow.body.results.every(p => /goa/i.test(p.destination) && p.budget_tier === 'premium' && p.price_inr <= 100000));
  const separate = await bob.post('/chat').send({ sessionId: 'shared', message: 'premium' }).expect(200);
  assert.equal(separate.body.intent, 'general');
});

test('hotel prices require an explicit INR currency; USD is never guessed from amount', async () => {
  const { default: axios } = await import('axios');
  const { fetchRealHotels } = await import('../providers/hotelProvider.js');
  const original = axios.get, key = process.env.MAKCORPS_API_TOKEN;
  process.env.MAKCORPS_API_TOKEN = 'fixture-only';
  try {
    axios.get = async () => ({ data: [
      [{ hotelName: 'USD hotel' }, [{ currency: 'USD', price1: 800 }]],
      [{ hotelName: 'Unknown currency' }, [{ price1: 200 }]],
      [{ hotelName: 'INR hotel' }, [{ currency: 'INR', price1: 6000 }]],
    ] });
    const hotels = await fetchRealHotels('Delhi');
    assert.deepEqual(hotels.map(h => [h.name, h.price, h.currency]), [['INR hotel', 6000, 'INR']]);
  } finally { axios.get = original; if (key === undefined) delete process.env.MAKCORPS_API_TOKEN; else process.env.MAKCORPS_API_TOKEN = key; }
});

function webhook(event, signature) {
  const body = JSON.stringify(event);
  return request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature || crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')).send(body);
}
test('signed captured webhooks settle without a browser and race safely with verification', async () => {
  const order = await walletOrder(2000), payload = proof(order);
  const before = (await User.findById(user._id)).wallet;
  const event = { event: 'payment.captured', payload: { payment: { entity: { id: payload.razorpay_payment_id, order_id: order.order_id } } } };
  await Promise.all([webhook(event).expect(200), webhook(event).expect(200), request(app).post('/api/verify-payment').set('Authorization', bearer()).send(payload).expect(200)]);
  const updated = await User.findById(user._id);
  assert.equal(updated.wallet, before + 2000);
  assert.equal(updated.walletHistory.filter(h => h.orderId === order.order_id).length, 1);
});
test('webhooks reject forged signatures and verify captured status with the provider', async () => {
  const order = await walletOrder(100), payload = proof(order, { captured: false, status: 'authorized' });
  const event = { event: 'payment.captured', payload: { payment: { entity: { id: payload.razorpay_payment_id, order_id: order.order_id, captured: true } } } };
  await webhook(event, '0'.repeat(64)).expect(400);
  await webhook(event).expect(400);
  await request(publicApp).post('/api/payments/webhook').set('Content-Type', 'application/json').send('{}').expect(503);
});
test('refund notifications freeze further spending without inventing a balance reversal', async () => {
  const order = await walletOrder(100), payload = proof(order);
  await request(app).post('/api/verify-payment').set('Authorization', bearer()).send(payload).expect(200);
  const before = (await User.findById(user._id)).wallet;
  await webhook({ event: 'refund.processed', payload: { refund: { entity: { payment_id: payload.razorpay_payment_id } } } }).expect(200);
  assert.equal((await User.findById(user._id)).wallet, before);
  await request(app).post('/user/book').set('Authorization', bearer()).send({ item: { package_id: loadAllPackages()[0].package_id }, requestId: crypto.randomUUID() }).expect(409);
  await request(app).post('/api/create-order').set('Authorization', bearer()).send({ kind: 'wallet', amount: 100 }).expect(409);
  await User.updateOne({ _id: user._id }, { $set: { paymentReviewRequired: false } });
});
test('production configuration fails closed and health checks expose no secrets', async () => {
  const { productionIssues, assertProductionConfig } = await import('../utils/productionConfig.js');
  assert.throws(() => assertProductionConfig({ NODE_ENV: 'production' }), /Production configuration incomplete/);
  const config = { JWT_SECRET: 'a'.repeat(48), MONGO_URI: 'mongodb://database/travo', CORS_ORIGINS: 'https://travel.example.com', RAZORPAY_KEY_ID: 'rzp_live_fixture', RAZORPAY_KEY_SECRET: 'fixture-secret', RAZORPAY_WEBHOOK_SECRET: 'b'.repeat(48) };
  assert.deepEqual(productionIssues(config), []);
  assert.ok(productionIssues({ ...config, CORS_ORIGINS: 'http://localhost:5000' }).length);
  assert.ok(productionIssues({ ...config, RAZORPAY_KEY_ID: 'rzp_test_fixture' }).length);
  assert.deepEqual((await request(publicApp).get('/health/ready').expect(200)).body, { status: 'ready' });
});
test('estimates and unconnected supplier rates cannot become payable quotes', () => {
  for (const item of [buildFlights('Delhi', 'Mumbai', 1).flights[0], { id: 'hotel-rate', price: 5000 }]) {
    const quoted = attachQuote(item, 'flight');
    assert.equal(quoted.bookable, false);
    assert.equal(quoted.quote, undefined);
    assert.throws(() => resolveBooking({ ...quoted, bookable: true }));
  }
});
