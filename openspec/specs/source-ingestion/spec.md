# source-ingestion Specification

## Purpose
TBD - created by archiving change add-source-ingestion. Update Purpose after archive.
## Requirements
### Requirement: Shared adapter interface

The system SHALL define a single `SourceAdapter` interface that every source kind implements: given a Source, it returns the Resources it emitted and the cost it incurred. Adapters SHALL emit Resources only — never Findings, scores, or embeddings — and SHALL leave `embedding` and `embedding_model` unset so the curation pipeline fills them later.

#### Scenario: Adapter returns Resources and cost

- **WHEN** an adapter runs against a Source
- **THEN** it returns a list of Resources and a numeric cost, and produces no Findings

#### Scenario: Adapter leaves embedding unset

- **WHEN** an adapter emits a Resource
- **THEN** the Resource has no `embedding` and no `embedding_model` set

### Requirement: Kind-dispatched adapter registry

`runTopicScan` SHALL dispatch each Source to the adapter registered for its `kind`. A Source whose `kind` has no registered adapter SHALL be skipped without aborting the Scan.

#### Scenario: RSS Source is dispatched to the RSS adapter

- **WHEN** a Source of kind `rss` is scanned
- **THEN** it is handled by `rssAdapter`

#### Scenario: Unregistered kind is skipped

- **WHEN** a Source whose `kind` has no registered adapter is scanned
- **THEN** that Source is skipped and the Scan continues with the remaining Sources

### Requirement: RSS adapter emits canonical Resources

`rssAdapter` SHALL fetch the feed URL from the Source's `config`, parse RSS or Atom, and emit one Resource per entry with a canonical URL, a title, `kind` `read`, and cost `0`. It SHALL require no Integration (keyless). Entries sharing a canonical URL within one feed SHALL collapse to a single Resource.

#### Scenario: Feed entries become Resources

- **WHEN** a Source of kind `rss` with a valid feed URL is scanned
- **THEN** `rssAdapter` emits one Resource per feed entry, each with its canonical URL, its title, and `kind` `read`

#### Scenario: Keyless operation

- **WHEN** the RSS Source has no `integration_id`
- **THEN** the adapter still runs and emits Resources

#### Scenario: Duplicate entries within a feed collapse

- **WHEN** a feed lists two entries that resolve to the same canonical URL
- **THEN** only one Resource is emitted for that URL

### Requirement: Global Resource dedupe on canonical URL

Upserting emitted Resources SHALL dedupe globally on canonical URL. Re-scanning a Source whose entries already exist as Resources SHALL NOT create duplicate rows and SHALL NOT overwrite the existing Resource (its later-filled `embedding` is preserved).

#### Scenario: Existing URL is not duplicated

- **WHEN** a scan emits a Resource whose canonical URL already exists in `resources`
- **THEN** no duplicate row is created and the existing row is left unchanged

#### Scenario: New URL is inserted

- **WHEN** a scan emits a Resource whose canonical URL is not yet stored
- **THEN** a new `resources` row is inserted

### Requirement: Scan records found count and cost

`runTopicScan` SHALL create a Scan in status `running`, and on completion record `found_count` (the number of deduped Resources discovered across all Sources) and `cost` (the sum of the Sources' adapter costs), set `finished_at`, and mark the Scan `succeeded`. Ingestion SHALL NOT set `kept_count`, `filtered_count`, or `ai_summary` — those belong to curation.

#### Scenario: Counts and cost are recorded on success

- **WHEN** a scan completes with its Sources having emitted Resources
- **THEN** the Scan's `found_count` equals the count of deduped Resources discovered, its `cost` equals the summed adapter cost, `finished_at` is set, and its status is `succeeded`

#### Scenario: Curation counts are left untouched

- **WHEN** ingestion finishes a scan
- **THEN** `kept_count` and `filtered_count` remain at their defaults and `ai_summary` is unset

### Requirement: Per-Source failure isolation

A failing Source SHALL degrade only that Source's contribution. `runTopicScan` SHALL continue scanning the remaining Sources and still record the Resources they produced. A Scan SHALL be marked `failed` (with the error recorded) only when every Source failed.

#### Scenario: One Source fails, another succeeds

- **WHEN** one Source's adapter throws and another Source's adapter succeeds
- **THEN** the succeeding Source's Resources are upserted and the Scan is marked `succeeded`

#### Scenario: All Sources fail

- **WHEN** every Source's adapter throws
- **THEN** the Scan is marked `failed` and the error is recorded

