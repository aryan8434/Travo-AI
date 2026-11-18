import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

test('deployed RAG searches a prebuilt index without writes and rejects mutations', { timeout: 120000 }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'travo-vercel-test-'));
  const env = { ...process.env, RAG_INDEX_DIR: directory, RAG_READ_ONLY: '0', EMBEDDING_PROVIDER: 'local', GROQ_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' };
  const run = (source, overrides = {}) => {
    // Vercel's runtime does not allow CommonJS dependencies to require ESM.
    const child = spawnSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', source], { env: { ...env, ...overrides }, encoding: 'utf8', timeout: 90000 });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
  };
  run('const {syncVectraIndex}=await import("./utils/ragEngine.js"); await syncVectraIndex();');
  const snapshot = () => Object.fromEntries(fs.readdirSync(directory).map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')]));
  const before = snapshot();
  run(`
    import assert from 'node:assert/strict';
    const {retrievePackages,syncVectraIndex,startPackageWatcher,ingestPackageGuide,ingestPdfText}=await import('./utils/ragEngine.js');
    const {searchChunks}=await import('./utils/ragChunks.js');
    const {flushEmbedCache}=await import('./utils/embeddings.js');
    assert.ok((await retrievePackages('Goa beach', {city:'Goa'})).matches.length);
    await searchChunks('Goa beach');
    flushEmbedCache();
    startPackageWatcher()();
    await assert.rejects(syncVectraIndex({force:true}), /read-only/);
    await assert.rejects(ingestPackageGuide('id','text'), /read-only/);
    await assert.rejects(ingestPdfText('guide.pdf','text'), /read-only/);
  `, { RAG_READ_ONLY: '1' });
  assert.deepEqual(snapshot(), before);
  run(`
    import assert from 'node:assert/strict';
    const {syncVectraIndex}=await import('./utils/ragEngine.js');
    await assert.rejects(syncVectraIndex(), /missing its prebuilt/);
  `, { RAG_READ_ONLY: '1', RAG_INDEX_DIR: path.join(directory, 'missing') });
  assert.equal(fs.existsSync(path.join(directory, 'missing')), false);
});

test('a Gemini outage degrades the deploy index to uniform local vectors instead of failing the build', async () => {
  const { buildIndex } = await import('../utils/indexBuild.js');
  const saved = process.env.EMBEDDING_PROVIDER, warnings = [], calls = [];
  try {
    process.env.EMBEDDING_PROVIDER = '';
    const sync = async (options) => { calls.push({ ...options, provider: process.env.EMBEDDING_PROVIDER }); if (!options) throw new Error('Embedding provider HTTP 429'); return 'built'; };
    assert.equal(await buildIndex(sync, { requireGemini: false, warn: m => warnings.push(m) }), 'built');
    assert.deepEqual(calls, [{ provider: '' }, { force: true, provider: 'local' }], 'second attempt is a forced local rebuild');
    assert.match(warnings[0], /HTTP 429.*uniform local-vector index/);
    // Opt-in strictness: the same outage fails the build.
    process.env.EMBEDDING_PROVIDER = '';
    await assert.rejects(buildIndex(async () => { throw new Error('Embedding provider HTTP 429'); }, { requireGemini: true }), /HTTP 429/);
    assert.equal(process.env.EMBEDDING_PROVIDER, '', 'strict mode does not switch providers');
    // A healthy provider is built once, untouched.
    calls.length = 0;
    assert.equal(await buildIndex(async (o) => { calls.push(o); return 'ok'; }, { requireGemini: false }), 'ok');
    assert.equal(calls.length, 1);
  } finally { if (saved === undefined) delete process.env.EMBEDDING_PROVIDER; else process.env.EMBEDDING_PROVIDER = saved; }
});

test('the Vercel entry sets production and read-only defaults before the app loads', () => {
  const run = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./utils/vercelRuntime.js'); console.log(process.env.NODE_ENV + ' ' + process.env.RAG_READ_ONLY)"], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' }).stdout.trim();
  assert.equal(run({ VERCEL: '1' }), 'production 1');
  // The build opts out of read-only mode; local runs are untouched.
  assert.equal(run({ VERCEL: '1', RAG_READ_ONLY: '0' }), 'production 0');
  assert.equal(run({}), 'undefined undefined');
});
