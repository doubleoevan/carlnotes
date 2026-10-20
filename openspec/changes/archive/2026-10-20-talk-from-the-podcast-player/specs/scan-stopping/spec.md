## MODIFIED Requirements

### Requirement: A stop reaches the stage that is running

Review SHALL observe its cancellation, so that a stopped Scan stops spending instead of running out its stage timeout.
It SHALL check the cancellation where it already decides whether to keep working: the per-Resource gate that defers a
Resource when the Scan is out of budget. A cancelled review SHALL return what it scored instead of throwing, so the Scan
closes through the same path a Scan that ran out of budget closes through.

A Resource already running when the stop arrives SHALL be allowed to finish, so the stop takes effect at a Resource
boundary instead of mid-fetch. Temporal passes the cancellation to a running stage on that stage's next heartbeat, so a
stage keeps working for up to one heartbeat interval after the Scan row closes. The Scan therefore records more Findings
and more spend than it had at the moment of the click, and both SHALL be written by the stage itself instead of by the
closing write, which runs while the stage is still winding down.

Ingestion runs every Source at once, so a stop that arrives once it is under way has nothing left to hold back. A Scan
stopped during ingestion SHALL finish ingesting and then close before review begins, which is where a Scan spends most
of what it spends.

#### Scenario: Review stops scoring
- **GIVEN** a Scan cancelled while review is scoring Resources
- **WHEN** the next Resource reaches the gate
- **THEN** it and every Resource after it are deferred unscored, and review returns what it had already scored

#### Scenario: A stop during ingestion closes before review
- **GIVEN** a Scan cancelled while its Sources are being ingested
- **WHEN** ingestion finishes
- **THEN** review never starts and the Scan closes as stopped
