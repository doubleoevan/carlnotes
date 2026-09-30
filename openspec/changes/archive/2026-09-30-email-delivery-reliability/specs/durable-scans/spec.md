## REMOVED Requirements

### Requirement: A Scan's outcome is announced by the workflow

**Reason**: The announcement moves out of the activity that completes the Scan into its own workflow. The requirement's claim that a Topic's first Scan announces nothing never matched the workflow either, which has emailed the Topic's creator since durable Scans shipped.

**Migration**: See "A Scan's outcome is announced by its own email workflow" in this spec.

## ADDED Requirements

### Requirement: A Scan's outcome is announced by its own email workflow

Every announcement a Scan makes SHALL be sent by an email workflow that the Scan's workflow starts once the Scan reaches a terminal status, not by the activity that completes the Scan, a caller's unawaited promise, or a caller waiting on the Scan. The email workflow's id SHALL name the Scan. The Scan's workflow SHALL wait only for the email workflow to start and then complete, so the email outlives it: the Topic's next Scan is never rejected as running while an email retries, and stopping that next Scan never cancels the email. A Scan that resumed after an interruption SHALL still start its email workflow exactly once. Nothing the email workflow does SHALL change the Scan's recorded status.

What is announced SHALL follow what asked for the Scan. A manual Scan reports back to whoever ran it, and a Topic's first Scan reports to the Topic's owner, who just created it, whether the Scan succeeded or every one of its Sources failed. A scheduled Scan that succeeded sends the Topic's digest to its subscribers. A Scan that ends in an error before its closing write announces nothing.

A Scan the user stopped SHALL announce nothing, whichever asked for it. A stopped manual Scan needs no report, since the user who stopped it is watching the page it would report. A stopped scheduled Scan sends no digest either: the Topic's owner is the only one who can stop it, and a digest naming a reading that was called off part way would tell subscribers the Topic was read when it was not. The Findings it kept still reach subscribers, in the next digest the Topic sends.

A caller therefore never needs to wait for a Scan in order to announce it.

#### Scenario: An email survives a restart

- **GIVEN** a manual Scan interrupted after review and resumed
- **WHEN** the Scan finishes
- **THEN** its email workflow is started once and its report is sent once, by the workflow instead of by the request that asked for the Scan

#### Scenario: A sweep that dies still delivers its digests

- **GIVEN** a scheduled sweep that started Scans and then stopped
- **WHEN** those Scans finish
- **THEN** each Topic's digest is still sent, by the workflow instead of by the sweep

#### Scenario: A Topic's first Scan reports to its creator

- **WHEN** a Topic's first Scan finishes
- **THEN** the Topic's owner receives the manual-scan report, and no digest is sent

#### Scenario: A manual Scan reports to whoever ran it

- **GIVEN** an admin who runs a manual Scan on another user's Topic
- **WHEN** the Scan finishes, succeeded or with every one of its Sources failed
- **THEN** the admin receives the manual-scan report

#### Scenario: A retrying email never holds up the next Scan

- **GIVEN** a Scan that has completed while its digest is still retrying
- **WHEN** the owner asks for a manual Scan of the same Topic
- **THEN** the manual Scan starts, and the digest keeps retrying

#### Scenario: A failed announcement leaves the Scan as it ended

- **GIVEN** a scheduled Scan that succeeded
- **WHEN** its email workflow fails every attempt
- **THEN** the Scan is still recorded as `succeeded`

#### Scenario: A stopped manual Scan announces nothing

- **WHEN** a manual Scan the user stopped closes
- **THEN** no manual-scan email is sent

#### Scenario: A stopped scheduled Scan sends no digest

- **GIVEN** a scheduled Scan on a Topic with subscribers
- **WHEN** the owner stops it
- **THEN** no digest is sent for it, and the Findings it kept go out with the Topic's next digest instead
