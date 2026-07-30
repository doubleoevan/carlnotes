## Context

`reviewScan` in `worker/review.ts` walks `loadUnscoredResources` — a query with no `ORDER BY` — and runs each Resource through `runResourcePipeline` sequentially. That pipeline has seven stages: hash dedupe, embed, embedding dedupe, relevance gate, fetch, score, write Finding. Stages 1–4 are cheap; 5–6 are paid and gated by `canPay(budget)`, which stops the paid section once `budget.spent >= budget.cap` or `scoredCount(budget) >= budget.maxScoredResources`.

Three properties of that structure are the problem:

1. **Order is arbitrary.** `cosineSimilarity(embedding, topicContext.embedding)` is computed at stage 4 for every candidate and discarded after `isRelevant()` returns a boolean. The cap then takes whichever survivors came first from the database, not the best ones.
2. **It is serial.** Stage 5 is a Firecrawl fetch with a 30-second timeout; stage 6 is one or two model calls. Nothing overlaps, so a 25-Resource Scan is minutes of mostly-waiting.
3. **`summarizeScan` is called bare.** It runs at line 185, after `pruneTopicFindings`, i.e. after every Finding is upserted. A throw there propagates out of `reviewScan` and `processTopicScan` finalizes the Scan as `failed` — over Findings that are already in the database.

The order and concurrency fixes need the same restructure, so they ship together. The report-isolation fix is independent but lives in the same function and is one `try/catch`.

The current dedupe correctness rests on something subtle and easy to break: **loop order gives an implicit first-wins tiebreak.** Stage 1 writes `contentHash` to the row as the loop walks, and `hasStoredHash(hash, resource.id)` reads it back. Stage 2 writes each embedding to the row, and stage 3's `hasNearDuplicate(embedding, resource.id)` queries stored embeddings excluding only that Resource itself. So when the loop reaches the second member of a duplicate pair, the first member is already persisted and the second is dropped — exactly one survivor.

## Goals / Non-Goals

**Goals:**

- The Resources a Scan pays to score are its most relevant survivors, not its first.
- The paid section overlaps its network and model waits under a deliberate, bounded, env-overridable limit.
- A scan-report failure costs the report, not the Scan's Findings, its email, or its frequency window.
- Same-Scan duplicate sets still leave exactly one survivor, and which one is now deterministic.

**Non-Goals:**

- Changing the relevance threshold, the near-duplicate threshold, or the promotion threshold. Ranking reorders survivors; it does not change who survives.
- Making the per-Scan ceilings exact. They become approximate by design (see Decisions).
- Parallelizing the cheap pass. Embedding is fast and cheap; the win is in the paid section.
- Any schema, API, or UI change. This is `worker/review.ts` and its tests.
- Retrying a failed scan report. It is logged and skipped, not retried.

## Decisions

### Two passes, not one streaming loop

The loop becomes:

- **Pass 1 (cheap, every candidate):** embed each candidate — reusing `resource.embedding` when present — persist the embedding, and compute its similarity to the topic-context embedding. Drop the below-threshold ones as `filtered`. Emit the survivors as `{ resource, embedding, similarity }`.
- **Rank:** sort survivors by `similarity` descending.
- **Pass 2 (ranked, admission + paid work):** for each survivor in rank order, run the two dedupe checks, then dispatch the paid fetch-and-score work under the concurrency limit.

*Alternative considered:* keep one streaming loop and just sort `loadUnscoredResources` by a cheap proxy (recency, source). Rejected — the only signal that predicts what the cap should buy is the similarity, and that is not known until the candidate is embedded.

### Dedupe stays in the ranked pass, and "stored" stops meaning "admitted"

This is the subtle one, and getting it wrong is a silent quality regression: no failed Scan, nothing in the report, just fewer Findings.

Pass 1 persists an embedding for **every** candidate, including ones later deferred — embeddings are global to the Resource, and a deferred Resource must not need re-embedding next Scan. But that persistence means the naive two-pass has A finding B in the database and B finding A, so **both** drop.

The fix keeps both dedupe stages inside the ranked pass and splits the comparison in two:

- against **stored** Resources, `notInArray(resources.id, thisScanCandidateIds)` — so a sibling candidate's persisted row is invisible here, and
- against the hashes and embeddings of candidates **already admitted** in this Scan, held in memory.

Because the pass is ranked, the admitted member of any duplicate set is the highest-similarity one. That is deterministic, and strictly better than today's "whichever the database returned first."

