## ADDED Requirements

### Requirement: The paid section is ordered by relevance, not discovery order

Curation SHALL rank the embed-filter survivors by their cosine similarity to the topic-context embedding, descending, and SHALL send them into the paid fetch-and-scoring section in that order. The similarity is the value the embed-filter already computes for every candidate before any cap applies; curation SHALL retain it rather than discard it after the threshold compare. When a per-Scan ceiling defers the remainder, the Resources that were scored SHALL therefore be the most relevant survivors of the Scan rather than whichever the database returned first.

Ranking SHALL NOT change which Resources pass the relevance threshold, only the order in which the survivors are bought.

#### Scenario: The most relevant survivors are scored when a ceiling defers the rest

- **WHEN** a Scan produces more embed-filter survivors than a per-Scan ceiling allows into the paid section
- **THEN** the survivors sent through the paid section are the highest-similarity ones, and the lower-similarity remainder is deferred unscored

#### Scenario: A low-similarity Resource discovered first does not displace a better one

- **WHEN** a survivor at 0.36 similarity is returned by the database before a survivor at 0.98, and the ceiling admits only one
- **THEN** the 0.98 survivor is scored and the 0.36 survivor is deferred

#### Scenario: Ranking does not change the relevance gate

- **WHEN** curation ranks the survivors
- **THEN** exactly the Resources that met the relevance threshold are ranked, and no Resource below the threshold enters the ranking

### Requirement: The paid section runs under a bounded concurrency limit

Curation SHALL run the paid fetch-and-scoring work for ranked survivors concurrently, bounded by an env-overridable concurrency limit, rather than one Resource at a time. The limit SHALL be chosen deliberately and SHALL NOT be unbounded: Firecrawl enforces per-plan concurrency, and a `429` degrades to the snippet fallback, which would silently produce worse Findings while appearing faster.

Per-Resource failure isolation SHALL be preserved under concurrency: one Resource's failure SHALL degrade only itself and SHALL NOT abort the other in-flight Resources or the Scan.

#### Scenario: Paid work runs concurrently up to the limit

- **WHEN** more ranked survivors remain than the concurrency limit
- **THEN** at most the limit's worth of fetch-and-score work is in flight at any moment, and the rest start as slots free

#### Scenario: The concurrency limit is env-overridable

- **WHEN** the environment sets the concurrency limit
- **THEN** curation uses that value instead of its default

#### Scenario: One Resource's failure does not abort the others

- **WHEN** a Resource's fetch or scoring throws while other Resources are in flight
- **THEN** that Resource is counted as failed, the in-flight Resources continue, and the Scan is not failed

### Requirement: Same-Scan dedupe leaves exactly one survivor, the highest-similarity one

Curation's two dedupe stages SHALL remain inside the ranked pass and SHALL distinguish "already stored" from "already admitted in this Scan". For each candidate, the content-hash check and the near-duplicate check SHALL compare against both:

- stored Resources, **excluding this Scan's own candidate ids**, and
- the content hashes and embeddings of candidates already admitted earlier in this Scan, held in memory.

For any set of duplicate or near-duplicate candidates within one Scan, exactly one SHALL survive, and because the pass is ranked, the survivor SHALL be the highest-similarity member. Curation SHALL NOT drop every member of a duplicate set.

Pass 1 SHALL still embed and persist an embedding for every candidate, including ones later deferred, because embeddings are global to the Resource and a deferred Resource must not need re-embedding on the next Scan. Persisting an embedding SHALL NOT by itself mark a candidate as admitted.

#### Scenario: Two near-identical candidates in one Scan leave one survivor

- **WHEN** two candidates in the same Scan are within the near-duplicate threshold of each other
- **THEN** exactly one is admitted and the other is dropped as filtered — never both dropped

#### Scenario: The surviving member is the higher-scoring one

- **WHEN** two near-duplicate candidates in the same Scan have different similarities to the topic context
- **THEN** the higher-similarity candidate is the one admitted

#### Scenario: A candidate is not treated as its own stored duplicate

- **WHEN** pass 1 has persisted embeddings for every candidate and the ranked pass then checks a candidate for near-duplicates
- **THEN** the stored-Resource comparison excludes this Scan's candidate ids, so a candidate is not dropped against its own persisted row or against a not-yet-admitted sibling

#### Scenario: A deferred candidate keeps its embedding

- **WHEN** a candidate is embedded in pass 1 and then deferred by a per-Scan ceiling
- **THEN** its embedding is persisted and a later Scan reuses it rather than re-embedding it

