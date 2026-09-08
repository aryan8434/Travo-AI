import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { LocalIndex } from "vectra";
import { embedBatch, embedRecords, embeddingProvider, embeddingModel, flushEmbedCache, INDEX_DIR } from "./embeddings.js";

import { parseTravelPreferences } from "./travelPreferences.js";
import { rankChunks } from "./retrieval.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataRootDir = path.join(__dirname, "../data");
const packagesSubDir = path.join(__dirname, "../data/packages");
const singlePackagesFilePath = path.join(__dirname, "../data/packages.json");
const uploadsDir = path.join(__dirname, "../uploads");
const vectraFolder = INDEX_DIR;


[dataRootDir, packagesSubDir, uploadsDir, vectraFolder].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const index = new LocalIndex(vectraFolder);

/* ================================================================
   BUDGET TIERS  (₹10,000 – ₹5,00,000 spectrum)
================================================================ */
export const BUDGET_TIERS = {
  economical: { min: 0, max: 50000, label: "Economical" },
  premium: { min: 50000, max: 150000, label: "Premium" },
  luxury: { min: 150000, max: Infinity, label: "Luxury" },
};

export function budgetTier(price) {
  const p = Number(price) || 0;
  if (p <= BUDGET_TIERS.economical.max) return "economical";
  if (p <= BUDGET_TIERS.premium.max) return "premium";
  return "luxury";
}

/* ================================================================
   PACKAGE LOADING  (in-memory cache, mtime-invalidated)
================================================================ */
let _pkgCache = { key: "", packages: [] };

let lastScan = 0;
let fingerprint = '';
function newestMtime(dirPath, force = false) {
  if (!force && Date.now() - lastScan < 1000) return fingerprint;
  const entries = [];
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.json')) { const stat = fs.statSync(full); entries.push(full + ':' + stat.mtimeMs + ':' + stat.size); }
    }
  };
  walk(dirPath);
  if (fs.existsSync(singlePackagesFilePath)) { const st = fs.statSync(singlePackagesFilePath); entries.push(st.mtimeMs + ':' + st.size); }
  fingerprint = entries.sort().join('|'); lastScan = Date.now();
  return fingerprint;
}

function scanJsonFiles(dirPath) {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;
  for (const file of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(scanJsonFiles(fullPath));
    } else if (file.endsWith(".json") && file !== "metadata.json") {
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8") || "[]");
        if (Array.isArray(parsed)) results = results.concat(parsed);
        else if (parsed && typeof parsed === "object") results.push(parsed);
      } catch (err) {
        console.warn(`Error reading JSON ${fullPath}:`, err.message);
      }
    }
  }
  return results;
}

export function loadAllPackages() {
  const key = String(newestMtime(packagesSubDir));
  if (key === _pkgCache.key && _pkgCache.packages.length) return _pkgCache.packages;

  const map = new Map();
  const add = (pkg) => {
    if (!pkg || !(pkg.package_id || pkg.title)) return;
    const id = pkg.package_id || pkg.title.toLowerCase().replace(/\s+/g, "-");
    if (!map.has(id)) {
      const price = pkg.price_inr || pkg.price || 0;
      map.set(id, { ...pkg, package_id: id, budget_tier: pkg.budget_tier || budgetTier(price) });
    }
  };

  scanJsonFiles(packagesSubDir).forEach(add);
  if (fs.existsSync(singlePackagesFilePath)) {
    try {
      JSON.parse(fs.readFileSync(singlePackagesFilePath, "utf-8") || "[]").forEach(add);
    } catch (e) {
      console.warn("Reading packages.json warning:", e.message);
    }
  }

  _pkgCache = { key, packages: Array.from(map.values()) };
  return _pkgCache.packages;
}

