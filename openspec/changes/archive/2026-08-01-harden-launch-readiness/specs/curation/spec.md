## MODIFIED Requirements

### Requirement: Embedding dedupe drops near-duplicates

Curation SHALL drop, as a filtered duplicate, a Resource whose embedding is within a cosine near-duplicate threshold of an already-admitted Resource's embedding — either a Resource stored by an earlier Scan, or a candidate already admitted earlier in this Scan. A Resource that is not within the threshold of any such embedding SHALL proceed.

The stored-Resource lookup SHALL be served by the HNSW index on `resources.embedding` and SHALL push the near-duplicate threshold into SQL as a distance predicate, so the database prunes at the gate instead of ranking the corpus and filtering in application code. Because the candidate's own row and its same-Scan siblings are its nearest neighbours, excluding them SHALL NOT be expressed as a SQL filter over an approximate index scan — that exclusion can consume the whole index walk and report no duplicate for a Resource that has one. The query SHALL instead request enough neighbours to cover this Scan's candidates and the caller SHALL drop its own ids from that bounded result. Within one Scan, this leaves exactly one member of a near-duplicate set standing rather than dropping every member.

The lookup is therefore **approximate**: an index walk MAY miss a true nearest neighbour, so an occasional duplicate MAY be admitted. This is accepted for a duplicate gate at this threshold — the content-hash stage and the in-memory sibling check run first, and the gate is a quality measure, not a correctness invariant.

#### Scenario: A near-duplicate is dropped

- **WHEN** a Resource's embedding is within the near-duplicate threshold of an already-admitted Resource's embedding
- **THEN** the Resource is dropped as filtered and produces no Finding

#### Scenario: A distinct Resource proceeds

- **WHEN** a Resource's embedding is outside the near-duplicate threshold of every already-admitted embedding
- **THEN** the Resource proceeds to the embed-filter

#### Scenario: Sibling candidates do not mutually annihilate

- **WHEN** two candidates in the same Scan are near-duplicates of each other and both have persisted embeddings
- **THEN** this Scan's candidates are dropped from the neighbour result, so the first-ranked one is admitted and only the second is dropped

#### Scenario: The threshold is applied by the database

- **WHEN** the stored-Resource lookup runs
- **THEN** the query carries the distance threshold as a predicate and orders by distance under a bounded limit, so no full corpus sort is performed and the query plan uses the embedding index

### Requirement: Embed-filter gates paid stages on topic-context relevance

Curation SHALL embed the topic's effective context (`topicScanContext` — the topic's own `context` merged with its attachments' `context`) and drop, as filtered, any Resource whose cosine similarity to that context embedding is below the relevance threshold. This gate SHALL run before either paid stage (Firecrawl fetch, LLM scoring), so a Resource that fails it incurs no fetch or scoring spend — only the cheap embedding the gate itself required. When the topic's effective context is empty, the filter SHALL fall back to embedding the topic `name`, mirroring the search ingester.

Embedding is metered spend, so the gate SHALL check the Scan's spend ceiling before embedding each candidate and SHALL mark a candidate reached past the ceiling as **deferred**, not filtered — it keeps no embedding and stays eligible for a later Scan. A Scan that discovers an unusually large payload therefore cannot embed and charge for every Resource before the ceiling is consulted.

#### Scenario: A below-threshold Resource is filtered before any paid stage

- **WHEN** a Resource's similarity to the topic-context embedding is below the relevance threshold
- **THEN** it is dropped as filtered and no Firecrawl fetch or scoring call is made for it (its embedding already ran, for the gate)

#### Scenario: An above-threshold Resource proceeds to fetch and scoring

- **WHEN** a Resource's similarity to the topic-context embedding is at or above the threshold
- **THEN** it proceeds to the fetch stage

#### Scenario: Empty effective context falls back to the topic name

- **WHEN** the topic's effective context is empty
- **THEN** the embed-filter compares against the embedding of the topic `name` rather than an empty context

#### Scenario: The ceiling defers embedding rather than charging past it

- **WHEN** the Scan's spend ceiling is already reached and further candidates remain unembedded
- **THEN** those candidates are counted as deferred, no embedding call is made or charged for them, and they stay eligible for a later Scan

### Requirement: A per-Scan spend cap halts paid stages

Curation SHALL enforce, before each Resource is dispatched into the paid fetch-and-scoring section, two per-Scan ceilings: the existing USD spend ceiling, and a `MAX_SCORED_RESOURCES_PER_SCAN` count ceiling (env-overridable) on how many Resources are sent through the paid section in the Scan. The count ceiling SHALL bound every Resource that enters the paid section — whether its content was reused, revalidated, or freshly fetched — because scoring is paid in every case.

The USD ceiling is a **Scan-level** ceiling, not a review-level one: it is created before ingestion, ingestion spend charges against it, and its configuration name SHALL name the Scan rather than review. Curation therefore starts with whatever ingestion already spent already counted.

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

