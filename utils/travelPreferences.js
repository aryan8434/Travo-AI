export function parseTravelPreferences(text = '') {
  const lower = text.toLowerCase();
  const money = '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(lakh|lakhs|lac|lacs|k|l)?';
  const value = (n, suffix) => Math.round(Number(n.replaceAll(',', '')) * (/^l/.test(suffix || '') ? 100000 : suffix === 'k' ? 1000 : 1));
  const range = lower.match(new RegExp(`${money}\\s*(?:to|and|-)\\s*(?:₹|rs\\.?\\s*)?${money}\\b`));
  const single = lower.match(new RegExp(`(?:under|below|budget(?: of)?|up to|upto|within|for)\\s*(?:₹|rs\\.?\\s*)?${money}\\b`)) || lower.match(new RegExp(`^\\s*(?:₹|rs\\.?\\s*)?${money}\\s*$`));
  const people = lower.match(/\b(\d+)\s*(?:people|travellers|travelers|guests|persons|adults)\b/);
  return {
    ...(people ? { people: Number(people[1]) } : {}),
    ...(range ? { budgetMin: value(range[1], range[2]), budgetMax: value(range[3], range[4]) } : single ? { budgetMax: value(single[1], single[2]) } : {}),
    ...(/\b(luxury|opulent)\b/.test(lower) ? { budgetTier: 'luxury' } : /\b(premium|comfortable|mid.?range)\b/.test(lower) ? { budgetTier: 'premium' } : /\b(economical|cheap|backpacking)\b/.test(lower) ? { budgetTier: 'economical' } : {}),
  };
}

/**
 * Ordering the traveller asked for in words. Prices live in structured fields, so
 * "cheapest Goa package" is answered by sorting rows, not by embedding similarity.
 * @returns {'price_asc' | 'price_desc' | 'rating_desc' | null}
 */
export function parseSortIntent(text = '') {
  const lower = String(text).toLowerCase();
  if (/\b(cheapest|lowest[- ]priced?|least expensive|most affordable|lowest price|lowest cost)\b/.test(lower)) return 'price_asc';
  if (/\b(most expensive|priciest|costliest|highest[- ]priced?|highest price|highest cost)\b/.test(lower)) return 'price_desc';
  if (/\b(top[- ]rated|best[- ]rated|highest[- ]rated|highest rating)\b/.test(lower)) return 'rating_desc';
  return null;
}
