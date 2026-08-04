## ADDED Requirements

### Requirement: A Scan records when its workflow was accepted

The `scans` table SHALL carry a nullable timestamp recording when the Scan's workflow was accepted. Null SHALL mean the workflow was never started, which is the state a caller leaves behind when it dies between writing the row and starting the workflow.

The column SHALL be nullable rather than defaulted, because a default would make every row look dispatched and erase the distinction the column exists to record.

#### Scenario: A Scan opened but not dispatched

- **WHEN** a Scan row is written
- **THEN** its dispatch timestamp is null until its workflow is accepted

#### Scenario: A Scan whose workflow was accepted

- **WHEN** a Scan's workflow start returns
- **THEN** its dispatch timestamp records that moment

#### Scenario: Scans that predate the column

- **GIVEN** Scans that reached a terminal status before the column existed
- **WHEN** the column is added
- **THEN** they are not left looking like Scans awaiting dispatch
