## MODIFIED Requirements

### Requirement: The paid section runs under a bounded concurrency limit

The review SHALL run the paid fetch-and-scoring work for ranked survivors concurrently, bounded by an env-overridable
concurrency limit, instead of one Resource at a time. The limit SHALL be chosen deliberately and SHALL NOT be unbounded:
Firecrawl enforces per-plan concurrency, and a `429` falls back to the snippet, which would silently produce worse
Findings while appearing faster.

Per-Resource failure isolation SHALL be preserved under concurrency: one Resource's failure SHALL degrade only itself
and SHALL NOT abort the other running Resources or the Scan.

#### Scenario: Paid work runs concurrently up to the limit

- **WHEN** more ranked survivors remain than the concurrency limit
- **THEN** at most the limit's worth of fetch-and-score work runs at any moment, and the rest start as slots free

#### Scenario: The concurrency limit is env-overridable

- **WHEN** the environment sets the concurrency limit
- **THEN** the review uses that value instead of its default

#### Scenario: One Resource's failure does not abort the others

- **WHEN** a Resource's fetch or scoring throws while other Resources are running
- **THEN** that Resource is counted as failed, the running Resources continue, and the Scan is not failed

## ADDED Requirements

### Requirement: A per-Scan spend limit halts paid stages

The review SHALL enforce, before each Resource is dispatched into the paid fetch-and-scoring section, two per-Scan
limits: the existing USD spend limit, and a `MAX_SCORED_RESOURCES_PER_SCAN` count limit (env-overridable) on how many
Resources are sent through the paid section in the Scan. The count limit SHALL bound every Resource that enters the paid
section — whether its content was reused, revalidated, or freshly fetched — because scoring is paid in every case.

The USD limit is a **Scan-level** limit, not a review-level one: it is created before ingestion, ingestion spend charges
against it, and its configuration name SHALL name the Scan instead of review. The review therefore starts with whatever
ingestion already spent already counted.

What a Scan has spent SHALL be passed between stages as a value instead of accumulated in one object shared across them.
Ingestion returns what it spent, the review receives it and returns what it leaves behind, and the limit each stage
reads is the running total it was handed. A Scan's stages may run in separate processes, so a shared object mutated in
place would let the review start from zero and spend the limit twice.

Because the paid section runs under bounded concurrency and each limit is checked before dispatch instead of after
completion, both limits are **approximate**, not hard: up to `(concurrency - 1)` Resources may already be running when a
limit is reached, so the Scan may overshoot either limit by that many Resources. This overshoot is accepted. It costs a
few cents, and the USD limit is an in-memory advisory counter that defers work instead of throwing. The fetch-outcome
counts (`reused + revalidated + fetched`) SHALL therefore approximate, and MAY slightly exceed, the count limit.

Once either limit is reached, the review SHALL stop dispatching further paid work and leave the remaining Resources
unscored, left for a later Scan, without failing the Scan. The free stages that spend nothing — the hash dedupe, the
embedding dedupe, and the relevance comparison itself — SHALL NOT be truncated by either limit; embedding, which is
metered, SHALL defer past the USD limit as the embed-filter requirement states.

#### Scenario: A limit halts further paid work

- **WHEN** the Scan reaches either the USD limit or the `MAX_SCORED_RESOURCES_PER_SCAN` count mid-review
- **THEN** no further fetch, revalidation, or scoring work is dispatched for the remaining Resources

#### Scenario: The count limit halts paid work independent of spend

- **WHEN** the Scan's `reused + revalidated + fetched` count reaches `MAX_SCORED_RESOURCES_PER_SCAN` while the USD limit
  is not yet reached
- **THEN** the remaining survivors are deferred unscored, even though spend is under the dollar limit

#### Scenario: Ingestion spend counts against the same limit

- **WHEN** a Scan's ingestion charges enough to reach the USD limit before the review starts
- **THEN** the review dispatches no paid work and defers its candidates, because the limit it reads already includes
  ingestion spend

#### Scenario: Spend survives the boundary between stages

- **GIVEN** a Scan whose ingestion charged against the limit
- **WHEN** the review runs in a different process from the one that ingested
- **THEN** the review reads the total ingestion already spent, instead of starting from zero

#### Scenario: Running work may overshoot a limit

- **WHEN** a limit is reached while other Resources are already running under the concurrency limit
- **THEN** those running Resources finish and are counted, so the Scan may exceed the limit by up to `(concurrency - 1)`
  Resources, and this is not an error

#### Scenario: Unscored Resources wait for a later Scan and the Scan still succeeds

- **WHEN** a limit leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later
  Scan

#### Scenario: Free stages run regardless of the limits

- **WHEN** a limit has been reached
- **THEN** the dedupe and relevance-comparison stages still run for the Resources that already have embeddings, since
  they incur no metered spend

## REMOVED Requirements

### Requirement: A per-Scan spend cap halts paid stages

**Reason**: Its scenario "In-flight work may overshoot a limit" now says running work, and its name and scenarios say
limit.

**Migration**: The requirement moves to "A per-Scan spend limit halts paid stages", added above.
