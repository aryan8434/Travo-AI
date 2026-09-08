import 'dotenv/config';
import fs from 'node:fs';
import { ingestPackageGuide } from '../utils/ragEngine.js';
const [id, file] = process.argv.slice(2);
if (!id || !file) {
  console.error('Usage: npm run ingest:guide -- PACKAGE_ID guide.md');
  process.exitCode = 1;
} else {
  console.log(await ingestPackageGuide(id, fs.readFileSync(file, 'utf8')));
}
