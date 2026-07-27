## ADDED Requirements

### Requirement: Resource records content freshness and revalidation validators

A Resource SHALL record when its content was last fetched in a non-null `fetched_at` timestamp (defaulting to row creation) that drives content-reuse decisions, and SHALL carry two nullable text columns, `etag` and `last_modified`, holding the origin validators captured at fetch time for conditional revalidation. Both validator columns MAY be null — at ingestion, and whenever a fetch does not expose them — and a null validator SHALL simply mean revalidation is skipped for that Resource. Neither validator column is required for a Resource row to be valid.

#### Scenario: Ingestion leaves validators null and fetched_at at creation

- **WHEN** an adapter first ingests a Resource
- **THEN** the row is valid with `etag` and `last_modified` null and `fetched_at` defaulted to the row's creation time

#### Scenario: A fetch that exposes validators stores them

- **WHEN** curation fetches a Resource and the response exposes an `etag` or `last_modified`
- **THEN** the row stores those validators and refreshes `fetched_at`

#### Scenario: Null validators are valid and skip revalidation

- **WHEN** a Resource has `content` but neither `etag` nor `last_modified`
- **THEN** the row is valid and curation performs no conditional GET for it

### Requirement: Scan records fetch-outcome counts

A Scan SHALL carry three non-null integer columns — `reused`, `revalidated`, and `fetched` — each defaulting to 0, recording how many of the Scan's Resources had their content reused within the TTL, revalidated via a `304`, or freshly fetched. Their sum SHALL equal the number of Resources the Scan sent through the paid fetch-and-scoring section. The columns are additive to the existing Scan counts and do not replace `kept_count` or `filtered_count`.

#### Scenario: An ingestion-only Scan has zero fetch-outcome counts

- **WHEN** a Scan finds no Resources to send through the paid section
- **THEN** `reused`, `revalidated`, and `fetched` are all 0

#### Scenario: The counts default to zero

- **WHEN** a Scan row is inserted without specifying the fetch-outcome counts
- **THEN** `reused`, `revalidated`, and `fetched` are each 0

### Requirement: The change includes the fetch-reuse migration

The change SHALL include a generated Drizzle migration that adds nullable `etag` and `last_modified` to `resources` and the non-null-defaulted `reused`, `revalidated`, and `fetched` integer columns to `scans`. Applying it to a database at the current schema MUST succeed without altering any other table, and MUST require no backfill — existing `resources` read as null validators and existing `scans` as zero counts.

#### Scenario: The migration is additive and backfill-free

- **WHEN** the generated migration is applied to a database at the current schema
- **THEN** only `resources.etag`, `resources.last_modified`, and the `scans.reused`/`scans.revalidated`/`scans.fetched` columns are added, no other table is altered, and no data backfill is needed