/* ================================================================
   TEXT BUILDERS + CHUNKING
================================================================ */
export function summaryText(pkg) {
  const highlights = (pkg.highlights || []).join(". ");
  const itinerary = (pkg.itinerary || [])
    .map((d) => `Day ${d.day}: ${d.title} - ${(d.activities || []).join(", ")} ${d.description || ""}`)
    .join(". ");
  return [
    `Package: ${pkg.title}`,
    `Destination: ${pkg.destination}, ${pkg.state || ""}, ${pkg.country || "India"}`,
    `Category: ${pkg.category || ""}. Budget tier: ${pkg.budget_tier}. Price: ₹${pkg.price_inr || pkg.price}`,
    `Duration: ${pkg.days || 3} days ${pkg.nights || 2} nights for ${pkg.capacity_people || 2} people`,
    `Hotel: ${pkg.hotel_name || ""} (${pkg.hotel_tier || ""}). Rating: ${pkg.rating || 4.5} stars`,
    `Best months: ${(pkg.best_months || []).join(", ")}. Weather: ${pkg.weather || ""}`,
    `Description: ${pkg.description || ""}`,
    `Included services: ${JSON.stringify(pkg.included_services || {})}`,
    `Excluded services: ${JSON.stringify(pkg.excluded_services || pkg.exclusions || [])}`,
    `Cancellation: ${JSON.stringify(pkg.cancellation_policy || "Contact the supplier for package-specific terms")}`,
    `Highlights: ${highlights}`,
    `Itinerary: ${itinerary}`,
    `Tags: ${(pkg.tags || []).join(" ")}`,
  ].join("\n");
}

/**
 * Split a long markdown guide into ~350-word overlapping chunks, keeping the
 * nearest preceding "## Heading" as a section label on each chunk.
 */
export function chunkGuide(guide, { words = 350, overlap = 60 } = {}) {
  if (!guide || typeof guide !== "string") return [];
  const lines = guide.split(/\r?\n/);
  const tokens = []; // { w, section }
  let section = "Overview";
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) {
      section = h[1].trim();
      continue;
    }
    for (const w of line.split(/\s+/).filter(Boolean)) tokens.push({ w, section });
  }
  if (tokens.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < tokens.length; i += words - overlap) {
    const slice = tokens.slice(i, i + words);
    if (slice.length < 25 && chunks.length) break;
    chunks.push({
      section: slice[0].section,
      text: slice.map((t) => t.w).join(" "),
    });
    if (i + words >= tokens.length) break;
  }
  return chunks;
}

function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

/**
 * Desired vector records for a package: one summary + N guide chunks.
 */
function desiredRecords(pkg) {
  const records = [];
  const baseMeta = {
    package_id: pkg.package_id,
    title: pkg.title,
    destination: pkg.destination,
    state: pkg.state || "",
    country: pkg.country || "India",
    price_inr: pkg.price_inr || pkg.price || 0,
    category: pkg.category || "",
    budget_tier: pkg.budget_tier,
    rating: pkg.rating || 4.5,
  };

  const summary = summaryText(pkg);
  records.push({
    chunkId: `${pkg.package_id}::summary`,
    text: summary,
    metadata: {
      ...baseMeta,
      chunk_id: `${pkg.package_id}::summary`,
      kind: "summary",
      section: "Summary",
      text: summary,
      word_count: summary.split(/\s+/).filter(Boolean).length,
      content_status: pkg.content_status || "legacy",
    },
  });

  const guide = pkg.content_status === "complete" ? (pkg.detailed_guide || pkg.full_guide || "") : "";
  chunkGuide(guide).forEach((c, i) => {
    records.push({
      chunkId: `${pkg.package_id}::guide::${i}`,
      text: `${pkg.title} — ${c.section}\n${c.text}`,
      metadata: {
        ...baseMeta,
        chunk_id: `${pkg.package_id}::guide::${i}`,
        kind: "guide",
        section: c.section,
        chunk_index: i,
        text: c.text,
        word_count: c.text.split(/\s+/).filter(Boolean).length,
        content_status: pkg.content_status,
      },
    });
  });

  return records;
}