#### Scenario: In-flight work may overshoot a ceiling

- **WHEN** a ceiling is reached while other Resources are already in flight under the concurrency limit
- **THEN** those in-flight Resources finish and are counted, so the Scan may exceed the ceiling by up to `(concurrency - 1)` Resources, and this is not an error

#### Scenario: Unscored Resources are carried and the Scan still succeeds

- **WHEN** a cap leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later Scan

#### Scenario: Free stages run regardless of the cap

- **WHEN** a cap has been reached
- **THEN** the dedupe and relevance-comparison stages still run for the Resources that already carry embeddings, since they incur no metered spend

### Requirement: The Scan records per-stage cost and curation counts

On close, curation SHALL record each stage's dollar cost in `scans.stage_costs` (keyed at least by ingestion, embedding, fetch, cheap scoring, and premium scoring) and set `scans.cost` to the Scan Budget's total, which already includes ingestion because ingestion charges into the same Budget. `scans.cost` SHALL NOT be composed by summing a separately tracked ingestion number with a review total. It SHALL set `kept_count` to the number of Findings written and `filtered_count` to the number of Resources dropped by hash dedupe, embedding dedupe, the embed-filter, or the content scanner, and SHALL write the scan report to `scans.scan_summary`. It SHALL also record the fetch-outcome counts to `scans.reused`, `scans.revalidated`, and `scans.fetched` — the number of Resources whose content was reused within the TTL, revalidated via a `304`, or freshly fetched — whose sum equals the number of Resources sent through the paid fetch-and-scoring section.

The scan report SHALL be a dated note grounded only in the Scan's actual data — the kept Findings' titles, urls, scores, and relevance explanations; drop, deferral, and failure counts with their causes; per-Source outcomes including fallback modes; and costs. It SHALL cover, when the data supports each: a dated headline; insights and trends drawn across the kept items' relevance explanations; adds and drops with reasoning; sources consulted and skipped with reasoning; data-hygiene actions taken; list and threshold status against a target the topic context itself states; a closing notification decision (send or suppress) with rationale; and a cited-sources list of markdown links to the kept items using their exact stored urls. Because the report renders through a hardened markdown subset whose links are allowlisted to the kept Findings' urls, the prompt MAY ask for light formatting and for links to the kept items, but SHALL instruct that any other link, image, or HTML renders as inert text. A Scan with nothing to review MAY leave `scan_summary` empty, and a Scan whose report call failed SHALL leave it empty rather than failing.

#### Scenario: Per-stage costs are recorded and the total is the Budget's

- **WHEN** a Scan completes curation
- **THEN** `stage_costs` holds each stage's dollar cost including the ingestion bucket, and `cost` is the Scan Budget's own total rather than a separately summed figure

#### Scenario: Kept and filtered counts are recorded

- **WHEN** curation finishes
- **THEN** `kept_count` equals the number of Findings written and `filtered_count` equals the number of Resources dropped by dedupe, the embed-filter, or the scanner

#### Scenario: Fetch-outcome counts are recorded

- **WHEN** curation finishes
- **THEN** `scans.reused`, `scans.revalidated`, and `scans.fetched` hold the per-outcome tallies and their sum equals the number of Resources sent through the paid fetch-and-scoring section

#### Scenario: The scan report is written, grounded, and cites only kept items

- **WHEN** curation finishes reviewing at least one Resource and the report call succeeds
- **THEN** `scan_summary` holds a non-empty dated report that cites only items, sources, and numbers from the Scan's data, linking kept items by their exact stored urls and linking nowhere else

#### Scenario: A failed report leaves the summary empty without failing the Scan

- **WHEN** the scan-report call throws
- **THEN** `scan_summary` is empty, the failure is logged, and the Scan still records its costs, counts, and Findings as `succeeded`

#### Scenario: The report records a notification decision

- **WHEN** the scan report is written
- **THEN** its body ends with an explicit send-or-suppress notification recommendation and the rationale, and no notification is actually dispatched by curation

## ADDED Requirements

### Requirement: Fetched content is scanned before it is scored

Curation SHALL pass a Resource's fetched content through the scanner's source-content layer before any scoring call reads it. Content the scanner flags SHALL drop the Resource as filtered under its own scanner drop reason, counted with the other drop causes and named in the report, and SHALL NOT be scored or stored as the basis of a Finding. A scanner that is unset, unreachable, or timing out SHALL leave the content unflagged and the Scan unaffected.

#### Scenario: Flagged content produces no Finding

- **WHEN** the scanner flags a fetched page's content
- **THEN** no scoring call is made for that Resource, no Finding is written, and the drop is counted under the scanner reason

#### Scenario: Unflagged content scores normally

- **WHEN** the scanner returns no detection for a fetched page
- **THEN** scoring proceeds exactly as it does today
