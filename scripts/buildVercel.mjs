import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../frontend/node_modules/vite/dist/node/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
// Build in a separate directory so deployment work never overwrites a local index.
process.env.RAG_READ_ONLY = '0';
process.env.RAG_INDEX_DIR = path.join(root, '.vercel-rag');
const { syncVectraIndex } = await import('../utils/ragEngine.js');
await syncVectraIndex();
// Tailwind/PostCSS resolve their configuration relative to the frontend cwd.
process.chdir(path.join(root, 'frontend'));
await build({ root: path.join(root, 'frontend') });
