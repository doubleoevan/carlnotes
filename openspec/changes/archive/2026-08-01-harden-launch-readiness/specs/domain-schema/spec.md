## ADDED Requirements

### Requirement: The Resource embedding column carries an HNSW cosine index

`resources.embedding` SHALL carry an HNSW index using the `vector_cosine_ops` operator class, so the near-duplicate lookup is an index walk rather than a sequential scan plus a full sort over the globally-scoped Resource table. pgvector supports HNSW up to 2000 dimensions and the column is 1024, so the column indexes without a width change. The index SHALL be created by a migration run after the embedding backfill has populated the column, since an index over a mostly-null column measures nothing.

#### Scenario: The nearest-neighbour lookup uses the index

- **WHEN** the near-duplicate query runs against a populated Resource table
- **THEN** its plan uses the HNSW index rather than a sequential scan and sort

#### Scenario: The index is created after the backfill

- **WHEN** the change's migrations are applied
- **THEN** the index migration runs after embeddings are populated, and creating it does not require altering the column's dimension

## MODIFIED Requirements

### Requirement: Scan records a per-stage cost breakdown

A Scan SHALL have a `stage_costs` jsonb column recording the dollar cost of each pipeline stage (at least ingestion, embedding, fetch, cheap scoring, and premium scoring). The existing `cost` column SHALL remain the total across every stage, so `stage_costs` is a breakdown of `cost`, not a replacement, and `cost` SHALL equal the sum of the buckets — ingestion included, since ingestion charges into the same Budget. `stage_costs` SHALL default to an empty object and be non-null. Because the column is `jsonb`, adding the ingestion bucket needs no migration.

#### Scenario: A scan records per-stage costs summing to its total

- **WHEN** a scan completes curation
- **THEN** its `stage_costs` holds each stage's dollar cost including `ingestion`, and its `cost` equals the sum of those buckets

#### Scenario: An ingestion-only scan records its ingestion bucket

- **WHEN** a scan finds no Resources to curate but its Sources charged for their searches
- **THEN** `stage_costs` holds the `ingestion` bucket and `cost` equals it
