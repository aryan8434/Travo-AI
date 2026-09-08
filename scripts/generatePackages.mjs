/**
 * TravoAI package generator.
 *
 *   node scripts/generatePackages.mjs
 *
 * Expands scripts/destinations.mjs into economical / premium / luxury packages
 * (₹10,000–₹5,00,000) under data/packages/generated/. Each package carries a
 * structured itinerary plus a `detailed_guide` *skeleton* (fixed section
 * scaffold + seed sentences + word_target) for the content pipeline to expand.
 *
 * Idempotent: a file whose content_status is already "complete" is left
 * untouched so hand-written / AI-filled guides are never clobbered.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DESTINATIONS } from "./destinations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.join(__dirname, "../data/packages/generated");

/* deterministic PRNG so re-runs are stable */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const round = (n, step) => Math.round(n / step) * step;
const clampPrice = (n) => Math.min(500000, Math.max(10000, n));
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

const TIERS = {
  economical: { mult: 1.0, hotelTier: "3-Star / Verified Homestay", rating: 4.2, people: 2, mealPlan: "Daily breakfast", transfer: "Shared AC coach transfers", pace: "value-focused" },
  premium: { mult: 3.1, hotelTier: "4-Star Resort / Boutique Hotel", rating: 4.6, people: 2, mealPlan: "Breakfast + one signature dinner", transfer: "Private sedan transfers & sightseeing", pace: "comfortable" },
  luxury: { mult: 8.5, hotelTier: "5-Star Luxury / Palace Collection", rating: 4.9, people: 2, mealPlan: "All-day gourmet dining & private chef experience", transfer: "Private SUV with chauffeur & on-call concierge", pace: "unhurried and curated" },
};

const GUIDE_SECTIONS = [
  ["Overview", (c) => `${c.title} is a ${c.days}-day, ${c.nights}-night ${c.tierLabel.toLowerCase()} journey through ${c.place}, ${c.regionLabel}. This guide expands the itinerary below into a complete, practical trip companion. Expand this section to roughly 180 words covering who the package suits, the headline experiences (${c.topActivities}), and the overall trip rhythm (${c.pace}).`],
  ["Why Visit", (c) => `${c.place} earns its place on this route for its ${c.category.toLowerCase()} character. Expand to ~170 words on landscape, seasons, cultural texture and the single reason a traveller remembers this trip.`],
  ["Getting There & Around", (c) => `Most travellers reach ${c.place} via the nearest airport or railhead, then continue by road. Expand to ~180 words: arrival gateways, approximate transfer times, local transport options, and how ${c.transfer.toLowerCase()} are handled in this package.`],
  ["Day-by-Day Deep Dive", (c) => `The ${c.days}-day plan is summarised in the itinerary array. Expand each day to ~110 words here — morning, afternoon and evening — weaving in ${c.nearby}. Total this section ~${c.days * 110} words.`],
  ["Where to Stay", (c) => `Accommodation is ${c.hotelName} (${c.hotelTier}) or a comparable property. Expand to ~150 words on the stay experience, room style, on-site facilities and location trade-offs.`],
  ["Food & Dining", (c) => `Signature dishes to seek out: ${c.food}. Expand to ~170 words on where to eat, dietary notes (veg/Jain/vegan availability), and what the package meal plan (${c.mealPlan.toLowerCase()}) does and does not cover.`],
  ["Culture & Etiquette", (c) => `Expand to ~140 words on local customs, dress codes at religious sites, photography etiquette, language basics and tipping norms relevant to ${c.place}.`],
  ["Budget Breakdown (₹)", (c) => `Package price is ${inr(c.price)} for ${c.people} travellers (${c.tierLabel} tier). Expand to ~160 words itemising what is included, a realistic estimate of personal spending (meals outside the plan, entry fees, shopping, tips), and money-saving or upgrade options.`],
  ["Best Time & Weather", (c) => `Ideal months: ${c.months}. Typical conditions: ${c.weather}. Expand to ~130 words on month-by-month trade-offs, festivals, and what to expect in shoulder season.`],
  ["Packing List", (c) => `Expand to ~120 words: clothing for the climate above, footwear, documents, medication, and 3–4 destination-specific items travellers routinely forget for ${c.place}.`],
  ["Safety & Health", (c) => `Expand to ~140 words on altitude/heat/water precautions as relevant, road-safety notes, emergency numbers (112 in India), nearest hospital guidance, and travel-insurance advice.`],
  ["Responsible Travel", (c) => `Expand to ~120 words on minimising plastic, respecting wildlife and fragile ecosystems near ${c.place}, supporting local artisans (${c.shopping}), and community-based tourism choices.`],
  ["FAQ", (c) => `Expand to ~180 words: 6–8 question-and-answer pairs a traveller would ask before booking a ${c.tierLabel.toLowerCase()} ${c.place} trip (transfers, connectivity, kids, solo travellers, cancellation, customisation).`],
  ["Final Word", (c) => `Expand to ~90 words: a warm closing that sets expectations and points the reader to the booking action for ${c.title}.`],
];

