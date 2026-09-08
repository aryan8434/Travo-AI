import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const airportsPath = path.join(__dirname, "../data/airports.json");

/* ----------------------------------------------------------------
   Airport dataset (cached, mtime-invalidated)
---------------------------------------------------------------- */
let _cache = { mtimeMs: 0, airports: [], byKey: new Map() };

function loadAirports() {
  let stat;
  try {
    stat = fs.statSync(airportsPath);
  } catch {
    return _cache.airports;
  }
  if (stat.mtimeMs === _cache.mtimeMs && _cache.airports.length) {
    return _cache.airports;
  }

  const airports = JSON.parse(fs.readFileSync(airportsPath, "utf-8"));
  const byKey = new Map();
  for (const a of airports) {
    byKey.set(a.city.toLowerCase(), a);
    byKey.set(a.iata.toLowerCase(), a);
    for (const alias of a.aliases || []) byKey.set(alias.toLowerCase(), a);
  }
  _cache = { mtimeMs: stat.mtimeMs, airports, byKey };
  return airports;
}

export function listAirports() {
  return loadAirports().map(({ city, name, iata }) => ({ city, name, iata }));
}

export function listAirportCities() {
  return loadAirports()
    .map((a) => a.city)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Common Indian cities with no commercial airport → the airport travellers
 * actually use. Lets us answer "Kota" with "nearest airport is Jaipur"
 * instead of a dead end.
 */
const NEAREST_AIRPORT = {
  kota: "Jaipur",
  ajmer: "Jaipur",
  bikaner: "Jodhpur",
  haridwar: "Dehradun",
  rishikesh: "Dehradun",
  nainital: "Dehradun",
  manali: "Kullu",
  kasol: "Kullu",
  mussoorie: "Dehradun",
  shimla: "Chandigarh",
  ludhiana: "Chandigarh",
  jalandhar: "Amritsar",
  meerut: "Delhi",
  noida: "Delhi",
  faridabad: "Delhi",
  mathura: "Agra",
  vrindavan: "Agra",
  ayodhya: "Lucknow",
  kanpur: "Lucknow",
  nashik: "Mumbai",
  shirdi: "Mumbai",
  lonavala: "Pune",
  kolhapur: "Belagavi",
  mysore: "Bengaluru",
  mysuru: "Bengaluru",
  ooty: "Coimbatore",
  kodaikanal: "Madurai",
  pondicherry: "Chennai",
  puducherry: "Chennai",
  vellore: "Chennai",
  alleppey: "Kochi",
  alappuzha: "Kochi",
  munnar: "Kochi",
  thekkady: "Kochi",
  gangtok: "Bagdogra",
  darjeeling: "Bagdogra",
  kalimpong: "Bagdogra",
  jamshedpur: "Ranchi",
  dhanbad: "Ranchi",
  gaya: "Patna",
  ujjain: "Indore",
  hampi: "Hubli",
  gokarna: "Mangaluru",
  wayanad: "Kozhikode",
  coorg: "Mangaluru",
  madikeri: "Mangaluru",
};

/**
 * For a city with no airport of its own, the airport people fly into.
 * Returns null when we have no mapping.
 */
export function nearestAirportFor(cityName) {
  if (!cityName || typeof cityName !== "string") return null;
  const mapped = NEAREST_AIRPORT[cityName.trim().toLowerCase()];
  return mapped ? resolveAirport(mapped) : null;
}

/**
 * Scan free text for airport cities/aliases, in order of appearance.
 * Deterministic backstop for when the model echoes a stale origin: whatever
 * the user actually typed this turn wins.
 */
export function findAirportsInText(text) {
  if (!text || typeof text !== "string") return [];
  loadAirports();
  const lower = text.toLowerCase();
  const hits = [];

  for (const [key, airport] of _cache.byKey.entries()) {
    if (key.length < 4) continue; // skip IATA codes — too many false positives
    const idx = lower.indexOf(key);
    if (idx === -1) continue;
    // whole-word match only
    const before = idx === 0 ? " " : lower[idx - 1];
    const after = lower[idx + key.length] ?? " ";
    if (/[a-z]/.test(before) || /[a-z]/.test(after)) continue;
    if (!hits.some((h) => h.airport.iata === airport.iata)) hits.push({ idx, airport });
  }

  return hits.sort((a, b) => a.idx - b.idx).map((h) => h.airport);
}

/**
 * Resolve a free-text city / IATA / alias to an airport record.
 */
export function resolveAirport(input) {
  if (!input || typeof input !== "string") return null;
  loadAirports();
  const q = input.trim().toLowerCase();
  if (q.length < 3) return null;

  if (_cache.byKey.has(q)) return _cache.byKey.get(q);

  // contains / startsWith fuzzy match
  for (const [key, airport] of _cache.byKey.entries()) {
    if (key.length >= 4 && (q.includes(key) || key.includes(q))) return airport;
  }
  return null;
}

/* ----------------------------------------------------------------
   Distance + pricing
---------------------------------------------------------------- */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

const AIRLINES = [
  { name: "IndiGo", code: "6E", mult: 1.0 },
  { name: "Air India", code: "AI", mult: 1.18 },
  { name: "SpiceJet", code: "SG", mult: 0.95 },
  { name: "Akasa Air", code: "QP", mult: 1.02 },
  { name: "Air India Express", code: "IX", mult: 0.9 },
];

function randTime() {
  const h = String(Math.floor(Math.random() * 24)).padStart(2, "0");
  const m = String(Math.floor(Math.random() * 12) * 5).padStart(2, "0");
  return `${h}:${m}`;
}


/**
 * Build a list of synthetic-but-plausible flights between two resolvable cities.
 * Fare is anchored to great-circle distance at a random ₹2.0–₹2.5 per km,
 * with no hidden fare multiplier. These are estimates, not live inventory.
 *
 * @returns {{ ok: boolean, error?: string, from?: object, to?: object, distanceKm?: number, flights?: object[] }}
 */
export function buildFlights(fromCityRaw, toCityRaw, count = 40) {
  const from = resolveAirport(fromCityRaw);
  const to = resolveAirport(toCityRaw);

  if (!from || !to) {
    return {
      ok: false,
      error: !from
        ? `No airport found for "${fromCityRaw}".`
        : `No airport found for "${toCityRaw}".`,
      unresolved: !from ? "from" : "to",
    };
  }
  if (from.iata === to.iata) {
    return { ok: false, error: "Origin and destination airports are the same." };
  }

  const distanceKm = Math.round(haversineKm(from, to));
  const flights = [];

  for (let i = 0; i < Math.min(100, Math.max(1, Math.floor(count))); i++) {
    const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
    const ratePerKm = +(2.0 + Math.random() * 0.5).toFixed(2); // ₹2.0–₹2.5 / km
    const time = randTime();

    const price = Math.round(distanceKm * ratePerKm);
    const nonstop = true;

    const cruiseKmph = 780;
    const flightHours = distanceKm / cruiseKmph + (nonstop ? 0.5 : 1.9);
    const h = Math.floor(flightHours);
    const m = Math.round((flightHours - h) * 60);

    flights.push({
      id: `flight-${from.iata}-${to.iata}-${i}`,
      airline: airline.name,
      currency: "INR",
      estimated: true,
      pricing_note: "Illustrative fare = great-circle km × ₹2.00–₹2.50/km. Route and availability require supplier confirmation.",
      flight_number: `${airline.code} ${100 + Math.floor(Math.random() * 899)}`,
      from: from.city,
      to: to.city,
      fromIata: from.iata,
      toIata: to.iata,
      distance_km: distanceKm,
      rate_per_km: ratePerKm,
      stops: nonstop ? 0 : 1,
      time,
      duration: `${h}h ${String(m).padStart(2, "0")}m`,
      price,
    });
  }

  return { ok: true, from, to, distanceKm, flights };
}
