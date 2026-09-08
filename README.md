# TravoAI

A React and Express travel planner with a searchable holiday catalogue, grounded package answers, Indian flight-distance estimates, and INR checkout.

## Run locally

Use Node.js 22.12+ and MongoDB. Commands run from the repository root:

```bash
npm ci
npm --prefix frontend ci
# Copy .env.example to .env and fill the required values.
npm run build
npm start
```

The built app is served on http://127.0.0.1:5000. For frontend development run `npm --prefix frontend run dev` alongside the backend. Vite proxies API requests to port 5000. Set `HOST=0.0.0.0` only when you want to bind beyond localhost; use HTTPS in production. Set `TRUST_PROXY` to the actual trusted proxy IP/subnet when deploying behind a reverse proxy.

## Holiday packages and RAG

- 137 catalogue records across economical, premium and luxury tiers, spanning ₹10,000–₹5,00,000.
- A complete **2,257-word Goa premium guide** is the reference sample. Other records contain structured itineraries and guide skeletons; eleven pre-existing long drafts exceed the requested limit and are reported by the validator.
- JSON files are the source of truth. Vectra stores one structured summary plus overlapping 350-word guide passages with 60-word overlap and source identifiers. Skeleton instructions are excluded from guide passage retrieval.
- Files are checked for additions, edits and deletions every five seconds while the server runs. Index writes are incremental and atomic; `--force` replaces records without duplicating them.
- Optional Gemini `gemini-embedding-001` embeddings. `text-embedding-004` has been retired. Set `GEMINI_EMBED_MODEL` to choose another supported text model. Without a key, on an outage, or with `EMBEDDING_PROVIDER=local`, deterministic local embeddings keep retrieval working.
- Every stored vector records its actual model. Incompatible vector spaces are never compared. Matching-model dense similarity and BM25 rank only candidates that meet budget, location, tier and guest-count constraints.
- Inclusion, price and season questions use structured package facts with a summary citation. Other questions pass retrieved passages to the configured chat model with numbered sources. If the model is unavailable, the response contains source excerpts. Catalogue prices always determine checkout amounts.

```bash
npm run generate:packages
npm run validate:packages
npm run validate:packages -- --strict
npm run ingest:guide -- PKG-GOA-PRE ./guide.md
npm run reindex
npm run reindex -- --force
```

See [the content handoff](scripts/CONTENT_PIPELINE.md) for the other writing agents. The default validator checks catalogue integrity and reports editorial issues; `--strict` also fails on completed guides outside 2,000–2,500 words.

## Flights

The Flight Distances page lists 60 Indian airport cities and supports city names, aliases and IATA codes. Fare estimates are exactly `Math.round(distance_km * rate_per_km)`, where the rate is randomly selected from ₹2.00–₹2.50. Delhi–Mumbai is approximately 1,137 km in this dataset. These are estimates; routes, schedules, supplier availability and taxes are not provided by a live airline inventory API.

## Payments and existing accounts

Payments are **live-only and full-amount in INR**. Both a fresh live Razorpay key pair and MongoDB are required. Test keys, absent keys, simulated signatures and the known Git-exposed live key fail closed. No ₹1 confirmation shortcut or automatic test settlement exists.

Checkout requires an authenticated account. Package prices are read from the catalogue; other search prices are carried in server-signed, expiring quotes. Orders are saved against their owner. Only an exact INR payment with valid HMAC and `captured` status can settle an order. Settlement and the wallet credit or booking write occur atomically, making retries idempotent. Wallet debits and cancellation refunds are also atomic. Browser storage cannot mint funds or confirmed bookings. Interrupted verification can be recovered on the next signed-in page load in the same browser tab.

New accounts start at ₹0 with ledger version 2. The old public demo login is disabled. Existing pre-fix accounts require reconciliation of their wallet and booking balances against actual captured payments before their ledger can be enabled; the application blocks financial writes on these legacy balances. No existing database balances were silently rewritten.

Receipts show the amount actually paid. Supplier ticket issuance and a supplier tax invoice are separate; the app does not fabricate airline PNRs. Cancellation refunds use the existing time-based policy and credit the application wallet, not the original payment method. Payment capture must be enabled in your Razorpay account; an authorized-but-uncaptured payment is rejected until captured and retried.

Captured-payment webhooks now settle orders even if the customer closes the browser. Configure `/api/payments/webhook` with a separate `RAZORPAY_WEBHOOK_SECRET`. Raw-body signatures are verified; duplicate browser/webhook confirmations share the same atomic settlement. Refund/dispute notifications freeze financial activity for manual reconciliation.

Production startup fails if public HTTPS origins, fresh live payment keys, a webhook secret or persistent MongoDB storage are missing. Run `npm run check:production` to report configuration issues without printing secrets. Generated hotel/bus inventory is hidden in production; computed flights and unconnected supplier rates cannot be purchased.

**Before production:** revoke the live key exposed in Git, configure fresh keys and the webhook endpoint, reconcile legacy balances, and arrange supplier inventory/fulfilment and manual refund/chargeback reconciliation. No live charge was made during development. See [security findings](docs/SECURITY_REVIEW.md).

## AWS hosting

[AWS deployment instructions](deploy/aws/README.md) include an EC2 CloudFormation template, Docker build, HTTPS proxy, SSM-based secret loading and PowerShell provisioning script. `node scripts/packageRelease.mjs` produces a credential-free source archive under `.artifacts/aws`. The deployment script prepares a change set by default; `-Execute` provisions it in an explicitly identified AWS account. No instance has been created from this workspace yet.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/packages` | Search and paginate; query, city, category, tier, budgetMin/Max, people, page |
| `GET /api/packages/:id` | Full package and guide |
| `POST /api/packages/ask` | Grounded answer; query and optional package_id, tier, budgetMax |
| `GET /api/airports` | Indian airport cities |
| `GET /api/flights?from=DEL&to=BOM` | Distance and fare estimates |
| `POST /chat` | Travel search and questions with isolated conversation state |
| `GET /api/rag/stats`, `/facets`, `/chunks`, `/chunk` | Inspect the retrieval corpus |
| `POST /api/rag/search` | Chunk retrieval with sources and scores |
| `POST /api/admin/reindex` | Admin-key-protected index rebuild |
| `POST /auth/signup`, `/auth/login` | Password-hashed authentication |
| `GET /user/me` | Server wallet, bookings and history |
| `POST /api/create-order`, `/api/verify-payment` | Owned payment order and atomic settlement |
| `POST /api/payments/webhook` | Signed gateway settlement/refund/dispute notifications |
| `GET /health/live`, `/health/ready` | Process and persistent-storage readiness |
| `POST /user/book`, `/user/bookings/cancel` | Atomic wallet booking / cancellation |

## Verification

```bash
npm test
npm run lint
npm run build
npm audit
npm --prefix frontend audit
node tests/preview.mjs
```

Tests use an isolated temporary MongoDB and fake gateway responses, without calling Razorpay. The browser fixture serves the built UI on port 5055 with an isolated database and all external API/payment credentials cleared. It has no automatic payment success mode.

See [verification results](docs/verification/RESULTS.md) for the completed checks and remaining validation limits.
