## MODIFIED Requirements

### Requirement: Free-plan spend is the UTC day's spend billed to free users

The free-plan spend SHALL be the spend recorded since midnight UTC that bills a user whose plan is free and who is not
an admin. It SHALL sum every kind of spend that the day's spend report sums and that bills a user, read by each user's
current plan and role, a user's own rows in the `spends` table among them. A `spends` row with no user is the
platform's, and SHALL NOT count toward it. A paid user's or an admin's spend SHALL NOT count toward it.

#### Scenario: A paid user's spend does not count

- **GIVEN** a free user who spent 30 dollars today and a paid user who spent 200 dollars today
- **WHEN** the free-plan spend is read
- **THEN** it is 30 dollars

#### Scenario: An admin's spend does not count

- **GIVEN** an admin on the free plan who spent 80 dollars today
- **WHEN** the free-plan spend is read
- **THEN** the admin's 80 dollars are left out

#### Scenario: Yesterday's spend does not count

- **GIVEN** a free user who spent 120 dollars before midnight UTC and nothing since
- **WHEN** the free-plan spend is read after midnight UTC
- **THEN** it is zero

#### Scenario: The platform's spend does not count

- **GIVEN** a day on which the film backfill's renders cost the platform 40 dollars and free users spent 30 dollars
- **WHEN** the free-plan spend is read
- **THEN** it is 30 dollars

#### Scenario: A free user's url fetch counts

- **GIVEN** a free user whose url attachment's fetch was recorded today
- **WHEN** the free-plan spend is read
- **THEN** it includes that fetch's cost

### Requirement: The first Scan dispatch limit starts the oldest Waiting Scans each sweep

A Waiting Scan is a Scan row that is still running, was never dispatched, and that the first Scan dispatch limit
applies to. Each sweep SHALL start at most the limit's number of Waiting Scans, 5 by default, oldest first, and count
none against the scan dispatch limit. A limit of zero SHALL start none. A Waiting Scan SHALL keep its trigger.

#### Scenario: Waiting Scans start oldest first

- **GIVEN** a first Scan dispatch limit of 5 and 12 Waiting Scans
- **WHEN** a sweep runs
- **THEN** the 5 oldest start, and the other 7 stay waiting for the next sweep

#### Scenario: A limit of zero keeps every Waiting Scan waiting

- **GIVEN** a first Scan dispatch limit of zero and 3 Waiting Scans
- **WHEN** a sweep runs
- **THEN** none of them starts, and all 3 are still running and undispatched

#### Scenario: A Waiting Scan is never closed out as stale

- **GIVEN** a Waiting Scan opened six hours ago
- **WHEN** the reaper reads the stale Scans
- **THEN** the Waiting Scan stays running

#### Scenario: A Waiting Scan is never failed for a spent key

- **GIVEN** a Waiting first Scan whose owner's key budget was spent after the Topic was created
- **WHEN** a sweep starts it under the limit
- **THEN** it starts instead of being marked failed for the spent key

#### Scenario: A waiting Topic is not taken as a scheduled Scan

- **GIVEN** a Topic whose only Scan is a Waiting first Scan, so the Topic is scheduled
- **WHEN** a sweep's scheduled Scans run and the limit leaves that Scan waiting
- **THEN** the Topic's Scan is not started as a scheduled Scan

#### Scenario: Waiting Scans start without the limit once it no longer applies

- **GIVEN** 40 Waiting Scans left waiting under the scheduled scans cutoff
- **WHEN** the first sweep after midnight UTC runs
- **THEN** all 40 start with their triggers, since none is a Waiting Scan any longer
