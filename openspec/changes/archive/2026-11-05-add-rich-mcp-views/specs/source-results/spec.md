## ADDED Requirements

### Requirement: The ingest stage records per-Source progress

When a Scan's ingest stage ends, the Scan SHALL save each Source's found count and status as progress for a running
Scan's status read. Progress SHALL NOT count as the Scan's results: a running or stopped Scan still has no results, and
no chart or recap SHALL read it. A status read SHALL pass progress through the same shaping as results.

#### Scenario: Progress reaches a running status

- **WHEN** ingest has ended and review is running
- **THEN** a status read returns each Source's found count, and the Scan's note still returns no results

#### Scenario: A stopped Scan keeps no chart

- **WHEN** a user stops a Scan during review
- **THEN** the Scan saves with no results, and no recap charts its progress

#### Scenario: Progress hides what results hide

- **WHEN** a visitor reads a running Scan's status on a public Topic
- **THEN** the response leaves out skipped Sources, costs, and failure reasons, and shows url Sources by their host
