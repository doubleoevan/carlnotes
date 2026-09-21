## ADDED Requirements

### Requirement: The sweep replaces the keys whose budget period has ended

Before it starts any Scan, the sweep SHALL replace the key of every user whose current key was created before the start
of the current UTC month, so a user the reset unblocks has their fresh key by the time their Topic comes up in the
same sweep. Each user's replacement SHALL be its own attempt: one user's failure SHALL be reported and SHALL neither
stop the sweep nor the replacements after it. The sweep's summary SHALL count how many keys it replaced and how many
replacements failed.

#### Scenario: The reset runs ahead of the scans

- **WHEN** the first sweep of a month starts
- **THEN** every key from the previous month is replaced before the sweep starts its first Scan

#### Scenario: One user's failed replacement does not stop the rest

- **WHEN** the proxy rejects one user's replacement
- **THEN** the failure is reported, the remaining users' keys are still replaced, and the sweep goes on to its Scans

#### Scenario: A reset that cannot start does not stop the scans

- **WHEN** the reset's own read of the users fails
- **THEN** the failure is reported and the sweep goes on to its Scans

#### Scenario: The summary says what the reset did

- **WHEN** a sweep replaces any keys or fails to replace any
- **THEN** its summary line names both counts
