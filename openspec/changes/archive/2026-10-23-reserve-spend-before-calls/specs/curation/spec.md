## MODIFIED Requirements

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

The USD limit SHALL be bounded within an attempt: before a Resource enters the paid section, its largest cost at the
fetch and scoring rates SHALL be reserved inside the Scan's budget, as the spend-reservations capability states, and a
Resource SHALL be deferred once the spent and reserved dollars reach the limit, so the Resources running under the
concurrency limit pass the limit by at most one Resource's largest cost. The count limit stays a check before
dispatch, so the fetch-outcome counts (`reused + revalidated + fetched`) MAY exceed it by up to `(concurrency - 1)`.

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

- **WHEN** the count limit is reached while other Resources are already running under the concurrency limit
- **THEN** those running Resources finish and are counted, so the Scan may exceed the count limit by up to
  `(concurrency - 1)` Resources, and this is not an error, while the USD limit is passed by at most one Resource's
  largest cost because each running Resource reserved its maximum before it started

#### Scenario: Unscored Resources wait for a later Scan and the Scan still succeeds

- **WHEN** a limit leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later
  Scan

#### Scenario: Free stages run regardless of the limits

- **WHEN** a limit has been reached
- **THEN** the dedupe and relevance-comparison stages still run for the Resources that already have embeddings, since
  they incur no metered spend