/* ================================================================
   INCREMENTAL VECTRA SYNC
================================================================ */
let _syncing = null;
let lastSynced = '';
export async function syncVectraIndex({ force = false } = {}) {
  if (_syncing) { await _syncing; if (!force) return; }
  _syncing = (async () => {
    const sourceKey = newestMtime(packagesSubDir, force);
    if (!force && lastSynced === sourceKey && await index.isIndexCreated()) return;
    if (!(await index.isIndexCreated())) await index.createIndex();
    const packages = loadAllPackages();
    const existing = await index.listItems();
    const desired = packages.flatMap(desiredRecords).map(rec => ({ ...rec, id: sha1(rec.chunkId), hash: sha1(JSON.stringify(rec.metadata) + embeddingModel() + ':v4') }));
    const previous = new Map(existing.map(item => [item.id, item]));
    const changed = desired.filter(rec => force || previous.get(rec.id)?.metadata?.record_hash !== rec.hash);
    const wanted = new Set(desired.map(r => r.id));
    const removed = existing.filter(item => !wanted.has(item.id));
    const vectors = await embedRecords(changed.map(rec => rec.text));
    // One atomic Vectra commit, no duplicate records on --force.
    await index.beginUpdate();
    try {
      for (const item of removed) await index.deleteItem(item.id);
      for (let i = 0; i < changed.length; i++) {
        const rec = changed[i], embedding = vectors[i];
        await index.upsertItem({ id: rec.id, vector: embedding.vector, metadata: { ...rec.metadata, record_hash: rec.hash, embedding_model: embedding.model, embedding_provider: embedding.provider } });
      }
      await index.endUpdate();
    } catch (err) { index.cancelUpdate(); throw err; }
    flushEmbedCache(); lastSynced = sourceKey;
    console.log('RAG sync:', packages.length, 'packages;', desired.length, 'chunks;', changed.length, 'updated;', removed.length, 'removed');
    return { packages: packages.length, chunks: desired.length, updated: changed.length };
  })();
  try { return await _syncing; } finally { _syncing = null; }
}
export function startPackageWatcher() {
  syncVectraIndex().catch(err => console.error('RAG sync failed:', err.message));
  const timer = setInterval(() => syncVectraIndex().catch(err => console.error('RAG sync failed:', err.message)), 5000);
  timer.unref(); return () => clearInterval(timer);
}

/* ================================================================
   RETRIEVAL  (metadata filter -> vector search -> composite rerank)
================================================================ */
function matchesBudget(pkg, { budget, budgetMin, budgetMax, budgetTier: tier }) {
  const price = pkg.price_inr || pkg.price || 0;
  if (tier && BUDGET_TIERS[tier]) {
    // Prefer the package's explicit tier label; fall back to price banding.
    const pkgTier = pkg.budget_tier || budgetTier(price);
    if (pkgTier !== tier) return false;
  }
  if (budgetMin != null && price < Number(budgetMin)) return false;
  if (budgetMax != null && price > Number(budgetMax)) return false;
  if (budget != null && price > Number(budget)) return false;
  return true;
}

