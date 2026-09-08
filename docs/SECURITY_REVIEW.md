# Security review — 8 September 2026

## Fixed paths

| Finding | Fix |
|---|---|
| ₹1 payments credited arbitrary full-value wallets; automatic test verification | Removed both paths. Live-only captured payments must exactly match the stored order amount and INR currency. |
| Live key exposed in tracked Git history | Removed from current executable source/build; SHA-256 fingerprint block rejects that key. Provider-side revocation is still required. |
| Unauthenticated orders, ownership bypass, replay and concurrent settlement | Authenticated, owner-bound persistent orders; one atomic update consumes an order and applies credit/booking. Repeat verification returns the saved result. |
| Client-controlled booking prices and browser-only financial records | Catalogue lookup or signed expiring quote; server account is authoritative. Browser display state carries no authority. |
| Free signup funds and a public seeded demo account | New accounts receive ₹0. Removed seeding/default credentials; disabled the old demo login. Legacy ledgers cannot spend, accept deposits or cancel until reconciled. |
| Wallet debit/refund races | Atomic conditional updates protect balances and cancellation status. UUID booking requests are idempotent. |
| Guessable/shared chat identifiers and object injection into session queries | Ignore caller-provided session IDs. Signed HttpOnly guest cookies or authenticated user identity choose the session. Bound in-memory caches. |
| Weak auth config and unbounded password inputs | Required 32+ character JWT secret, restricted algorithm/issuer/audience, validated string inputs and bcrypt byte limit. |
| Permissive trust-proxy behaviour, disabled CSP and long-lived HTML caching | Explicit proxy trust; CSP for actual app/gateway origins; immutable hashed assets and revalidated HTML. |
| Credentials on an HTTP weather request and unrestricted network waits | HTTPS and bounded provider timeouts. External-origin frontend requests strip account credentials. |
| Outdated dependencies | Updated backend packages and frontend Vite/React plugin. Final npm audit covers both dependency trees. |
| RAG filters bypassed through vector union or empty-result fallbacks | Metadata filters precede ranking; no results outside the selected hard constraints. |
| Incompatible fallback vectors, stale model cache and duplicate force reindex | Actual model metadata per vector, separate cache namespaces, compatible-space comparison and deterministic IDs with atomic index commits. |

## Verification and limits

Automated tests use an isolated MongoDB and injected gateway responses. They exercise forged signatures, ownership, amount/currency/status mismatches, parallel settlement, wallet replay, cancellation races, catalogue constraints, vector compatibility, indexing and flight formulas. Browser checks cover the built React UI and offline package answers. No live payments, deployment or production data migration were performed.

The existing source tree contained 11 long-form guide edits outside the requested 2,000–2,500-word limit. Their text was preserved and the validator reports them for editorial review.

## Required operational work

1. Revoke the historical live Razorpay key in the provider dashboard, rotate any credentials copied with it, and deploy fresh environment variables. Deleting a string from current source does not revoke it or erase Git history.
2. Audit pre-fix accounts against actual full-amount captured payments, then reconcile wallet balances and booking records before explicitly enabling ledger version 2. Do not blindly relabel legacy balances. Reset or remove obsolete plaintext/demo account records through an audited migration.
3. Connect supplier inventory and fulfilment before treating reservations as travel tickets. Signed captured-payment webhooks now share atomic settlement with browser verification. Configure the live webhook endpoint and its secret. Refund/dispute notifications freeze affected accounts for manual reconciliation; this is not a complete settlement back office. Computed estimates and unconnected supplier rates cannot receive payable quotes, and generated hotel/bus inventory is hidden in production.
4. Enable HTTPS, set exact trusted proxy addresses, configure restricted CORS origins and strong secrets, and back up MongoDB. This review is not a claim that the application has no remaining vulnerabilities.

## Primary references

- [Razorpay standard integration and signature verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Razorpay integration security checklist](https://security.razorpay.com/security/checklist/)
- [Google embedding model deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
