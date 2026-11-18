/**
 * Rebuild the Vectra vector index from all package JSON files.
 *
 *   npm run reindex           # incremental — only new/changed chunks
 *   npm run reindex -- --force # wipe manifest and re-embed everything
 *
 * Safe to run after the content pipeline fills `detailed_guide` fields.
 */
import "dotenv/config";
import { syncVectraIndex, loadAllPackages, retrievePackages } from "../utils/ragEngine.js";
import { flushEmbedCache, embeddingProvider, degradedEmbeddingCount } from "../utils/embeddings.js";

const force = process.argv.includes("--force");

const pkgs = loadAllPackages();
const tiers = pkgs.reduce((a, p) => ((a[p.budget_tier] = (a[p.budget_tier] || 0) + 1), a), {});
const complete = pkgs.filter((p) => p.content_status === "complete").length;

console.log(`Packages: ${pkgs.length}  (economical ${tiers.economical || 0} · premium ${tiers.premium || 0} · luxury ${tiers.luxury || 0})`);
console.log(`Guides complete: ${complete}/${pkgs.length}`);
console.log(`Embedding provider: ${embeddingProvider()}${force ? "  [FORCE]" : ""}\n`);

try {
  await syncVectraIndex({ force });
} catch (err) {
  // Embedding failures abort the build instead of storing local-hash fallbacks.
  // Batches already embedded are cached on disk, so re-running resumes from there.
  console.error(`\n❌ Reindex stopped: ${err.message}\n   The existing index was left unchanged. Embedded batches are cached; run \`npm run reindex\` again once the provider recovers.`);
  process.exit(1);
}
flushEmbedCache();

const degraded = degradedEmbeddingCount();
if (degraded > 0) {
  console.warn(`\n⚠️  ${degraded} chunk(s) used a local vector because the embedding provider failed.`);
}

// Smoke-test retrieval.
const demo = await retrievePackages("relaxing luxury beach honeymoon", { budgetTier: "luxury" }, 3);
console.log("\nSample query 'relaxing luxury beach honeymoon' (tier=luxury):");
for (const m of demo.matches) console.log(`  ${m.match_score}%  ${m.title}  ₹${m.price_inr}`);
console.log(`\n✅ Reindex complete via ${demo.vectorDbUsed}`);
process.exit(0);
