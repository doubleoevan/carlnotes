## ADDED Requirements

### Requirement: A cancelled workflow closes its own Scan

A Scan whose workflow is cancelled SHALL close its own row rather than be left running for the stale sweep to find. The closing write SHALL run in a scope that cancellation cannot reach, since every activity a cancelled workflow starts is otherwise cancelled the moment it starts.

The workflow SHALL treat cancellation as an outcome rather than a failure: it SHALL complete normally instead of propagating the cancellation, so that a caller waiting on its result sees a Scan that ended rather than an error to report.

#### Scenario: The row closes on cancellation
- **WHEN** a running Scan's workflow is cancelled
- **THEN** the Scan row is closed by the workflow itself, without waiting for the stale-scan sweep

#### Scenario: A cancelled Scan is not an error
- **GIVEN** a manual Scan whose caller waits on the workflow result to bill its overage
- **WHEN** the Scan is cancelled
- **THEN** the workflow completes rather than failing, and the caller reports no error

## MODIFIED Requirements

### Requirement: A Scan's outcome is announced by the workflow

Every announcement a Scan makes SHALL be sent from the workflow once the Scan reaches a terminal status, not from a caller's unawaited promise or a caller waiting on the Scan. A Scan that resumed after an interruption SHALL still announce itself exactly once.

What is announced SHALL follow what asked for the Scan: a manual Scan reports back to whoever fired it, a scheduled Scan sends the Topic's digest to its subscribers, and a Topic's first Scan announces nothing.

A Scan the user stopped SHALL announce nothing, whichever asked for it. A stopped manual Scan needs no report, since the user who stopped it is watching the page it would report. A stopped scheduled Scan sends no digest either: the Topic's owner is the only one who can stop it, and a digest naming a reading that was called off part way would tell subscribers the Topic was read when it was not. The Findings it kept still reach subscribers, in the next digest the Topic sends.

A caller therefore never needs to wait for a Scan in order to announce it.

#### Scenario: An email survives a restart

- **GIVEN** a manual Scan interrupted after review and resumed
- **WHEN** the Scan finishes
- **THEN** its email is sent once, by the workflow rather than by the request that asked for it

#### Scenario: A sweep that dies still delivers its digests

- **GIVEN** a scheduled sweep that started Scans and then stopped
- **WHEN** those Scans finish
- **THEN** each Topic's digest is still sent, by the workflow rather than by the sweep

#### Scenario: Creating a Topic announces nothing

- **WHEN** a Topic's first Scan finishes
- **THEN** no digest or manual-scan email is sent, since the Topic has only just been created

#### Scenario: A stopped manual Scan announces nothing

- **WHEN** a manual Scan the user stopped closes
- **THEN** no manual-scan email is sent

#### Scenario: A stopped scheduled Scan sends no digest

- **GIVEN** a scheduled Scan on a Topic with subscribers
- **WHEN** the owner stops it
- **THEN** no digest is sent for it, and the Findings it kept go out with the Topic's next digest instead
