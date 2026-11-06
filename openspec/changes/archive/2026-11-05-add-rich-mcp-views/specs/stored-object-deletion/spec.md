## REMOVED Requirements

### Requirement: The sweep retries pending keys outside its claim and reports what stays pending

**Reason**: Its heading used a rejected term, and a MODIFIED block cannot rename a scenario.
**Migration**: `The sweep retries pending keys outside its lease and reports what stays pending` holds the same rule.

## ADDED Requirements

### Requirement: The sweep retries pending keys outside its lease and reports what stays pending

The scheduled sweep SHALL retry every pending key whose try time has passed, after it releases its lease, so no
transaction stays open across a bucket call. Each failed retry SHALL raise the attempt count and push the next try time
back with a doubling delay, up to a day. A key pending for a day SHALL be reported to Sentry once and keep being
retried.

#### Scenario: A retry runs outside the lease

- **WHEN** the sweep reaches its pending keys
- **THEN** the sweep has already released its lease, and each retry runs on its own connection

#### Scenario: A failed retry backs off

- **WHEN** a key's third retry fails
- **THEN** its attempt count is three, and its next try time is eight minutes out

#### Scenario: A key pending for a day is reported once

- **WHEN** a key has been pending for more than a day across two sweeps
- **THEN** one Sentry report names it with its attempt count, the second sweep sends no second report, and the key keeps
  being retried

#### Scenario: Two sweeps retry one key

- **WHEN** two sweeps running at once retry one key
- **THEN** both retries are harmless, and a repeated delete of a gone object succeeds