export async function retrievePackages(query = "", filters = {}, topK = 6) {
  const stated = parseTravelPreferences(query);
  const maximums = [filters.budgetMax, filters.budget, stated.budgetMax].filter(v => v != null);
  const minimums = [filters.budgetMin, stated.budgetMin].filter(v => v != null);
  filters = { ...stated, ...filters, budgetMax: maximums.length ? Math.min(...maximums) : null, budgetMin: minimums.length ? Math.max(...minimums) : null,
    budgetTier: filters.budgetTier || stated.budgetTier,
    people: filters.people ?? stated.people,
    city: filters.city || (filters.packageId ? null : resolvePackageLocation(query)?.value),
  };
  if (typeof query !== 'string' || query.length > 2000) throw new Error('Invalid search query');
  const allPackages = loadAllPackages();
  if (allPackages.length === 0) {
    return { matches: [], contextText: "No packages available.", vectorDbUsed: "Vectra" };
  }
  await syncVectraIndex();

  // STEP 1 — metadata filtering
  // With an explicit location, budget/tier only *rank* (soft) — the user asked
  // to see that location, not an empty list.
  let candidates = allPackages.filter((p) => matchesBudget(p, filters));
  if (filters.people != null) candidates = candidates.filter(p => Number(p.capacity_people || 1) >= filters.people);
  if (filters.packageId) candidates = candidates.filter(p => p.package_id === filters.packageId);

  const locationTerm = (filters.city || filters.destination || "").toLowerCase().trim();
  const locationMatch = (p) => {
    if (!locationTerm) return true;
    return (
      p.destination?.toLowerCase().includes(locationTerm) ||
      p.state?.toLowerCase().includes(locationTerm) ||
      p.country?.toLowerCase().includes(locationTerm) ||
      (p.tags || []).some((tg) => tg.toLowerCase() === locationTerm)
    );
  };

  if (locationTerm) {
    const cityMatches = candidates.filter(locationMatch);
    candidates = cityMatches;
  }

  if (filters.category && filters.category !== "ALL") {
    const c = filters.category.toLowerCase();
    const catMatches = candidates.filter(
      (p) =>
        p.category?.toLowerCase().includes(c) ||
        (p.tags || []).some((tg) => tg.toLowerCase().includes(c)),
    );
    candidates = catMatches;
  }

  // STEP 2 — vector search, grouped back to parent package
  const queryText =
    query ||
    [filters.city, filters.category, filters.budgetTier, "holiday travel package"]
      .filter(Boolean)
      .join(" ");

  const eligible = new Set(candidates.map(p => p.package_id));
  const pkgVectorScore = new Map();
  const ranked = await rankChunks(await index.listItems(), queryText, { filter: item => eligible.has(item.metadata?.package_id) });
  for (const hit of ranked.scores) {
    const id = hit.item.metadata.package_id;
    pkgVectorScore.set(id, Math.max(pkgVectorScore.get(id) || 0, hit.score));
  }
  const pool = new Map(candidates.map(p => [p.package_id, p]));

  // STEP 3 — composite rerank
  const currentMonth = new Date().toLocaleString("en-US", { month: "long" });
  const queryTerms = new Set(
    queryText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2),
  );
  const lexicalScore = (pkg) => {
    if (queryTerms.size === 0) return 0.5;
    const hay = `${pkg.title} ${pkg.destination} ${pkg.state} ${pkg.category} ${(pkg.tags || []).join(" ")} ${pkg.description || ""}`.toLowerCase();
    let hits = 0;
    for (const term of queryTerms) if (hay.includes(term)) hits++;
    return hits / queryTerms.size;
  };

  const scored = Array.from(pool.values()).map((pkg) => {
    const price = pkg.price_inr || pkg.price || 0;
    const vectorScore = pkgVectorScore.get(pkg.package_id) ?? 0.45;
    const lexScore = lexicalScore(pkg);

    let budgetScore = 1.0;
    const ref = filters.budgetMax || filters.budget;
    if (ref) {
      if (price <= ref) budgetScore = 1.0;
      else if (price <= ref * 1.2) budgetScore = 0.65;
      else budgetScore = 0.3;
    }

    const ratingScore = (pkg.rating || 4.5) / 5;
    const seasonScore = (pkg.best_months || []).includes(currentMonth) ? 1 : 0.8;
    const tierMatch = filters.budgetTier && pkg.budget_tier === filters.budgetTier;
    const tierScore = filters.budgetTier ? (tierMatch ? 1 : 0.4) : 0.85;

    // When the user is browsing a fixed location, an explicit tier / budget
    // preference should dominate the ordering; otherwise vector relevance leads.
    const w =
      filters.strictCity && (filters.budgetTier || ref)
        ? { vec: 0.15, lex: 0.1, budget: 0.28, rating: 0.12, season: 0.07, tier: 0.28 }
        : { vec: 0.32, lex: 0.18, budget: 0.18, rating: 0.12, season: 0.1, tier: 0.1 };

    const finalScore =
      vectorScore * w.vec +
      lexScore * w.lex +
      budgetScore * w.budget +
      ratingScore * w.rating +
      seasonScore * w.season +
      tierScore * w.tier;

    const matchPct = Math.round(Math.min(100, Math.max(0, finalScore * 100)));

    const reasons = [];
    if (ref && price <= ref) reasons.push(`Within your ₹${Number(ref).toLocaleString("en-IN")} budget`);
    if (filters.budgetTier && pkg.budget_tier === filters.budgetTier)
      reasons.push(`${BUDGET_TIERS[pkg.budget_tier].label} tier`);
    if ((pkg.best_months || []).includes(currentMonth)) reasons.push(`Great for ${currentMonth}`);
    if (pkg.hotel_tier) reasons.push(pkg.hotel_tier);
    if ((pkg.rating || 0) >= 4.8) reasons.push(`Top rated ${pkg.rating}★`);

    return {
      ...pkg,
      match_score: matchPct,
      match_reason: reasons.join(" • ") || "Matches your travel preferences.",
    };
  });

  scored.sort((a, b) => b.match_score - a.match_score);
  const finalMatches = scored.slice(0, topK);

  const contextText = finalMatches
    .map(
      (p, i) =>
        `[RAG ${i + 1}] ${p.package_id} | ${p.match_score}% | "${p.title}" | ${p.destination} | ${p.budget_tier} | ₹${p.price_inr || p.price} | ${(p.highlights || []).slice(0, 2).join(", ")} | ${p.description || ""}`,
    )
    .join("\n\n");

  return {
    matches: finalMatches,
    total: scored.length,
    sources: ranked.scores.filter(h => finalMatches.some(p => p.package_id === h.item.metadata.package_id)).slice(0, 6).map(h => ({ chunk_id: h.item.metadata.chunk_id, package_id: h.item.metadata.package_id, title: h.item.metadata.title, section: h.item.metadata.section, text: h.item.metadata.text, score: h.score })),
    contextText,
    vectorDbUsed: `Vectra hybrid (${embeddingProvider()} embeddings)`,
  };
}