function buildGuideSkeleton(ctx) {
  const lines = [`# ${ctx.title} — Complete Travel Guide`, ""];
  const budgets = [160, 120, 140, 550, 150, 160, 130, 180, 130, 110, 120, 100, 160, 90];
  for (const [i, [heading, seed]] of GUIDE_SECTIONS.entries()) {
    const content = heading === 'Day-by-Day Deep Dive'
      ? 'Expand the structured ' + ctx.days + '-day itinerary into exactly about 550 words TOTAL, divided between days. Cover morning, afternoon and evening without adding unlisted inclusions.'
      : seed(ctx).replace(/(?:roughly|~)\s*\d+ words/g, '~' + budgets[i] + ' words');
    lines.push('## ' + heading, '', content, 'Section budget: ' + budgets[i] + ' words.', '');
  }
  lines.push(
    "---",
    `_content_status: skeleton — expand every section above to reach ${ctx.wordTarget} words total, keep the headings, then set content_status to "complete"._`,
  );
  return lines.join("\n");
}

function buildItinerary(ctx, rng) {
  const acts = [...ctx.activities];
  const days = [];
  const perDay = Math.max(2, Math.ceil(acts.length / ctx.days));
  for (let d = 1; d <= ctx.days; d++) {
    let title, chosen;
    if (d === 1) {
      title = `Arrival in ${ctx.place} & easy start`;
      chosen = [acts.shift()].filter(Boolean);
    } else if (d === ctx.days) {
      title = `Souvenir time & departure`;
      chosen = [`shopping at ${ctx.shoppingPlaces[0]}`];
    } else {
      chosen = acts.splice(0, perDay).filter(Boolean);
      title = chosen[0] ? chosen[0].replace(/^\w/, (m) => m.toUpperCase()) : `Explore ${ctx.place}`;
    }
    days.push({
      day: d,
      title,
      activities: chosen,
      description: `Day ${d}: ${chosen.join("; ") || "leisure day"}. ${ctx.pace === "unhurried and curated" ? "Unstructured time is built in for spa, pool or private experiences." : "A local guide accompanies the main sightseeing block."}`,
    });
  }
  return days;
}

