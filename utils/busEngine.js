import { haversineKm, nearestAirportFor, resolveAirport } from "./flightEngine.js";

// No bus supplier is connected, so, like flights, buses are distance-based
// estimates: road km ≈ great-circle km × 1.3, priced per road km by coach type
// on fixed typical departures. They are not inventory and cannot be booked.
const ROAD_FACTOR = 1.3;
const AVG_KMPH = 50;
const MAX_ROAD_KM = 2000;
const RATE_PER_KM = {
  "Non-AC Seater": 1.1,
  "AC Seater": 1.5,
  "AC Sleeper": 2.0,
  "Volvo Multi-Axle AC Sleeper": 2.4,
};
const DEPARTURES = [
  ["06:15", "AC Seater"],
  ["08:30", "Non-AC Seater"],
  ["13:45", "AC Seater"],
  ["17:30", "Non-AC Seater"],
  ["20:15", "AC Sleeper"],
  ["21:45", "Volvo Multi-Axle AC Sleeper"],
  ["22:30", "AC Sleeper"],
  ["23:15", "Volvo Multi-Axle AC Sleeper"],
];

const titleCase = (s) => String(s).trim().replace(/\b\w/g, (c) => c.toUpperCase());

// Airport coordinates stand in for the city; smaller towns use their mapped airport.
function locate(name) {
  if (typeof name !== "string" || !name.trim()) return null;
  const airport = nearestAirportFor(name) || resolveAirport(name);
  return airport?.lat != null ? airport : null;
}

export function buildBuses(fromRaw, toRaw) {
  const from = locate(fromRaw);
  const to = locate(toRaw);
  if (!from || !to) {
    const missing = !from ? fromRaw : toRaw;
    return { ok: false, unresolved: !from ? "from" : "to", error: `I can't place "${missing}" on the map yet. Try a nearby major city.` };
  }
  const fromName = titleCase(fromRaw);
  const toName = titleCase(toRaw);
  if (from.iata === to.iata) {
    return { ok: false, error: `${fromName} and ${toName} are too close together for a fare estimate.` };
  }

  const roadKm = Math.round(haversineKm(from, to) * ROAD_FACTOR);
  if (roadKm > MAX_ROAD_KM) {
    return { ok: false, error: `${fromName} to ${toName} is about ${roadKm.toLocaleString("en-IN")} km by road, too long for a bus. Try flights instead.` };
  }
  const hours = roadKm / AVG_KMPH;
  const duration = `${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, "0")}m`;

  const buses = DEPARTURES.map(([time, busType], i) => ({
    id: `bus-${from.iata}-${to.iata}-${i}`,
    operator: busType,
    bus_type: "Estimate",
    from: fromName,
    to: toName,
    time,
    duration,
    distance_km: roadKm,
    rate_per_km: RATE_PER_KM[busType],
    price: Math.max(100, Math.round(roadKm * RATE_PER_KM[busType])),
    currency: "INR",
    estimated: true,
    pricing_note: `Illustrative fare = estimated road km (great-circle × ${ROAD_FACTOR}) × ₹${RATE_PER_KM[busType]}/km for this coach type. No live bus inventory is connected.`,
  }));

  return { ok: true, from: fromName, to: toName, roadKm, duration, buses };
}
