# Live flight fares

Flight search shows live airline fares from [Duffel](https://duffel.com) when `DUFFEL_ACCESS_TOKEN` is set. Without it, everything works as before with distance-based estimates (great-circle km × ₹2.00–₹2.50).

## Setup

1. Create a Duffel account and an access token in the Duffel dashboard. A `duffel_test_` token works immediately but returns sandbox offers with made-up prices (mostly from Duffel's test airline). Live tokens need Duffel's account verification.
2. Put it in `.env` locally, and in the Vercel project's environment variables for deploys. Never commit it.

```
DUFFEL_ACCESS_TOKEN=duffel_test_...
```

## Behaviour

- **Chat:** a flight search needs a travel date for live fares ("28 Nov", "28/11", "tomorrow", "saturday"; parsed as an India calendar day by `utils/travelDate.js`). Without one, the assistant asks for it. The date is remembered for the rest of that flight conversation.
- **API:** `GET /api/flights?from=DEL&to=GOI&date=YYYY-MM-DD` returns `live: true` with offers, or estimates with a `live_error` reason. Without `date` it returns estimates, as before.
- **Flights page:** an optional date field switches from estimates to live fares.
- Only offers priced in INR are shown, cheapest first. Offers in other currencies are counted (`skipped_non_inr`), never converted.
- Results are cached in memory for five minutes per route, date, passenger count and cabin.
- If Duffel errors or times out, search falls back to estimates and says so.

## Not bookable

Live fares are shown, never charged. Issuing a ticket needs Duffel order creation with passenger details and payment to the airline, which the app does not do. `attachQuote` therefore marks live fares unbookable, and the card's button reads "Live fare · book with airline".

## Code

- `providers/flightProvider.js`: Duffel offer request (`Duffel-Version: v2`), offer → flight-card mapping, cache.
- `index.js`: chat flight flow and `/api/flights`.
- Tests mock Duffel; the response mapping was written against Duffel's documented offer fields and has not yet been run against a real token.
