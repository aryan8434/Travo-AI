import fs from 'node:fs';
import path from 'node:path';
import { loadAllPackages } from '../utils/ragEngine.js';
const output = process.argv[2] || path.resolve('content-jobs.jsonl');
const packages = loadAllPackages().filter(p => p.content_status === 'skeleton');
const jobs = packages.map(p => {
  const { detailed_guide, ...context } = p;
  return JSON.stringify({ package_id: p.package_id, min_words: 2000, max_words: 2500,
    prompt: 'Expand this holiday guide into 2000–2500 words including headings. Preserve every ## heading in order. The section budgets total 2300 prose words. Use only facts in CONTEXT; do not invent prices, availability, inclusions, permits or safety guarantees. All currency is INR (₹). Output Markdown only. Do not change structured fields.\n\nCONTEXT:\n' + JSON.stringify(context) + '\n\nSKELETON:\n' + detailed_guide,
    ingest_command: `npm run ingest:guide -- ${p.package_id} output.md`,
  });
});
fs.writeFileSync(output, jobs.join('\n') + '\n');
console.log(`${jobs.length} writing jobs exported to ${output}`);
