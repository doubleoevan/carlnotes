## Why

The paid section of `reviewScan` picks the Resources it scores by database order rather than by relevance, so a 0.36-similarity Resource that comes back first beats a 0.98 that comes back twenty-sixth, and the better one is deferred unscored. That same section runs one Resource at a time behind a 30-second Firecrawl fetch and one or two model calls, which is why a 25-Resource Scan takes several minutes. And a throw from the scan-report call — which runs *after* every Finding is already written — marks the whole Scan `failed`, so the Topic shows a failure notice over Findings that exist, the scheduled email never sends, and the frequency window is spent anyway.

## What Changes

- **Rank the paid section by relevance.** The relevance gate already computes `cosineSimilarity` against the Topic's context embedding for every candidate and throws it away after the boolean compare. Keep that similarity, sort the survivors by it descending, and let the per-Scan cap take the top N instead of the first N.
- **Restructure the review loop into two passes.** Pass 1 embeds and gates every candidate. Pass 2 ranks the survivors, then buys the top N. Ranking and concurrency both require this, so they ship together.
- **Run the paid section with bounded concurrency.** Fetch-and-score work dispatches concurrently under a deliberate, env-overridable limit rather than serially or via an unbounded `Promise.all`. Firecrawl enforces per-plan concurrency and a 429 currently degrades to the snippet fallback, which would silently produce worse Findings while appearing faster.
- **BREAKING (spec wording, not behavior contract): both per-Scan ceilings become approximate.** `canPay` is checked before dispatch, so up to `(concurrency - 1)` Resources may overshoot the USD ceiling and the scored-resource count. The overshoot is accepted and costs a few cents, because the USD ceiling is an in-memory advisory counter that defers work rather than throwing. The curation spec currently calls the count a hard cap and is reworded to an approximate ceiling under concurrency.
- **Preserve winner-takes-one dedupe, and make the winner deterministic.** Today both dedupe stages depend on loop order and get an implicit first-wins tiebreak from persisted state, so exactly one member of a duplicate pair survives. A naive two-pass breaks that: embedding every candidate before any near-duplicate check means A finds B and B finds A and *both* drop — a silent quality regression with no failed Scan and nothing in the report. Both dedupe stages stay inside the ranked pass, comparing each candidate against stored Resources *excluding this Scan's candidate ids* plus the hashes and embeddings of candidates already admitted this Scan, held in memory. Since the pass is now ranked, the surviving member is the highest-similarity one rather than whichever the database returned first.
- **Isolate the scan report from the Scan's outcome.** A throw from `summarizeScan` is logged, leaves the scan summary empty, and lets the Scan succeed with the Findings it already wrote. `loadTopicContext` keeps failing the Scan, because without the Topic embedding there is no relevance gate and nothing can be scored — that Scan really is broken.

## Capabilities

### New Capabilities

None. This changes how an existing capability behaves, not what the system can do.

### Modified Capabilities

- `curation`: the paid section is ordered by relevance rather than database order; it runs under bounded concurrency; the two per-Scan ceilings become approximate rather than hard; same-Scan dedupe is stated explicitly as winner-takes-one with the highest-similarity member surviving; and a scan-report failure no longer fails the Scan.

## Impact

- `worker/review.ts` — `reviewScan` is restructured into two passes; `loadUnscoredResources`, `runResourcePipeline`, `hasStoredHash`, and `hasNearDuplicate` change shape to carry similarity and to exclude this Scan's candidates; `summarizeScan`'s call site gains failure isolation. New pure helpers for ranking and for bounded concurrency.
- `worker/review.test.ts` — new offline tests for ranking, concurrency bounds, ceiling halting, same-Scan dedupe survivorship, and report-failure isolation.
- Environment — one new env-overridable concurrency limit alongside the existing `REVIEW_SCAN_BUDGET_USD` and `MAX_SCORED_RESOURCES_PER_SCAN`; `.env.example` and the README's environment section follow.
- No schema change, no API change, no UI change. Scan wall-clock drops and the Findings a Scan keeps get better, both without a migration.
