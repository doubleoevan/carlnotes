## MODIFIED Requirements

### Requirement: Kind-dispatched ingester registry

`runTopicScan` SHALL dispatch each Source to the ingester registered for its `kind`. A Source whose `kind` has no registered ingester SHALL be skipped without aborting the Scan.

A Source that has not passed its screen SHALL be skipped the same way, before its ingester is reached, so that an unscreened url is never fetched into a Resource. The skip SHALL be decided by the Source's readiness alone rather than by its kind, so a kind that gains screening later needs no change here.

#### Scenario: RSS Source is dispatched to the RSS ingester

- **WHEN** a Source of kind `rss` is scanned
- **THEN** it is handled by `rssIngester`

#### Scenario: Unregistered kind is skipped

- **WHEN** a Source whose `kind` has no registered ingester is scanned
- **THEN** that Source is skipped and the Scan continues with the remaining Sources

#### Scenario: A Source that has not passed its screen is skipped

- **WHEN** a Source that is pending or failed screening is reached during ingest
- **THEN** its ingester is not called, no Resource is created from it, and the Scan continues with the remaining Sources
