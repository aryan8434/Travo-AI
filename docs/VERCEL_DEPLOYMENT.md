# TravoAI on Vercel

The repository root is linked to the `travo-ai-live` project. Vite builds the
frontend into `build/`; a Node.js function in `api/index.js` serves the existing
Express routes. `vercel.json` routes `/api`, `/chat`, `/auth`, `/user`, and
`/health` to the backend. Other website paths serve the frontend.

Vectra 0.15 loads `uuid` with CommonJS `require`, while its declared uuid 13
dependency is ESM-only. The scoped npm override uses uuid 11.1.1, which supports
the same v4 API and loads correctly in Vercel Functions. The deployment test
disables Node's synchronous ESM loading to cover this production incompatibility.

## Catalogue and AI

`scripts/buildVercel.mjs` creates a separate `.vercel-rag/` index at build time.
The index is included only in the server function, not public static assets.
Runtime search is read-only and does not start a background watcher. Guide
updates require a new deployment. The admin reindex endpoint returns an
explanatory HTTP 409 on this deployment. Local and AWS indexing remain writable.

Groq/Gemini chat calls remain server-side. Gemini embeddings are used when
configured and available; the existing compatible local fallback is preserved.
Secrets must never use the `VITE_` prefix. A same-origin deployment does not need
`VITE_API_URL`.

## Required configuration

Set these in Vercel for the environment being deployed:

- `MONGO_URI`: the persistent MongoDB connection string.
- `JWT_SECRET`: a random secret of at least 32 characters, stable across instances.
- `CORS_ORIGINS`: exact HTTPS website origins, comma-separated. The deployment's
  own `VERCEL_URL` is also allowed automatically.
- `RAZORPAY_MODE`: `live` (default) or `test`. Test mode is for demos: it accepts
  only `rzp_test_` keys, so no real money moves, marks every receipt as a test, and
  shows visitors Razorpay's test card and UPI details.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: a key pair matching the mode. Live mode
  needs fresh live credentials; the previously exposed key is rejected in either mode.
- `RAZORPAY_WEBHOOK_SECRET`: a separate random secret of at least 32 characters.
  Required in live mode; optional in test mode, where browser verification settles
  payments on its own.
- `LLM_PROVIDER`, `GROQ_API_KEY` / `GEMINI_API_KEY`, and optional model overrides.
- Optional `ADMIN_KEY` and `WEATHER_API_KEY`. Hotel search uses the stays named in the package catalogue and needs no key.

The Vercel configuration enables `RAG_READ_ONLY=1` and `NODE_ENV=production`.
The build script temporarily disables read-only mode for index generation.
Do not point the deployed index path to the local workstation or `/tmp`.

MongoDB stores session state and shared rate counters. Guest cookies use a
domain-separated key derived from `JWT_SECRET`, so instance changes do not
discard conversation identity. MongoDB needs to accept connections from the
deployment; verify network access with `/health/ready` after deployment.

## Deploy and verify

1. Run `npm test` and `npm run lint`.
2. Deploy a preview with `vercel deploy` from this repository root.
3. Verify the homepage/assets, `/health/ready`, package search, RAG search, chat,
   authentication, and authorization failures. Do not make a real charge as a test.
4. Deploy production with `vercel deploy --prod --skip-domain`, verify it, then
   promote the verified deployment with `vercel promote <deployment-url>`.
5. In Razorpay Live mode, configure the final production URL plus
   `/api/payments/webhook`, using the same webhook secret. Subscribe to
   `payment.captured`, `order.paid`, `refund.processed`, and
   `payment.dispute.created`.

The deployment upload excludes local environment files, temporary guide drafts,
test artifacts, local vector caches, and private key files. Vercel startup fails
closed if core configuration or MongoDB is unavailable. Missing payment credentials
disable checkout and webhook processing without blocking travel APIs. Live checkout
requires all three fresh live Razorpay credentials, including a separate webhook
secret; test mode needs only the `rzp_test_` key pair. The full production configuration audit still reports payment issues.
