import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.artifacts', 'aws');
fs.mkdirSync(out, { recursive: true });
const files = [];
const skip = /^(node_modules|build|dist|\.git|\.env(?:\..*)?|\.tmp-.*)$/;
function collect(relative) {
  if (relative.split('/').some(part => skip.test(part))) return;
  const full = path.join(root, relative), stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`Release cannot contain symlinks: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(full).sort()) collect(`${relative}/${name}`);
  } else if (stat.isFile()) {
    if (/[\r\n]/.test(relative) || /\.(pem|key|pfx|p12)$/i.test(relative)) throw new Error(`Unexpected sensitive release path: ${relative}`);
    files.push(relative);
  }
}
for (const source of ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'index.js', 'db.js', 'llm.js', 'groqClient.js', 'frontend', 'models', 'routes', 'providers', 'utils', 'data', 'deploy/aws']) collect(source);
const manifest = path.join(out, 'manifest.txt');
fs.writeFileSync(manifest, files.join('\n') + '\n');
const archive = path.join(out, 'release.tar.gz');
execFileSync('tar', ['-czf', archive, '-T', manifest], { cwd: root, stdio: 'pipe' });
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
console.log(JSON.stringify({ archive, sha256, key: `releases/${sha256}.tar.gz`, files: files.length, bytes: fs.statSync(archive).size }));