/* ================================================================
   LOCATION PICKER  (ask "which state / destination?" before searching)
================================================================ */

/**
 * Grouped list of the states / destinations we actually have packages for.
 */
export function packageLocationOptions() {
  const pkgs = loadAllPackages();
  const states = new Map();
  const destinations = new Map();
  for (const p of pkgs) {
    const s = p.state || p.country || "Other";
    states.set(s, (states.get(s) || 0) + 1);
    destinations.set(p.destination, (destinations.get(p.destination) || 0) + 1);
  }
  const sortDesc = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  return { states: sortDesc(states), destinations: sortDesc(destinations) };
}

/**
 * Match free text ("rajasthan", "goa", "kerala backwaters", "manali") to a
 * state / country / destination we have packages for.
 * @returns {{ kind, value, term, count } | null}
 */
export function resolvePackageLocation(text) {
  if (!text || typeof text !== "string") return null;
  const q = text.toLowerCase().replace(/[^a-z\s&]/g, " ").replace(/\s+/g, " ").trim();
  if (!q || q.length < 3) return null;

  const pkgs = loadAllPackages();
  const stateSet = new Set();
  const destSet = new Set();
  const countrySet = new Set();
  for (const p of pkgs) {
    if (p.state) stateSet.add(p.state);
    if (p.destination) destSet.add(p.destination);
    if (p.country) countrySet.add(p.country);
  }

  const contains = name => (' ' + q + ' ').includes(' ' + name.toLowerCase() + ' ');
  for (const d of [...destSet].sort((a, b) => b.length - a.length)) if (contains(d)) return tally('destination', d, pkgs);
  for (const state of stateSet) if (contains(state)) return tally('state', state, pkgs);
  for (const c of countrySet) if (contains(c)) return tally('country', c, pkgs);
  return null;
}

