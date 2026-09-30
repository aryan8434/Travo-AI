import { loadAllPackages, resolvePackageLocation, retrievePackages } from './ragEngine.js';
import { haversineKm, nearestAirportFor, resolveAirport } from './flightEngine.js';
import { parseTravelPreferences } from './travelPreferences.js';
import { generateGroundedAnswer } from '../llm.js';

// Hotels come from the package catalogue: every package names the stay it
// includes. No standalone nightly-rate supplier is connected, so a stay is
// shown with its package price and booked as that package.

const MONEY = /(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|lacs?|k|l)?\b/gi;
const TIER_WORDS = /\b(?:luxury|opulent|premium|comfortable|mid.?range|economical|cheap|backpacking)\b/gi;
const QUESTION = /\?|\b(?:which|what|does|do they|is there|are there|tell me|compare|describe)\b/i;
const NEARBY_KM = 800;
const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

// Retrieval treats any amount or tier word in the query as a package filter;
// a nightly hotel budget is not a package price, so both are applied here instead.
function rankingQuery(message, place) {
  const cleaned = String(message || '').replace(MONEY, ' ').replace(TIER_WORDS, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 2 ? cleaned : `hotels and stays in ${place}`;
}

export function stayExcerpt(pkg) {
  if (pkg.content_status !== 'complete') return null;
  const guide = pkg.detailed_guide || pkg.full_guide || '';
  const section = guide.match(/^#{2,3}\s*Where to Stay[^\n]*\n+([\s\S]*?)(?=\n#{1,3}\s|$)/im)?.[1]?.trim();
  if (!section) return null;
  const text = section.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  return text.length > 320 ? `${text.slice(0, 317).trimEnd()}…` : text;
}

export function toHotel(pkg, extra = {}) {
  const nights = Math.max(1, Number(pkg.nights) || 1);
  return {
    hotel_id: `STAY-${pkg.package_id}`,
    name: pkg.hotel_name,
    city: pkg.destination,
    state: pkg.state,
    country: pkg.country,
    hotel_tier: pkg.hotel_tier,
    rating: pkg.rating,
    budget_tier: pkg.budget_tier,
    about: stayExcerpt(pkg),
    source: 'catalogue',
    package_price_per_night: Math.round(pkg.price_inr / nights),
    package: {
      package_id: pkg.package_id, title: pkg.title, price_inr: pkg.price_inr,
      days: pkg.days, nights: pkg.nights, capacity_people: pkg.capacity_people,
    },
    ...extra,
  };
}

function uniqueStays(packages) {
  const seen = new Set();
  return packages.filter((p) => {
    const key = String(p.hotel_name || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// With a nightly budget: stays whose package works out within it, or else the
// cheapest per night. Without one, retrieval order is kept.
function applyNightlyBudget(hotels, nightlyBudget) {
  if (!nightlyBudget) return { hotels, withinBudget: null };
  const within = hotels.filter((h) => h.package_price_per_night <= nightlyBudget);
  if (within.length) return { hotels: within, withinBudget: true };
  return { hotels: [...hotels].sort((a, b) => a.package_price_per_night - b.package_price_per_night), withinBudget: false };
}

function airportFor(place) {
  for (const part of [place, ...String(place || '').split(/\s*(?:&|-|,)\s*/)]) {
    const airport = nearestAirportFor(part) || resolveAirport(part);
    if (airport?.lat != null) return airport;
  }
  return null;
}

function nearbyStays(city, { nightlyBudget, tier, limit }) {
  const origin = airportFor(city);
  if (!origin) return [];
  const byDestination = new Map();
  for (const pkg of loadAllPackages()) {
    if (!pkg.hotel_name) continue;
    const list = byDestination.get(pkg.destination) || [];
    list.push(pkg);
    byDestination.set(pkg.destination, list);
  }
  const options = [];
  for (const [destination, packages] of byDestination) {
    const airport = airportFor(destination);
    if (!airport) continue;
    const distance = Math.round(haversineKm(origin, airport));
    if (distance > NEARBY_KM) continue;
    const preferred = tier ? packages.filter((p) => p.budget_tier === tier) : [];
    const pool = (preferred.length ? preferred : packages).map((p) => toHotel(p, { distance_km: distance }));
    // Best-rated within the budget or tier; otherwise the most affordable stay.
    const ordered = nightlyBudget || tier
      ? pool.sort((a, b) => (b.rating || 0) - (a.rating || 0))
      : pool.sort((a, b) => a.package_price_per_night - b.package_price_per_night);
    options.push(applyNightlyBudget(ordered, nightlyBudget).hotels[0]);
  }
  return options.sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);
}

// resolvePackageLocation needs a full name; "Andaman" should still find the
// state "Andaman & Nicobar", which is how package retrieval matches places.
function partialPlace(place) {
  const term = place.toLowerCase();
  if (term.length < 3) return null;
  const word = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const known = loadAllPackages().some((p) => [p.destination, p.state, p.country, ...(p.tags || [])].some((v) => word.test(String(v || '').toLowerCase())));
  return known ? place : null;
}

function findLocation(place, message) {
  return resolvePackageLocation(place)?.value || partialPlace(place) || resolvePackageLocation(message)?.value || null;
}

function coverageText() {
  const destinations = [...new Set(loadAllPackages().filter((p) => p.hotel_name).map((p) => p.destination))];
  return `Stays are available in ${destinations.length} destinations, including ${destinations.slice(0, 5).join(', ')}.`;
}

export async function searchHotels(message = '', { city = null, budget = null, limit = 4 } = {}) {
  const prefs = parseTravelPreferences(message);
  const nightlyBudget = Number(budget) > 0 ? Number(budget) : prefs.budgetMax ?? null;
  const tier = prefs.budgetTier || null;
  const place = String(city || '').trim();
  const location = findLocation(place, message);
  const booking = ' Each stay is booked as part of its package; standalone nightly rates are not connected yet.';

  if (!location) {
    const hotels = place ? nearbyStays(place, { nightlyBudget, tier, limit }) : [];
    const text = hotels.length
      ? `No catalogue stays in **${place}** yet. The nearest destinations with stays are ${hotels.map((h) => `${h.city} (~${h.distance_km} km)`).join(', ')}.${booking}`
      : `I don't have hotel stays for **${place || 'that place'}** yet. ${coverageText()}`;
    return { text, hotels, location: null, nearby: hotels.length > 0, nightlyBudget, withinBudget: null, sources: [] };
  }

  const query = rankingQuery(message, location);
  const rag = await retrievePackages(query, { city: location }, 60);
  let stays = uniqueStays(rag.matches);
  if (tier && stays.some((p) => p.budget_tier === tier)) stays = stays.filter((p) => p.budget_tier === tier);
  const { hotels, withinBudget } = applyNightlyBudget(stays.map((p) => toHotel(p, { match_score: p.match_score })), nightlyBudget);
  const shown = hotels.slice(0, limit);

  let text = `🏨 Stays in **${location}**`;
  if (withinBudget === true) text += ` whose packages work out under **${inr(nightlyBudget)} a night**, stay and inclusions together.`;
  else if (withinBudget === false) text += `. None come in under **${inr(nightlyBudget)} a night** as a package; these are the most affordable.`;
  else text += '.';
  text += booking;

  let sources = [];
  // A question about the stays is answered from the retrieved passages; if no
  // cited answer comes back (e.g. the LLM is rate-limited) the listing stands.
  if (QUESTION.test(message) && shown.length && rag.sources?.length) {
    const answer = await generateGroundedAnswer(query, rag.sources, null);
    if (answer) { text = answer; sources = rag.sources; }
  }

  return { text, hotels: shown, total: hotels.length, location, nearby: false, nightlyBudget, withinBudget, sources, vectorDbUsed: rag.vectorDbUsed };
}
