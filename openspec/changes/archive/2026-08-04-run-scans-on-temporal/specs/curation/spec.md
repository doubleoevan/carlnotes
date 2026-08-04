## MODIFIED Requirements

### Requirement: A per-Scan spend cap halts paid stages

Curation SHALL enforce, before each Resource is dispatched into the paid fetch-and-scoring section, two per-Scan ceilings: the existing USD spend ceiling, and a `MAX_SCORED_RESOURCES_PER_SCAN` count ceiling (env-overridable) on how many Resources are sent through the paid section in the Scan. The count ceiling SHALL bound every Resource that enters the paid section — whether its content was reused, revalidated, or freshly fetched — because scoring is paid in every case.

The USD ceiling is a **Scan-level** ceiling, not a review-level one: it is created before ingestion, ingestion spend charges against it, and its configuration name SHALL name the Scan rather than review. Curation therefore starts with whatever ingestion already spent already counted.

What a Scan has spent SHALL be carried between stages as a value rather than accumulated in one object shared across them. Ingestion returns what it spent, curation receives it and returns what it leaves behind, and the ceiling each stage reads is the running total it was handed. A Scan's stages may run in separate processes, so a shared object mutated in place would let curation start from zero and spend the ceiling twice.

Because the paid section runs under bounded concurrency and each ceiling is checked before dispatch rather than after completion, both ceilings are **approximate**, not hard: up to `(concurrency - 1)` Resources may already be in flight when a ceiling is reached, so the Scan may overshoot either ceiling by that many Resources. This overshoot is accepted. It costs a few cents, and the USD ceiling is an in-memory advisory counter that defers work rather than throwing. The fetch-outcome counts (`reused + revalidated + fetched`) SHALL therefore approximate, and MAY slightly exceed, the count ceiling.

Once either ceiling is reached, curation SHALL stop dispatching further paid work and leave the remaining Resources unscored — carried to a later Scan — without failing the Scan. The free stages that spend nothing — the hash dedupe, the embedding dedupe, and the relevance comparison itself — SHALL NOT be truncated by either cap; embedding, which is metered, SHALL defer past the USD ceiling as the embed-filter requirement states.

#### Scenario: The cap halts further paid work

- **WHEN** the Scan reaches either the USD ceiling or the `MAX_SCORED_RESOURCES_PER_SCAN` count mid-curation
- **THEN** no further fetch, revalidation, or scoring work is dispatched for the remaining Resources

#### Scenario: The count cap halts paid work independent of spend

- **WHEN** the Scan's `reused + revalidated + fetched` count reaches `MAX_SCORED_RESOURCES_PER_SCAN` while the USD ceiling is not yet reached
- **THEN** the remaining survivors are deferred unscored, even though spend is under the dollar ceiling

#### Scenario: Ingestion spend counts against the same ceiling

- **WHEN** a Scan's ingestion charges enough to reach the USD ceiling before curation starts
- **THEN** curation dispatches no paid work and defers its candidates, because the ceiling it reads already includes ingestion spend

#### Scenario: Spend survives the boundary between stages

- **GIVEN** a Scan whose ingestion charged against the ceiling
- **WHEN** curation runs in a different process from the one that ingested
- **THEN** curation reads the total ingestion already spent, rather than starting from zero

#### Scenario: In-flight work may overshoot a ceiling

- **WHEN** a ceiling is reached while other Resources are already in flight under the concurrency limit
- **THEN** those in-flight Resources finish and are counted, so the Scan may exceed the ceiling by up to `(concurrency - 1)` Resources, and this is not an error

#### Scenario: Unscored Resources are carried and the Scan still succeeds

- **WHEN** a cap leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later Scan

#### Scenario: Free stages run regardless of the cap

- **WHEN** a cap has been reached
- **THEN** the dedupe and relevance-comparison stages still run for the Resources that already carry embeddings, since they incur no metered spend