function makePackage(dest, tierKey) {
  const tier = TIERS[tierKey];
  const rng = mulberry32(seedFromString(`${dest.slug}-${tierKey}`));

  const days = tierKey === "luxury" ? dest.days + 1 : dest.days;
  const nights = days - 1;

  const basePrice = dest.anchor * tier.mult * (0.9 + rng() * 0.25);
  const price = dest.slug === "maldives" && tierKey === "luxury" ? 500000 : clampPrice(round(basePrice, tierKey === "economical" ? 500 : 1000));

  const regionLabel = dest.region === "international" ? dest.country : `${dest.state}, India`;
  const place = dest.name;
  const tierLabel = tierKey[0].toUpperCase() + tierKey.slice(1);
  const title = `${place} ${tierLabel} — ${dest.category} (${days}D/${nights}N)`;

  const ctx = {
    title,
    place,
    regionLabel,
    category: dest.category,
    days,
    nights,
    people: tier.people,
    price,
    tierLabel,
    pace: tier.pace,
    hotelName: dest.hotels[tierKey],
    hotelTier: tier.hotelTier,
    mealPlan: tier.mealPlan,
    transfer: tier.transfer,
    weather: dest.weather,
    months: dest.months.join(", "),
    food: dest.food.join(", "),
    nearby: dest.nearby.join(", "),
    shopping: dest.shopping.join(", "),
    shoppingPlaces: dest.shopping,
    activities: dest.activities,
    topActivities: dest.activities.slice(0, 3).join(", "),
    wordTarget: 2500,
  };

  const packageId = `PKG-${dest.slug.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${tierKey.toUpperCase().slice(0, 3)}`;

  return {
    package_id: packageId,
    title,
    destination: place,
    state: dest.state || "",
    country: dest.region === "international" ? dest.country : "India",
    region: dest.region,
    price_inr: price,
    budget_tier: tierKey,
    days,
    nights,
    capacity_people: tier.people,
    hotel_name: dest.hotels[tierKey],
    hotel_tier: tier.hotelTier,
    rating: Number((tier.rating + (rng() * 0.2 - 0.1)).toFixed(1)),
    category: dest.category,
    best_months: dest.months,
    weather: dest.weather,
    difficulty: /Mountains|Adventure|Trek/i.test(dest.category) ? "Moderate" : "Easy",
    description: `A ${days}-day ${tierLabel.toLowerCase()} ${dest.category.toLowerCase()} experience in ${place} (${regionLabel}). Includes ${dest.hotels[tierKey]} (${tier.hotelTier}), ${tier.mealPlan.toLowerCase()}, ${tier.transfer.toLowerCase()}, and guided highlights: ${dest.activities.slice(0, 4).join(", ")}.`,
    highlights: dest.activities.slice(0, 5).map((a) => a.replace(/^\w/, (m) => m.toUpperCase())),
    included_services: {
      meals: tier.mealPlan,
      transport: tier.transfer,
      guide: "Certified local guide for sightseeing days",
      activities: `Entry & experience passes for: ${dest.activities.slice(0, 3).join(", ")}`,
    },
    excluded_services: [
      "Flights / trains to the gateway city",
      "Travel insurance",
      "Personal expenses, tips and optional activities",
      dest.region === "international" ? "Visa fees" : "Monument still/video camera charges",
    ],
    activities: dest.activities,
    itinerary: buildItinerary({ ...ctx }, rng),
    nearby_attractions: dest.nearby,
    restaurants: [],
    shopping_places: dest.shopping,
    transport_options: { airport_transfer: true, private_car: tierKey !== "economical", scooter_available: dest.region !== "international" },
    cancellation_policy:
      "Full refund up to 15 days before departure. 50% refund 7–14 days prior. No refund within 6 days of travel. Date changes subject to availability and fare difference.",
    travel_tips: [
      `Best months to travel: ${dest.months.slice(0, 3).join(", ")}.`,
      `Carry clothing suited to: ${dest.weather}.`,
      `Try the local food: ${dest.food.slice(0, 3).join(", ")}.`,
    ],
    faqs: [
      { question: "Is this package customisable?", answer: "Yes — hotels, duration and add-on experiences can be tailored. Price adjusts accordingly." },
      { question: "Are flights included?", answer: "No. Fares to the gateway city are separate; TravoAI can price them by distance on request." },
    ],
    tags: [
      dest.slug,
      tierKey,
      ...dest.category.toLowerCase().split(/\s*&\s*|\s+/),
      dest.region,
      `${days}-day`,
    ],
    word_target: 2500,
    content_status: "skeleton",
    detailed_guide: buildGuideSkeleton(ctx),
  };
}

/* ---------------------------------------------------------------- */
fs.mkdirSync(outRoot, { recursive: true });

let written = 0;
let skipped = 0;
const summary = { economical: 0, premium: 0, luxury: 0 };

for (const dest of DESTINATIONS) {
  const subdir = path.join(outRoot, dest.region);
  fs.mkdirSync(subdir, { recursive: true });

  for (const tierKey of Object.keys(TIERS)) {
    const file = path.join(subdir, `${dest.slug}-${tierKey}.json`);

    if (fs.existsSync(file)) {
      try {
        const existing = JSON.parse(fs.readFileSync(file, "utf-8"));
        const rec = Array.isArray(existing) ? existing[0] : existing;
        if (rec && rec.content_status !== "skeleton") {
          skipped++;
          summary[tierKey]++;
          continue;
        }
      } catch {
        /* fall through and regenerate */
      }
    }

    const pkg = makePackage(dest, tierKey);
    fs.writeFileSync(file, JSON.stringify([pkg], null, 2));
    written++;
    summary[tierKey]++;
  }
}

const total = written + skipped;
console.log(`\n✅ Packages: ${total} total  (${written} written, ${skipped} kept as complete)`);
console.log(`   economical ${summary.economical} · premium ${summary.premium} · luxury ${summary.luxury}`);
console.log(`   output: data/packages/generated/<region>/<slug>-<tier>.json`);
console.log(`\nNext: fill guides per scripts/CONTENT_PIPELINE.md, then \`npm run reindex\`.\n`);
