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
