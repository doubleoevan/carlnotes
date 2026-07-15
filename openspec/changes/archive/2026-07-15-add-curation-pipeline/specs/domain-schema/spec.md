## ADDED Requirements

### Requirement: Resource carries a native snippet and fetched content

A Resource SHALL have a nullable `snippet` column holding the adapter-native text (the description/selftext/highlights the Source's own API returns) and a nullable `content` column holding the full page content fetched during curation. Both are pipeline-filled and MAY be null at ingestion: an adapter populates `snippet` and leaves `content` unset; curation fills `content` when it fetches a survivor. Neither column is required for a Resource row to be valid.

#### Scenario: Ingestion inserts with a snippet and no content

- **WHEN** an adapter emits a Resource
- **THEN** the row is valid with `snippet` set to the adapter-native text and `content` null

#### Scenario: Curation stores fetched content

- **WHEN** curation fetches a survivor's page
- **THEN** the row stores the fetched full content in `content`, leaving `snippet` intact

### Requirement: Scan records a per-stage cost breakdown

A Scan SHALL have a `stage_costs` jsonb column recording the dollar cost of each pipeline stage (at least embedding, fetch, cheap scoring, and premium scoring). The existing `cost` column SHALL remain the total across every stage, so `stage_costs` is a breakdown of `cost`, not a replacement. `stage_costs` SHALL default to an empty object and be non-null.

#### Scenario: A scan records per-stage costs summing to its total

- **WHEN** a scan completes curation
- **THEN** its `stage_costs` holds each stage's dollar cost and its `cost` equals the sum of those stage costs plus ingestion cost

#### Scenario: An ingestion-only scan has an empty breakdown

- **WHEN** a scan finds no Resources to curate
- **THEN** `stage_costs` is an empty object and `cost` is the ingestion cost