### Requirement: A scan-report failure does not fail the Scan

Curation SHALL isolate the scan-report call. The report runs after every Finding for the Scan has already been upserted, so a failure there SHALL be logged, SHALL leave `scans.scan_summary` empty, and SHALL let the Scan close as `succeeded` carrying the Findings it already wrote.

Curation SHALL NOT isolate the topic-context load the same way: without the topic embedding there is no relevance gate and nothing can be scored, so a failure there SHALL continue to fail the Scan.

#### Scenario: A thrown scan report still yields a succeeded Scan with its Findings

- **WHEN** the scan-report call throws after the Scan's Findings have been written
- **THEN** the failure is logged, `scan_summary` is empty, and the Scan closes as `succeeded` with its Findings intact

#### Scenario: A succeeded Scan with an empty summary still emails

- **WHEN** a Scan succeeds with Findings but an empty `scan_summary`
- **THEN** the scheduled email still sends, because only a `succeeded` Scan emails and this Scan succeeded

#### Scenario: A topic-context failure still fails the Scan

- **WHEN** loading or embedding the topic's effective context throws
- **THEN** the Scan is marked `failed`, because no Resource could have been gated or scored

## MODIFIED Requirements

### Requirement: A per-Scan spend cap halts paid stages

Curation SHALL enforce, before each Resource is dispatched into the paid fetch-and-scoring section, two per-Scan ceilings: the existing USD spend ceiling, and a `MAX_SCORED_RESOURCES_PER_SCAN` count ceiling (env-overridable) on how many Resources are sent through the paid section in the Scan. The count ceiling SHALL bound every Resource that enters the paid section — whether its content was reused, revalidated, or freshly fetched — because scoring is paid in every case.

Because the paid section runs under bounded concurrency and each ceiling is checked before dispatch rather than after completion, both ceilings are **approximate**, not hard: up to `(concurrency - 1)` Resources may already be in flight when a ceiling is reached, so the Scan may overshoot either ceiling by that many Resources. This overshoot is accepted. It costs a few cents, and the USD ceiling is an in-memory advisory counter that defers work rather than throwing. The fetch-outcome counts (`reused + revalidated + fetched`) SHALL therefore approximate, and MAY slightly exceed, the count ceiling.

Once either ceiling is reached, curation SHALL stop dispatching further paid work and leave the remaining Resources unscored — carried to a later Scan — without failing the Scan. The cheap embed and embed-filter stages SHALL NOT be truncated by either cap.

#### Scenario: The cap halts further paid work

- **WHEN** the Scan reaches either the USD ceiling or the `MAX_SCORED_RESOURCES_PER_SCAN` count mid-curation
- **THEN** no further fetch, revalidation, or scoring work is dispatched for the remaining Resources

#### Scenario: The count cap halts paid work independent of spend

- **WHEN** the Scan's `reused + revalidated + fetched` count reaches `MAX_SCORED_RESOURCES_PER_SCAN` while the USD ceiling is not yet reached
- **THEN** the remaining survivors are deferred unscored, even though spend is under the dollar ceiling

#### Scenario: In-flight work may overshoot a ceiling

- **WHEN** a ceiling is reached while other Resources are already in flight under the concurrency limit
- **THEN** those in-flight Resources finish and are counted, so the Scan may exceed the ceiling by up to `(concurrency - 1)` Resources, and this is not an error

#### Scenario: Unscored Resources are carried and the Scan still succeeds

- **WHEN** a cap leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later Scan

#### Scenario: Cheap stages run regardless of the cap

- **WHEN** a cap has been reached
- **THEN** the embed and embed-filter stages still run for the remaining Resources, since they incur no metered LLM/fetch spend

### Requirement: Embedding dedupe drops near-duplicates

Curation SHALL drop, as a filtered duplicate, a Resource whose embedding is within a cosine near-duplicate threshold of an already-admitted Resource's embedding — either a Resource stored by an earlier Scan, or a candidate already admitted earlier in this Scan. A Resource that is not within the threshold of any such embedding SHALL proceed.

The stored-Resource comparison SHALL exclude this Scan's own candidate ids, so that a candidate is never dropped against a sibling candidate that has been embedded but not yet admitted. Within one Scan, this leaves exactly one member of a near-duplicate set standing rather than dropping every member.

#### Scenario: A near-duplicate is dropped

- **WHEN** a Resource's embedding is within the near-duplicate threshold of an already-admitted Resource's embedding
- **THEN** the Resource is dropped as filtered and produces no Finding

#### Scenario: A distinct Resource proceeds

