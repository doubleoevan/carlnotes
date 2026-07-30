# scheduled-scans (delta)

## MODIFIED Requirements

### Requirement: A Topic is scheduled by its frequency and its recent Scans, without a cursor column

A Topic SHALL be scheduled for a Scan when it has no completed (`succeeded` or `failed`) Scan whose `started_at` falls within its frequency window — 24 hours for `daily`, 7 days for `weekly` — or when it has no completed Scan at all. A Topic with an in-window `succeeded` Scan SHALL NOT be scheduled. A Topic with an in-window `failed` Scan SHALL NOT be scheduled either: a failed Scan means that frequency window found nothing, not that the Topic is owed an immediate retry, so counting only succeeded Scans would leave a Topic whose Sources all fail permanently scheduled and re-scanned by every sweep. A running Scan never spends the window: due-ness reads only completed Scans, so a Topic whose only Scan is a pending running row — whether freshly created or mid-brew — is due immediately, exactly as an unscanned Topic is. No `nextScanAt` or scheduling-cursor column SHALL be added to `topics`. Whether a Topic is scheduled is computed from `frequency` and the Scans that already exist.

#### Scenario: A recently scanned daily Topic is not scheduled

- **WHEN** a `daily` Topic has a `succeeded` Scan started less than 24 hours ago
- **THEN** it is not scheduled and the sweep does not scan it

#### Scenario: A recently failed daily Topic is not scheduled again until its window elapses

- **WHEN** a `daily` Topic's most recent Scan `failed` less than 24 hours ago
- **THEN** it is not scheduled, and it is scheduled again once 24 hours have passed, on the same window a succeeded Scan would set

#### Scenario: A daily Topic with no recent Scan is scheduled

- **WHEN** a `daily` Topic has no completed Scan started within the last 24 hours
- **THEN** it is scheduled and the sweep scans it

#### Scenario: A running Scan blocks a re-scan within the window

- **WHEN** a Topic already has a `running` Scan
- **THEN** the sweep does not open a second, concurrent Scan for it — it claims the existing running row instead, per the sweep-claims-a-pending-Scan requirement below

#### Scenario: A pending first Scan leaves the Topic due

- **GIVEN** a Topic created moments ago, holding only the running Scan opened at creation
- **WHEN** the sweep computes the scheduled Topics
- **THEN** the Topic is scheduled, since it has no completed Scan

#### Scenario: The weekly window is seven days

- **WHEN** a `weekly` Topic's most recent `succeeded` Scan started six days ago
- **THEN** it is not scheduled, and it is scheduled again once seven days have passed

## ADDED Requirements

### Requirement: The sweep claims a pending Scan

When a scheduled Topic already has a running Scan, the sweep SHALL claim that row — re-stamping its start to the moment work begins — rather than opening a second one. A new Scan row SHALL be opened only when the Topic has no running Scan.

#### Scenario: Claiming instead of doubling

- **GIVEN** a Topic scheduled for this sweep with one running Scan opened at creation
- **WHEN** the sweep scans the Topic
- **THEN** that Scan row is the one processed, and the Topic still has exactly one Scan for this window

### Requirement: Topic creation opens the first Scan atomically

Creating a Topic SHALL write the Topic, its subscription, invitees, sources, and its first running Scan in one transaction. A creation failure SHALL leave none of those rows. The API SHALL NOT run the first Scan; the sweep does.

#### Scenario: Creation is all-or-nothing

- **GIVEN** a topic create request that fails after the Topic row is written
- **WHEN** the transaction aborts
- **THEN** neither the Topic nor its first Scan exists

### Requirement: Manual scan refused while running

A manual scan request for a Topic that already has a running Scan SHALL be refused with a conflict, so a user cannot burn a quota slot racing the sweep on work already in progress.

#### Scenario: Manual fire during a pending Scan

- **GIVEN** a Topic with a running Scan
- **WHEN** the owner requests a manual scan
- **THEN** the request is refused with a conflict and no second Scan is opened
