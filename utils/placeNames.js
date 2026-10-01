import { knownAirportPlaces } from "./flightEngine.js";
import { loadAllPackages } from "./ragEngine.js";

let known;

// lower-case name -> display name, for every place a search can resolve.
function places() {
  if (known) return known;
  known = new Map();
  const add = (name) => {
    if (typeof name === "string" && name.trim() && !known.has(name.toLowerCase())) known.set(name.toLowerCase(), name.trim());
  };
  knownAirportPlaces().forEach(add);
  for (const p of loadAllPackages()) [p.destination, p.state, p.country].forEach(add);
  return known;
}

// Optimal string alignment distance (insert, delete, substitute, swap
// neighbours), giving up once every alignment exceeds `max`.
function editDistance(a, b, max) {
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], prev2[j - 2] + 1);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * The known place a typed name most likely meant ("jaipuir" -> "Jaipur"),
 * or null when it is already known, too short to judge, or nothing is close.
 * Allows one typo up to six letters and two beyond.
 */
export function autocorrectPlace(raw) {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (key.length < 5 || places().has(key)) return null;
  const max = key.length <= 6 ? 1 : 2;
  let best = null;
  for (const [candidate, display] of places()) {
    if (Math.abs(candidate.length - key.length) > max) continue;
    const d = editDistance(key, candidate, max);
    if (d <= max && (!best || d < best.d)) best = { d, display };
  }
  return best?.display ?? null;
}
