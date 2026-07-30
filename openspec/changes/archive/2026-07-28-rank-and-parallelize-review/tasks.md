## 1. Pure helpers and their tests

- [x] 1.1 Add the ranking helper in `worker/review.ts`: take the pass-1 survivors as `{ resource, embedding, similarity }` and return them sorted by `similarity` descending. Export it for testing.
- [x] 1.2 Add the bounded-concurrency helper in `worker/review.ts`: N workers pulling from a shared cursor over an array, awaiting all of them. Export it for testing.
- [x] 1.3 Add the concurrency limit as an env-overridable module constant beside `MAX_SCORED_RESOURCES_PER_SCAN`, defaulting to 4, with a comment naming the Firecrawl per-plan reason for keeping it bounded.
- [x] 1.4 Test the ranking helper orders survivors by similarity descending and that truncating to the cap keeps the top N.
- [x] 1.5 Test the concurrency helper never exceeds its limit, using a counter that tracks in-flight work and records the observed maximum.

## 2. Same-Scan dedupe

- [x] 2.1 Change `hasStoredHash` to take an exclusion set of this Scan's candidate ids instead of a single `excludeId`, using `notInArray`.
- [x] 2.2 Change `hasNearDuplicate` the same way, so the stored-embedding query excludes every candidate of this Scan rather than only the Resource itself.
- [x] 2.3 Add the in-memory admitted-candidate checks: a `Set` of admitted content hashes and an array of admitted embeddings, compared with `cosineSimilarity` against the same near-duplicate threshold the stored query uses.
- [x] 2.4 Test that two near-identical candidates in one Scan leave exactly one survivor, and that the survivor is the higher-similarity one.
- [x] 2.5 Test that two candidates sharing a content hash in one Scan leave exactly one survivor.

## 3. Restructure reviewScan into two passes

- [x] 3.1 Extract pass 1: embed each candidate (reusing an existing `resource.embedding`), persist the embedding, compute similarity to the topic context, drop below-threshold candidates as `filtered`, and return the survivors carrying their embedding and similarity.
- [x] 3.2 Rank the pass-1 survivors with the helper from 1.1.
- [x] 3.3 Extract pass 2: for each ranked survivor run the two dedupe checks from group 2, then the paid fetch-and-score work, keeping per-Resource failure isolation so one Resource's throw only degrades itself.
- [x] 3.4 Dispatch pass 2's paid work through the concurrency helper, checking `canPay(budget)` before each dispatch so a reached ceiling stops further dispatch.
- [x] 3.5 Rewire `reviewScan` to call pass 1, rank, then pass 2, and confirm `trackOutcomes` still folds every outcome into the review outcome exactly once.
- [x] 3.6 Test that the ceiling check halts dispatch once either the USD ceiling or the scored-resource count is reached.

## 4. Isolate the scan report

- [x] 4.1 Wrap the `summarizeScan` call in `reviewScan` so a throw is logged with the scan id and yields an empty summary, leaving the Scan to close as succeeded with its Findings.
- [x] 4.2 Leave `loadTopicContext` unwrapped and comment the asymmetry at the call site: one gates all work, the other runs after every Finding is already durable.
- [x] 4.3 Test that a thrown scan-report call yields a succeeded Scan carrying its Findings with an empty summary.

## 5. Documentation and verification

- [x] 5.1 Add the concurrency limit to `.env.example`, matching how the existing review knobs are documented. The README has no environment section — every review knob (`REVIEW_SCAN_BUDGET_USD`, `MAX_SCORED_RESOURCES_PER_SCAN`, `CONTENT_TTL_MS`) lives only in `.env.example`, and the README defers to it, so that is the whole surface. `MAX_SCORED_RESOURCES_PER_SCAN`'s comment was also reworded from "hard cap" to an approximate ceiling.
- [x] 5.2 Run the verification gate: `bunx biome check .`, `bunx tsc -b`, and `bun test`. All green, 135/135 tests, `preflight green`.
- [x] 5.3 Run a real Scan against a topic with more candidates than the scored-resource ceiling, and confirm from the Scan row that wall-clock dropped, that the kept Findings are the higher-scoring survivors, and that the fetch-outcome counts overshoot the ceiling by no more than `(concurrency - 1)`. Built `worker/rank-concurrency.smoke.ts` (wired up as `bun run smoke:review`) and ran it twice cold against a 30-candidate feed with the ceiling at 8. Serial took 149.0s, concurrency 4 took 57.4s — 2.6× faster for identical work (30 found, 8 kept, 10 filtered, 8 fetched, ~$0.024 each). Both bought the same 8 Resources, with the worst purchase at 0.4492 similarity outranking the best skipped at 0.4380 and zero unexplained ranking violations. Observed overshoot was 0 in both, inside the allowed 3 — the bound holds but was not stress-tested, since the ceiling never tripped mid-dispatch here.
