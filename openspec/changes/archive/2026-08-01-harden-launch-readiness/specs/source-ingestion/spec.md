## MODIFIED Requirements

### Requirement: Scan records found count and cost

`runTopicScan` SHALL create a Scan in status `running`, and on completion record `found_count` (the number of deduped Resources discovered across all Sources), set `finished_at`, and mark the Scan `succeeded`. Ingestion SHALL NOT set `kept_count`, `filtered_count`, or `ai_summary` — those belong to curation.

The Scan's Budget SHALL be created before ingestion runs, and each Source's ingester cost SHALL charge into that Budget's `ingestion` bucket — zero for the ingesters that use no paid API. `scans.cost` SHALL be the Budget's total, so ingestion spend is inside the same object and the same ceiling the paid curation stages read, rather than a number summed alongside them at close.

#### Scenario: Counts and cost are recorded on success

- **WHEN** a scan completes with its Sources having emitted Resources
- **THEN** the Scan's `found_count` equals the count of deduped Resources discovered, its `cost` equals the Budget total including the ingestion bucket, `finished_at` is set, and its status is `succeeded`

#### Scenario: Paid ingestion charges into the Budget

- **WHEN** a search Source's ingester returns a non-zero cost
- **THEN** that cost is charged into the Budget's `ingestion` bucket and is visible to the spend ceiling the curation stages check

#### Scenario: Keyless ingesters charge nothing

- **WHEN** an RSS, Reddit, or YouTube Source runs
- **THEN** its returned cost is zero and the ingestion bucket is unchanged by it

#### Scenario: Curation counts are left untouched

- **WHEN** ingestion finishes a scan
- **THEN** `kept_count` and `filtered_count` remain at their defaults and `ai_summary` is unset
