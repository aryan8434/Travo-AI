import { BoundedMap } from '../utils/boundedMap.js';

/**
 * Live flight fares from Duffel (https://duffel.com), read-only.
 *
 * Configured by DUFFEL_ACCESS_TOKEN. A `duffel_test_` token returns sandbox
 * offers with made-up prices; a live token returns real airline fares. Results
 * are shown, never charged: booking would need Duffel order creation with
 * passenger details, which this app does not do. Every result is labelled live
 * and stays unbookable in checkout (see attachQuote).
 */
const OFFER_REQUESTS = 'https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=10000';
const CACHE_TTL_MS = 5 * 60 * 1000; // fares move; five minutes keeps repeat searches cheap without going stale
const cache = new BoundedMap(500, CACHE_TTL_MS);

const token = () => process.env.DUFFEL_ACCESS_TOKEN || '';
export const liveFlightsConfigured = () => Boolean(token());
export const liveFlightsTestMode = () => token().startsWith('duffel_test_');
export function clearLiveFlightCache() { for (const key of [...cache.keys()]) cache.delete(key); }

// ISO 8601 duration ("PT2H40M", "P1DT3H") -> "2h 40m"
export function isoDuration(value) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value || '');
  if (!m || value === 'P') return null;
  const hours = Number(m[1] || 0) * 24 + Number(m[2] || 0);
  return `${hours}h ${String(Number(m[3] || 0)).padStart(2, '0')}m`;
}
// Duffel gives local airport times without an offset ("2026-11-28T18:35:00"): keep the clock as is.
const clock = (iso) => /T(\d{2}:\d{2})/.exec(iso || '')?.[1] || null;

/** One Duffel offer -> the flight shape the chat cards and curator already use. */
export function mapOffer(offer, { fromCity, toCity, testMode, fetchedAt }) {
  const slice = offer?.slices?.[0];
  const segments = slice?.segments || [];
  const first = segments[0], last = segments.at(-1);
  const price = Number(offer?.total_amount);
  if (!first || !last || !Number.isFinite(price) || price <= 0) return null;
  const carrier = first.marketing_carrier || first.operating_carrier || offer.owner || {};
  return {
    id: `duffel-${offer.id}`,
    offer_id: offer.id,
    airline: offer.owner?.name || carrier.name || 'Airline',
    flight_number: `${carrier.iata_code || ''} ${first.marketing_carrier_flight_number || ''}`.trim(),
    from: fromCity || first.origin?.iata_code,
    to: toCity || last.destination?.iata_code,
    fromIata: first.origin?.iata_code,
    toIata: last.destination?.iata_code,
    time: clock(first.departing_at),
    arrival_time: clock(last.arriving_at),
    departing_at: first.departing_at,
    duration: isoDuration(slice.duration),
    stops: segments.length - 1,
    price: Math.round(price),
    price_exact: price,
    currency: offer.total_currency,
    live: true,
    estimated: false,
    test_mode: testMode,
    fetched_at: fetchedAt,
    expires_at: offer.expires_at || null,
    pricing_note: testMode
      ? 'Duffel test-mode fare: sandbox data, not a real price.'
      : 'Live airline fare via Duffel, taxes included. Fares change; confirm with the airline before paying.',
  };
}

/**
 * Search one-way economy fares. Returns INR offers sorted by price, cheapest first.
 * Offers priced in another currency are counted, not converted.
 */
export async function searchLiveFlights({ from, to, date, adults = 1, cabin = 'economy', fromCity, toCity }, { fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  if (!liveFlightsConfigured()) throw new Error('Live flight search is not configured');
  if (!/^[A-Z]{3}$/.test(from || '') || !/^[A-Z]{3}$/.test(to || '') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !(adults >= 1 && adults <= 9)) throw new Error('Invalid live flight search');
  const key = [from, to, date, adults, cabin].join('|');
  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };

  const response = await fetchImpl(OFFER_REQUESTS, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token()}`, 'Duffel-Version': 'v2', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data: { slices: [{ origin: from, destination: to, departure_date: date }], passengers: Array.from({ length: adults }, () => ({ type: 'adult' })), cabin_class: cabin } }),
  });
  if (!response.ok) throw new Error(`Live flight provider HTTP ${response.status}`);
  const offers = (await response.json())?.data?.offers || [];
  const fetchedAt = now().toISOString();
  const testMode = liveFlightsTestMode();
  const mapped = offers.map((o) => mapOffer(o, { fromCity, toCity, testMode, fetchedAt })).filter(Boolean);
  const flights = mapped.filter((f) => f.currency === 'INR').sort((a, b) => a.price - b.price);
  const result = { flights, fetched_at: fetchedAt, test_mode: testMode, total_offers: offers.length, skipped_non_inr: mapped.length - flights.length };
  cache.set(key, result);
  return { ...result, cached: false };
}
