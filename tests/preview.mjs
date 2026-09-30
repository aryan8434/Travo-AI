// Isolated browser fixture: no real database, API credentials or payment gateway.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.EMBEDDING_PROVIDER = 'local';
for (const name of ['GROQ_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'WEATHER_API_KEY']) process.env[name] = '';
process.env.RAG_INDEX_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'travo-preview-index-'));
process.env.PORT = '5055';
process.env.CORS_ORIGINS = 'http://127.0.0.1:5055,http://localhost:5055';
process.env.HOST = '127.0.0.1';
const db = await MongoMemoryServer.create();
process.env.MONGO_URI = db.getUri();
const { startServer } = await import('../index.js');
const server = await startServer();
process.on('SIGINT', async () => { server.close(); await db.stop(); process.exit(); });