- **WHEN** a Resource's embedding is outside the near-duplicate threshold of every already-admitted embedding
- **THEN** the Resource proceeds to the embed-filter

#### Scenario: Sibling candidates do not mutually annihilate

- **WHEN** two candidates in the same Scan are near-duplicates of each other and both have persisted embeddings
- **THEN** the stored comparison excludes this Scan's candidates, so the first-ranked one is admitted and only the second is dropped

### Requirement: Content-hash dedupe drops content-level duplicates

Curation SHALL compute a content hash (SHA-256 over the Resource's normalized title and native snippet) and persist it to `resources.content_hash`. A Resource whose content hash matches that of an already-admitted Resource — stored by an earlier Scan, or admitted earlier in this Scan — SHALL be dropped as a filtered duplicate and SHALL NOT be scored. The stored-Resource comparison SHALL exclude this Scan's own candidate ids, for the same reason as embedding dedupe: a candidate must not be dropped against a sibling that has not yet been admitted. This content-level dedupe is distinct from the canonical-URL dedupe ingestion already performs.

#### Scenario: Content-identical Resource at a different URL is dropped

- **WHEN** a Resource's content hash equals that of an already-admitted Resource with a different canonical URL
- **THEN** the duplicate is dropped as filtered, produces no Finding, and the original stands

#### Scenario: The content hash is persisted

- **WHEN** curation processes a Resource
- **THEN** its `content_hash` is written so later Scans can dedupe against it

#### Scenario: Sibling candidates sharing a hash leave one survivor

- **WHEN** two candidates in the same Scan share a content hash
- **THEN** the first-ranked one is admitted and the second is dropped, never both

### Requirement: The Scan records per-stage cost and curation counts

On close, curation SHALL record each stage's dollar cost in `scans.stage_costs` (keyed at least by embedding, fetch, cheap scoring, and premium scoring) and set `scans.cost` to the total across ingestion and curation. It SHALL set `kept_count` to the number of Findings written and `filtered_count` to the number of Resources dropped by hash dedupe, embedding dedupe, or the embed-filter, and SHALL write the scan report to `scans.scan_summary`. It SHALL also record the fetch-outcome counts to `scans.reused`, `scans.revalidated`, and `scans.fetched` — the number of Resources whose content was reused within the TTL, revalidated via a `304`, or freshly fetched — whose sum equals the number of Resources sent through the paid fetch-and-scoring section.

The scan report SHALL be a dated markdown note grounded only in the Scan's actual data — the kept Findings' titles, urls, scores, and relevance explanations; drop, deferral, and failure counts with their causes; per-Source outcomes including fallback degradations; and costs. It SHALL cover, when the data supports each: a dated headline; insights and trends drawn across the kept items' relevance explanations; adds and drops with reasoning; sources consulted and skipped with reasoning; data-hygiene actions taken; list and threshold status against a target the topic context itself states; a closing notification decision (send or suppress) with rationale; and a cited-sources list of markdown links to the kept items. A Scan with nothing to review MAY leave `scan_summary` empty, and a Scan whose report call failed SHALL leave it empty rather than failing.

#### Scenario: Per-stage costs are recorded and summed into the total

- **WHEN** a Scan completes curation
- **THEN** `stage_costs` holds each stage's dollar cost and `cost` equals the sum of ingestion cost and every curation stage cost

#### Scenario: Kept and filtered counts are recorded

- **WHEN** curation finishes
- **THEN** `kept_count` equals the number of Findings written and `filtered_count` equals the number of Resources dropped by dedupe or the embed-filter

#### Scenario: Fetch-outcome counts are recorded

- **WHEN** curation finishes
- **THEN** `scans.reused`, `scans.revalidated`, and `scans.fetched` hold the per-outcome tallies and their sum equals the number of Resources sent through the paid fetch-and-scoring section

#### Scenario: The scan report is written and grounded

- **WHEN** curation finishes reviewing at least one Resource and the report call succeeds
- **THEN** `scan_summary` holds a non-empty dated markdown report that cites only items, sources, and numbers from the Scan's data, with markdown links to the kept items

#### Scenario: A failed report leaves the summary empty without failing the Scan

- **WHEN** the scan-report call throws
- **THEN** `scan_summary` is empty, the failure is logged, and the Scan still records its costs, counts, and Findings as `succeeded`

#### Scenario: The report records a notification decision

- **WHEN** the scan report is written
- **THEN** its body ends with an explicit send-or-suppress notification recommendation and the rationale, and no notification is actually dispatched by curation
