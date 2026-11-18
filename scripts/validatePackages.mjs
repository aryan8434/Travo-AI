import 'dotenv/config';
import { loadAllPackages, indexItems, vectraIndex } from '../utils/ragEngine.js';
import { configuredEmbeddingModel } from '../utils/embeddings.js';
const packages = loadAllPackages();
const errors = [], editorial = [], indexIssues = [];
for (const pkg of packages) {
  if (!(pkg.price_inr >= 10000 && pkg.price_inr <= 500000)) errors.push(`${pkg.package_id}: price outside ₹10,000–₹5,00,000`);
  if (!['economical', 'premium', 'luxury'].includes(pkg.budget_tier)) errors.push(`${pkg.package_id}: invalid tier`);
  if (pkg.content_status === 'complete') {
    const words = pkg.detailed_guide?.trim().split(/\s+/).length || 0;
    if (words < 2000 || words > 2500) editorial.push(`${pkg.package_id}: ${words} words (target 2000–2500)`);
  }
}
const complete = packages.filter(p => p.content_status === 'complete').length;

// Every vector should come from the one configured embedding model. A mix means an
// earlier outage left local-hash fallbacks behind; `npm run reindex` repairs it.
const configured = configuredEmbeddingModel();
const vectorsByModel = {};
if (await vectraIndex.isIndexCreated()) {
  for (const item of await indexItems()) {
    const model = item.metadata?.embedding_model || 'unknown';
    vectorsByModel[model] = (vectorsByModel[model] || 0) + 1;
  }
  const wrong = Object.entries(vectorsByModel).filter(([model]) => model !== configured);
  if (wrong.length) indexIssues.push(`${wrong.reduce((n, [, count]) => n + count, 0)} vectors were not built with ${configured} (${wrong.map(([m, c]) => `${m}: ${c}`).join(', ')}). Run npm run reindex.`);
}

console.log(JSON.stringify({ packages: packages.length, validFullGuides: complete - editorial.length, pendingOrLegacy: packages.length - complete, guidesNeedingLengthReview: editorial, index: { configuredModel: configured, vectorsByModel, issues: indexIssues }, errors }, null, 2));
if (errors.length || (process.argv.includes('--strict') && (editorial.length || indexIssues.length))) process.exitCode = 1;
