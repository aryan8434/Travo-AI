import { loadAllPackages } from '../utils/ragEngine.js';
const packages = loadAllPackages();
const errors = [], editorial = [];
for (const pkg of packages) {
  if (!(pkg.price_inr >= 10000 && pkg.price_inr <= 500000)) errors.push(`${pkg.package_id}: price outside ₹10,000–₹5,00,000`);
  if (!['economical', 'premium', 'luxury'].includes(pkg.budget_tier)) errors.push(`${pkg.package_id}: invalid tier`);
  if (pkg.content_status === 'complete') {
    const words = pkg.detailed_guide?.trim().split(/\s+/).length || 0;
    if (words < 2000 || words > 2500) editorial.push(`${pkg.package_id}: ${words} words (target 2000–2500)`);
  }
}
const complete = packages.filter(p => p.content_status === 'complete').length;
console.log(JSON.stringify({ packages: packages.length, validFullGuides: complete - editorial.length, pendingOrLegacy: packages.length - complete, guidesNeedingLengthReview: editorial, errors }, null, 2));
if (errors.length || (process.argv.includes('--strict') && editorial.length)) process.exitCode = 1;