function tally(kind, value, pkgs) {
  const v = value.toLowerCase();
  const count = pkgs.filter(
    (p) =>
      p.state?.toLowerCase() === v ||
      p.country?.toLowerCase() === v ||
      p.destination?.toLowerCase() === v ||
      p.destination?.toLowerCase().includes(v) ||
      p.state?.toLowerCase().includes(v),
  ).length;
  return { kind, value, term: value, count };
}

/* ================================================================
   CONTENT PIPELINE HELPERS
================================================================ */

/**
 * Write a full detailed_guide into a package file (matched by package_id) and
 * re-index. Used by the content-fill pipeline.
 */
export async function ingestPackageGuide(packageId, guideText) {
  if (!packageId || !guideText) throw new Error("packageId and guideText required");

  const target = findPackageFile(packagesSubDir, packageId);
  if (!target) throw new Error(`No file found containing package_id ${packageId}`);

  const parsed = JSON.parse(fs.readFileSync(target, "utf-8"));
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const pkg = arr.find((p) => (p.package_id || "") === packageId);
  if (!pkg) throw new Error(`package_id ${packageId} not in ${target}`);

  const wordCount = guideText.trim().split(/\s+/).length;
  if (wordCount < 2000 || wordCount > 2500) throw new Error('Guide must contain 2000–2500 words');
  const expectedHeadings = (pkg.detailed_guide || '').match(/^## .+$/gm) || [];
  const headings = guideText.match(/^## .+$/gm) || [];
  if (JSON.stringify(headings) !== JSON.stringify(expectedHeadings)) throw new Error('Guide must preserve every section heading in order');
  pkg.detailed_guide = guideText;
  pkg.content_status = "complete";
  pkg.word_count = guideText.split(/\s+/).filter(Boolean).length;

  fs.writeFileSync(`${target}.tmp`, JSON.stringify(Array.isArray(parsed) ? arr : arr[0], null, 2));
  fs.renameSync(`${target}.tmp`, target);
  lastScan = 0;
  _pkgCache = { key: "", packages: [] };
  await syncVectraIndex();
  return { file: target, word_count: pkg.word_count };
}

function findPackageFile(dir, packageId) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const nested = findPackageFile(full, packageId);
      if (nested) return nested;
    } else if (file.endsWith(".json")) {
      try {
        const parsed = JSON.parse(fs.readFileSync(full, "utf-8"));
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        if (arr.some((p) => (p.package_id || "") === packageId)) return full;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/* ================================================================
   PDF BROCHURE INGESTION
================================================================ */
export async function ingestPdfText(pdfFilename, pdfText) {
  if (!pdfText || pdfText.trim().length === 0) return 0;
  if (!(await index.isIndexCreated())) await index.createIndex();

  const chunkSize = 500;
  const overlap = 50;
  const chunks = [];
  for (let i = 0; i < pdfText.length; i += chunkSize - overlap) {
    const chunk = pdfText.slice(i, i + chunkSize).trim();
    if (chunk.length > 20) chunks.push(chunk);
  }

  const vectors = await embedBatch(chunks);
  for (let idx = 0; idx < chunks.length; idx++) {
    await index.insertItem({
      vector: vectors[idx],
      metadata: {
        package_id: `PDF-${path.basename(pdfFilename)}-chunk-${idx + 1}`,
        title: `Brochure: ${path.basename(pdfFilename)} (Part ${idx + 1})`,
        destination: "Document RAG",
        kind: "pdf",
        section: `Part ${idx + 1}`,
        rawPackage: JSON.stringify({
          package_id: `PDF-${idx + 1}`,
          title: `📄 Brochure: ${pdfFilename}`,
          destination: "Travel PDF Brochure",
          description: chunks[idx],
          isPdfChunk: true,
          pdfFilename,
        }),
      },
    });
  }
  flushEmbedCache();
  return chunks.length;
}

export { index as vectraIndex };