`hasStoredHash` and `hasNearDuplicate` therefore change signature from an `excludeId: string` to an exclusion set. In-memory near-duplicate comparison against already-admitted candidates uses `cosineSimilarity` directly rather than a database round-trip, converted against the same `NEAR_DUPLICATE_DISTANCE` threshold the stored query uses, so the two paths agree.

### Bounded concurrency, hand-rolled, no new dependency

A small worker-pool helper: N workers pulling from a shared cursor over the ranked array, `await Promise.all(workers)`.

*Alternative considered:* `Promise.all` over the whole ranked list. Rejected outright — Firecrawl enforces per-plan concurrency and a 429 degrades to the snippet fallback, so an unbounded burst would appear faster while quietly producing worse Findings. That is the exact failure this design is trying to avoid elsewhere.

*Alternative considered:* `p-limit`. Rejected — the helper is a few lines, the repo prefers not adding a dependency for that, and a local helper is directly unit-testable against "never exceeds its limit."

The limit is a module constant read from the environment, matching how `REVIEW_SCAN_BUDGET_USD`, `MAX_SCORED_RESOURCES_PER_SCAN`, and `REVIEW_PROMOTION_THRESHOLD` already work. Default **4** — enough to hide most of a 30-second fetch behind other work, conservative against Firecrawl's per-plan limit, and safely under LiteLLM's concurrency.

### Both ceilings become approximate, and that is accepted

`canPay(budget)` is checked before dispatch, so up to `(concurrency - 1)` Resources can already be in flight when a ceiling trips. The Scan may overshoot both the USD ceiling and the scored-resource count by that many Resources.

Accepted, as specified: the overshoot is a few cents, and the USD ceiling is an in-memory advisory counter that defers work rather than throwing. The real spend ceiling is the owner's per-user LiteLLM key budget, which LiteLLM enforces atomically — an over-count here never becomes over-spend there.

The curation spec called the count a hard cap. It is reworded to an approximate ceiling under concurrency, and a scenario is added for the overshoot so a reader does not later read the drift as a bug.

*Alternative considered:* a post-dispatch reservation so ceilings stay exact. Rejected — it buys exactness worth cents at the cost of a reservation/refund path through the budget for every Resource.

### Report isolation is a `try/catch`, and only around the report

`summarizeScan` is wrapped; a throw is logged and yields `""`. `loadTopicContext` is deliberately **not** wrapped: without the topic embedding there is no relevance gate and nothing can be scored, so that Scan is genuinely broken and should fail.

The asymmetry is the point, and is worth a comment at the call site: one runs before any work and gates everything, the other runs after all the work is already durable.

## Risks / Trade-offs

- **Concurrency triggers Firecrawl 429s, silently degrading Findings to snippet-quality** → the limit is bounded, deliberate, defaults conservative at 4, and is env-overridable to drop to 1 without a deploy. The existing fetch-failure path already counts and reports the degradation.
- **The dedupe rework drops both members of a duplicate pair** → this is the specific regression the exclusion-set design exists to prevent, and it is covered by a direct offline test: two near-identical candidates in one Scan leave exactly one survivor, and it is the higher-scoring one.
- **Ranked order changes which Findings a Scan writes, so a Topic's feed shifts on the next Scan** → intended. The shift is toward more relevant Findings, and deferred Resources stay eligible for later Scans.
- **Ceiling overshoot surprises someone reading spend** → spec reworded, scenario added, and the overshoot is bounded by `(concurrency - 1)`.
- **Pass 1 now embeds every candidate before any paid work, so a Scan that would have hit its cap early still pays for every embedding** → this is already true today: the relevance gate embeds every candidate before the cap applies, and stage 4 runs regardless. No new spend.
- **A silently-empty scan summary hides a recurring report failure** → the failure is logged with the scan id, and an empty summary is already a rendered state in the UI ("Carl is still reading…" / placeholder copy), so it degrades visibly rather than looking normal.

## Migration Plan

No schema change and no data migration. Deploy is a worker restart.

Rollback is reverting the commit; nothing persisted by the new code is shaped differently from what the old code writes — embeddings, content hashes, and Findings all keep their existing columns and semantics. A Scan written by the new code is readable by the old code and vice versa.

The concurrency limit is the one operational knob: set it to `1` to get today's serial behavior back without a deploy, if Firecrawl 429s show up in the fetch-outcome counts.

## Open Questions

None blocking. The two decisions that could have been open — accepting ceiling overshoot, and preserving winner-takes-one dedupe with the highest-similarity winner — are settled and specified.
