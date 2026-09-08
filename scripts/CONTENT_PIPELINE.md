# Holiday guide handoff

The catalogue has 129 generated package records (43 destinations × 3 tiers), plus 8 legacy records. Each generated JSON file contains one package in an array. One reference guide, `data/packages/generated/india/goa-premium.json`, is 2,257 words. Eleven pre-existing drafts are over 2,500 words; their writing is preserved and `npm run validate:packages` lists them for trimming.

## Generate the remaining writing jobs

```bash
npm run content:jobs -- ./content-jobs.jsonl
```

This exports one JSONL record per remaining skeleton, with the full structured context, a model-independent writing prompt and the ingestion command. Feed the prompt to whichever economical AI agent you choose. This script makes no paid model calls.

Write each result to its own Markdown file. Keep every `##` heading in the original order, use only the supplied catalogue facts, and keep the whole document at **2,000–2,500 whitespace-separated words, including headings**. All money is in INR. The section budgets total 2,300 prose words, leaving room for headings. The itinerary receives 550 words in total, even for a long trip.

Do not alter IDs, prices, tier labels, guest capacity or structured itineraries. Do not invent bookings, availability, phone numbers, safety assurances or supplier inclusions. General travel advice must be phrased as planning guidance rather than a verified supplier promise.

## Validate and ingest each result

```bash
npm run ingest:guide -- PKG-DARJEELING-ECO ./darjeeling.md
```

The importer checks the package ID, exact heading order and the 2,000–2,500-word limit before writing anything. It updates only `detailed_guide`, `content_status` and `word_count`, writes the source file atomically, and rebuilds the changed vectors. Submit imports sequentially: the local Vectra store is intended for a single writer. Multiple writing agents may produce independent Markdown files in parallel.

Direct file edits are detected by the running server within approximately five seconds. Use the importer for its validation. Ingestion on the same machine as a running server should be performed during a maintenance window or with the server stopped, to keep one Vectra writer.

```bash
npm run validate:packages          # integrity plus editorial report
npm run validate:packages -- --strict  # also fail on oversized completed guides
npm run reindex                   # catch up after an offline batch
npm run reindex -- --force         # replace every vector without duplicates
```

`npm run generate:packages` refreshes skeletons deterministically and preserves completed or other non-skeleton records. Do not run it while an agent is directly editing a skeleton JSON file. Guide passage retrieval excludes the placeholder instructions; structured summary records remain searchable before the long guide is ready.

## Embeddings

Set `GEMINI_API_KEY` for the configurable `gemini-embedding-001` provider. Use `EMBEDDING_PROVIDER=local` for a completely offline run. Provider failures fall back to local vectors with their actual model recorded. Model caches are separated; queries never compare a Gemini vector with a local vector. A forced rebuild can upgrade fallback chunks after provider access is restored.
