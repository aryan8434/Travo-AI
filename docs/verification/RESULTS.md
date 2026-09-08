# Verification — 8 September 2026

| Check | Result |
|---|---|
| `npm test` | 27 passing, 0 failing. Isolated MongoDB, local embeddings and injected gateway responses, including raw webhook signatures, duplicate settlement, refund review and estimate checkout prevention. |
| `npm run lint` | Passed without errors or warnings. |
| `npm run build` | Passed with Vite 8.2.2. Main application chunk 219.47 kB / 66.99 kB gzip; React, animation and feature chunks are separate. |
| Backend and frontend `npm audit` | 0 known vulnerabilities in either complete dependency tree, including development dependencies. JSON reports accompany this file. |
| `npm run validate:packages` | 137 records, no structural errors, one complete guide within 2,000–2,500 words. Eleven existing completed drafts are oversized; strict editorial validation intentionally fails until they are shortened. |
| Whitespace validation | `git diff --check` passed with CRLF-aware whitespace settings. |

Browser checks used the production build at `http://127.0.0.1:5055` through `tests/preview.mjs`. Its database and index are temporary; payment and other external API credentials are cleared.

- Home renders, navigation works and the browser reported no JavaScript errors during catalogue, flight and guide checks.
- The airport page lists 60 cities. Delhi–Mumbai calculates 1,137 km; all displayed fares equal the rounded distance multiplied by their displayed ₹2.00–₹2.50/km rate.
- Searching “Goa premium” returns the matching premium package. Its 2,257-word guide renders all 14 sections.
- “What is included in this package?” returns breakfast, the signature dinner, private transfers, guide and activity inclusions from the structured record, with a summary citation.
- The guide fits a 390 × 844 viewport without horizontal overflow (`scrollWidth = innerWidth = 390`). See `mobile-guide.png`.
- Browser signup succeeds with ₹0. An attempted ₹2,000 wallet deposit shows “Live payments are not configured on this server” and leaves the balance at ₹0. See `wallet-unavailable.png`.

The regression suite additionally covers signatures, order ownership, exact captured INR amounts, payment and wallet replay, concurrent settlement, cancellation, legacy-ledger blocking, quote tampering, chat isolation, filters before retrieval ranking, incompatible embedding spaces and INR-only hotel prices.

No live charge, production database migration or deployment was performed. Live gateway integration and Gemini provider responses require separate credentialed validation. Security setup and settlement/fulfilment limitations are recorded in [the security review](../SECURITY_REVIEW.md); unfinished guide writing is documented in [the content handoff](../../scripts/CONTENT_PIPELINE.md).

AWS preparation: `cfn-lint deploy/aws/instance.json` passes; PowerShell provisioning syntax and `bash -n deploy/aws/bootstrap.sh` pass. Release packaging succeeds and excludes credential files. Remote AWS validation and instance creation are pending an authenticated AWS profile. Docker Desktop was asked to start, but its server API did not respond, so a container image build has not been validated. The built frontend and Node API were tested independently as recorded above.
