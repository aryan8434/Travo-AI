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
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
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
test('live checkout requires a separate valid webhook secret before creating orders', async () => {
  const failGateway = { orders: { create: () => assert.fail('Disabled checkout called the gateway') } };
  for (const secret of ['', 'short', process.env.JWT_SECRET]) {
    const disabled = express();
    disabled.use(express.json());
    disabled.use(createPaymentRouter({ gateway: failGateway, keyId: 'rzp_live_fixture', keySecret, webhookSecret: secret }));
    await request(disabled).post('/create-order').set('Authorization', bearer()).send({ kind: 'wallet', amount: 1 }).expect(503);
  }
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
test('Vercel travel APIs work without payments but still reject invalid core configuration', async () => {
  const { default: handler } = await import('../api/index.js');
  const names = ['NODE_ENV', 'MONGO_URI', 'CORS_ORIGINS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { NODE_ENV: 'production', MONGO_URI: mongo.getUri(), CORS_ORIGINS: 'https://travel.example.com', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '' });
  const deployed = express(); deployed.use(handler);
  try {
    await request(deployed).get('/health/ready').expect(200);
    const catalog = await request(deployed).get('/api/packages').expect(200);
    assert.ok(catalog.body.packages.length > 0);
    assert.match(catalog.headers['content-security-policy'], /script-src[^;]*https:\/\/cdn\.razorpay\.com/);
    const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    assert.match(config.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value, /script-src[^;]*https:\/\/cdn\.razorpay\.com/);
    process.env.MONGO_URI = '';
    assert.deepEqual((await request(deployed).get('/api/packages').expect(503)).body, { error: 'Service unavailable. Please try again.' });
  } finally {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
});
test('estimates and unconnected supplier rates cannot become payable quotes', () => {
  for (const item of [buildFlights('Delhi', 'Mumbai', 1).flights[0], { id: 'hotel-rate', price: 5000 }]) {
    const quoted = attachQuote(item, 'flight');
    assert.equal(quoted.bookable, false);
    assert.equal(quoted.quote, undefined);
    assert.throws(() => resolveBooking({ ...quoted, bookable: true }));
  }
});

test('session slots observe changes made by another backend instance', async () => {
  const { saveSlots, getSlots } = await import('../utils/sessionContext.js');
  const { default: ChatSession } = await import('../models/ChatSession.js');
  const sessionId = crypto.randomUUID();
  await saveSlots(sessionId, { intent: 'flight', from: 'Delhi' });
  await ChatSession.updateOne({ sessionId }, { $set: { context: { intent: 'flight', from: 'Mumbai' } } });
  assert.equal((await getSlots(sessionId)).from, 'Mumbai');
});

test('guest cookies survive another instance but forged signatures are replaced', async () => {
  const instances = [];
  for (const name of ['first', 'second']) {
    const { chatIdentity } = await import(`../utils/chatIdentity.js?instance=${name}`);
    const instance = express();
    instance.get('/', chatIdentity, (req, res) => res.json({ id: req.chatSessionId }));
    instances.push(instance);
  }
  const first = await request(instances[0]).get('/').expect(200);
  const cookie = first.headers['set-cookie'][0].split(';')[0];
  const second = await request(instances[1]).get('/').set('Cookie', cookie).expect(200);
  assert.equal(second.body.id, first.body.id);
  assert.equal(second.headers['set-cookie'], undefined);
  const forged = cookie.slice(0, -64) + '0'.repeat(64);
  const rejected = await request(instances[1]).get('/').set('Cookie', forged).expect(200);
  assert.notEqual(rejected.body.id, first.body.id);
});

test('rate limits count concurrent requests across instances and isolate namespaces', async () => {
  const { MongoRateLimitStore } = await import('../utils/mongoRateLimitStore.js');
  const prefix = crypto.randomUUID();
  const stores = [new MongoRateLimitStore(prefix), new MongoRateLimitStore(prefix), new MongoRateLimitStore(`${prefix}-other`)];
  for (const store of stores) store.init({ windowMs: 60000 });
  const hits = await Promise.all(Array.from({ length: 12 }, (_, i) => stores[i % 2].increment('client')));
  assert.deepEqual(hits.map(hit => hit.totalHits).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal((await stores[2].increment('client')).totalHits, 1);
  await stores[0].resetKey('client');
  assert.equal((await stores[1].increment('client')).totalHits, 1);
});

test('weather lookups pin known Indian places and name icon-only conditions', async () => {
  const { weatherQuery, conditionText } = await import('../providers/weatherProvider.js');
  assert.equal(weatherQuery('Delhi'), 'Delhi, India');
  assert.equal(weatherQuery('Manali'), 'Manali, Himachal Pradesh, India');
  assert.equal(weatherQuery('Dubai'), 'Dubai');
  assert.equal(weatherQuery('Paris'), 'Paris');
  assert.equal(weatherQuery('Delhi, Ontario'), 'Delhi, Ontario');
  assert.equal(conditionText({ icon: '//cdn.weatherapi.com/weather/64x64/night/113.png' }), 'Clear');
  assert.equal(conditionText({ icon: '//cdn.weatherapi.com/weather/64x64/day/353.png' }), 'Light rain shower');
  assert.equal(conditionText({ text: 'Mist', icon: '//cdn.weatherapi.com/weather/64x64/day/113.png' }), 'Mist');
  assert.equal(conditionText({}), 'Unknown Condition');
});

test('hotel search ranks catalogue stays via RAG without inventing nightly rates', async () => {
  const { searchHotels } = await import('../utils/hotelSearch.js');
  const goa = await searchHotels('hotels in goa', { city: 'Goa' });
  assert.equal(goa.location, 'Goa');
  assert.ok(goa.hotels.length > 0 && goa.hotels.every(h => h.city === 'Goa' && h.source === 'catalogue'));
  for (const h of goa.hotels) {
    const pkg = loadAllPackages().find(p => p.package_id === h.package.package_id);
    assert.equal(h.name, pkg.hotel_name);
    assert.equal(h.package.price_inr, pkg.price_inr);
    // Card detection keys off these; a stay must never render as a package or claim a room rate.
    assert.equal(h.package_id, undefined);
    assert.equal(h.price, undefined);
    assert.equal(attachQuote(h, 'hotel').bookable, false);
  }
  assert.equal(new Set(goa.hotels.map(h => h.name)).size, goa.hotels.length);

  const cheap = await searchHotels('hotels in jaipur under 3000', { city: 'Jaipur', budget: 3000 });
  assert.equal(cheap.withinBudget, false);
  assert.match(cheap.text, /None come in under/);
  const perNight = cheap.hotels.map(h => h.package_price_per_night);
  assert.deepEqual(perNight, [...perNight].sort((a, b) => a - b));

  const roomy = await searchHotels('hotels in goa', { city: 'Goa', budget: 30000 });
  assert.equal(roomy.withinBudget, true);
  assert.ok(roomy.hotels.every(h => h.package_price_per_night <= 30000));

  assert.equal((await searchHotels('which hotel in andaman is on the beach?', { city: 'Andaman' })).location, 'Andaman');
  // Without a cited LLM answer, a question keeps the listing instead of dumping raw passages.
  assert.match((await searchHotels('which hotel in goa has a spa?', { city: 'Goa' })).text, /^🏨 Stays in \*\*Goa\*\*/);
});

test('hotel search suggests the nearest covered destinations and admits gaps', async () => {
  const { searchHotels } = await import('../utils/hotelSearch.js');
  const delhi = await searchHotels('hotels in delhi', { city: 'Delhi' });
  assert.equal(delhi.location, null);
  assert.equal(delhi.nearby, true);
  const distances = delhi.hotels.map(h => h.distance_km);
  assert.ok(distances.length > 0 && distances.every(d => d <= 800));
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  assert.equal(new Set(delhi.hotels.map(h => h.city)).size, delhi.hotels.length);
  assert.match(delhi.text, /No catalogue stays in \*\*Delhi\*\*/);

  const paris = await searchHotels('hotels in paris', { city: 'Paris' });
  assert.deepEqual(paris.hotels, []);
  assert.match(paris.text, /don't have hotel stays for \*\*Paris\*\*/);
});

test('hotel API and chat return catalogue stays', async () => {
  await request(publicApp).get('/api/hotels').expect(400);
  await request(publicApp).get('/api/hotels').query({ city: 'Goa', budget: -5 }).expect(400);
  const api = await request(publicApp).get('/api/hotels').query({ city: 'Goa' }).expect(200);
  assert.ok(api.body.hotels.length > 0 && api.body.hotels.every(h => h.bookable === false && h.package?.package_id));

  const chat = await request(publicApp).post('/chat').send({ message: 'hotels in goa' }).expect(200);
  assert.equal(chat.body.type, 'hotel');
  assert.ok(chat.body.results.length > 0 && chat.body.results.every(h => h.city === 'Goa'));
});

const sendErrors = (err, req, res, next) => res.status(err.status || 500).json({ error: err.message });
const binary = (res, done) => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))); };

test('test mode takes only rzp_test_ keys, needs no webhook and labels receipts', async () => {
  const { productionIssues } = await import('../utils/productionConfig.js');
  const base = { JWT_SECRET: 'a'.repeat(48), MONGO_URI: 'mongodb://database/travo', CORS_ORIGINS: 'https://travel.example.com', RAZORPAY_MODE: 'test', RAZORPAY_KEY_SECRET: 'fixture-secret' };
  assert.deepEqual(productionIssues({ ...base, RAZORPAY_KEY_ID: 'rzp_test_fixture' }), []);
  assert.ok(productionIssues({ ...base, RAZORPAY_KEY_ID: 'rzp_live_fixture' }).length);
  assert.ok(productionIssues({ ...base, RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_WEBHOOK_SECRET: 'short' }).length);

  const testApp = express();
  testApp.use(express.json());
  testApp.use(createPaymentRouter({ gateway, keyId: 'rzp_test_fixture', keySecret, mode: 'test' }));
  testApp.use(sendErrors);
  assert.deepEqual((await request(testApp).get('/payments/config').expect(200)).body, { enabled: true, mode: 'test' });
  assert.deepEqual((await request(app).get('/api/payments/config').expect(200)).body, { enabled: true, mode: 'live' });
  await request(testApp).post('/payments/webhook').send({}).expect(503);

  const order = (await request(testApp).post('/create-order').set('Authorization', bearer()).send({ kind: 'wallet', amount: 500 }).expect(200)).body;
  assert.equal(order.mode, 'test');
  assert.equal(order.key_id, 'rzp_test_fixture');
  process.env.RAZORPAY_MODE = 'test';
  try {
    const settled = (await request(testApp).post('/verify-payment').set('Authorization', bearer()).send(proof(order)).expect(200)).body;
    assert.equal(settled.invoice.test_mode, true);
    assert.match(settled.invoice.settlement_note, /test mode: no real money/);
  } finally { delete process.env.RAZORPAY_MODE; }
});

test('an authorized payment is captured for its exact order before crediting', async () => {
  const captured = [];
  const captureGateway = { ...gateway, payments: {
    fetch: async id => payments.get(id),
    capture: async (id, amount, currency) => { captured.push([id, amount, currency]); payments.set(id, { ...payments.get(id), status: 'captured', captured: true }); return payments.get(id); },
  } };
  const captureApp = express();
  captureApp.use(express.json());
  captureApp.use(createPaymentRouter({ gateway: captureGateway, keyId: 'rzp_live_fixture', keySecret, webhookSecret }));
  captureApp.use(sendErrors);
  const before = (await User.findById(user._id)).wallet;
  const order = (await request(captureApp).post('/create-order').set('Authorization', bearer()).send({ kind: 'wallet', amount: 700 }).expect(200)).body;
  const payload = proof(order, { status: 'authorized', captured: false });
  await request(captureApp).post('/verify-payment').set('Authorization', bearer()).send(payload).expect(200);
  assert.deepEqual(captured, [[payload.razorpay_payment_id, 70000, 'INR']]);
  assert.equal((await User.findById(user._id)).wallet, before + 700);

  const mismatched = (await request(captureApp).post('/create-order').set('Authorization', bearer()).send({ kind: 'wallet', amount: 700 }).expect(200)).body;
  await request(captureApp).post('/verify-payment').set('Authorization', bearer()).send(proof(mismatched, { status: 'authorized', captured: false, amount: 100 })).expect(400);
  assert.equal(captured.length, 1);
});

test('invoice PDFs render from stored receipts for their owner only', async () => {
  const order = await walletOrder(1500);
  const { invoice } = (await request(app).post('/api/verify-payment').set('Authorization', bearer()).send(proof(order)).expect(200)).body;
  const pdf = await request(app).get('/user/invoice.pdf').query({ no: invoice.invoice_no }).set('Authorization', bearer()).buffer(true).parse(binary).expect(200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.match(pdf.headers['content-disposition'], /attachment; filename="TravoAI-TRV-[A-F0-9]{16}\.pdf"/);
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  await request(app).get('/user/invoice.pdf').query({ no: invoice.invoice_no }).set('Authorization', `Bearer ${otherToken}`).expect(404);
  await request(app).get('/user/invoice.pdf').query({ no: '../../etc/passwd' }).set('Authorization', bearer()).expect(400);
  await request(app).get('/user/invoice.pdf').query({ no: invoice.invoice_no }).expect(401);
});

test('bus search returns labelled, unbookable distance estimates', async () => {
  const { buildBuses } = await import('../utils/busEngine.js');
  const route = buildBuses('Delhi', 'Jaipur');
  assert.equal(route.ok, true);
  assert.ok(route.roadKm > 200 && route.roadKm < 400);
  assert.ok(route.buses.length > 0 && route.buses.every(b => b.estimated === true && b.price === Math.max(100, Math.round(route.roadKm * b.rate_per_km))));
  assert.ok(route.buses.every(b => attachQuote(b, 'bus').bookable === false));
  assert.deepEqual(buildBuses('Delhi', 'Jaipur'), route, 'estimates are deterministic');
  assert.match(buildBuses('Delhi', 'Chennai').error, /too long for a bus/);
  assert.match(buildBuses('Delhi', 'Atlantis').error, /can't place "Atlantis"/);

  await request(publicApp).get('/api/buses').query({ from: 'Delhi' }).expect(400);
  const api = await request(publicApp).get('/api/buses').query({ from: 'Delhi', to: 'Jaipur' }).expect(200);
  assert.ok(api.body.buses.every(b => b.bookable === false));
  const chat = await request(publicApp).post('/chat').send({ message: 'buses from delhi to jaipur' }).expect(200);
  assert.equal(chat.body.intent, 'bus');
  assert.ok(chat.body.results.length > 0 && chat.body.results.every(b => b.bookable === false));
});

test('a service named mid-flow switches flows even when the model answers "general"', async () => {
  const { namedServiceIntent, mergeIntent } = await import('../utils/sessionContext.js');
  const previous = { intent: 'bus', from: 'Delhi' };
  assert.equal(mergeIntent(previous, namedServiceIntent('flights', { intent: 'general' }, previous)).intent, 'flight');
  assert.equal(namedServiceIntent('flights', { intent: 'bus' }, previous).intent, 'flight');
  assert.equal(namedServiceIntent('hotels', { intent: 'general' }, previous).intent, 'hotel_search');
  // No carried flow, the same flow, two services, or a different specific model intent: unchanged.
  assert.equal(namedServiceIntent('how long should I stay in Goa?', { intent: 'general' }, {}).intent, 'general');
  assert.equal(namedServiceIntent('buses', { intent: 'general' }, previous).intent, 'general');
  assert.equal(namedServiceIntent('weather for my flight', { intent: 'general' }, previous).intent, 'general');
  assert.equal(namedServiceIntent('hotel near goa beach', { intent: 'trip_plan' }, previous).intent, 'trip_plan');
});
