## ADDED Requirements

### Requirement: A Scan's model call waits out a failure that another attempt can fix

A Scan's scoring calls, its private Personal sources scoring call, its filter's embedding batches, its topic context's
query embedding, and its scan report SHALL try again after a rate limit that names no spent budget, a 408, a 5xx, or a
timeout or dropped connection. Each wait SHALL be what the response's `Retry-After` names, else a backoff with jitter,
and no single wait SHALL pass 30 seconds. One call SHALL make at most 5 attempts and wait at most 60 seconds in all.

#### Scenario: A rate limit followed by a success

- **WHEN** a scoring call gets a 429 that names no spent budget, and the next attempt succeeds
- **THEN** the Resource is scored from the second attempt, its Finding is written, and no error is reported

#### Scenario: The response names its wait

- **WHEN** a scoring call gets a 429 with `Retry-After: 3`
- **THEN** the next attempt starts about three seconds later

#### Scenario: The response names no wait

- **WHEN** an embedding batch gets a 503 with no `Retry-After`
- **THEN** the next attempt starts after a backoff with jitter, and each later wait is longer, up to 30 seconds

#### Scenario: A rate limit that outlasts the waits

- **WHEN** every attempt of a scoring call gets a 429 until the call has waited 60 seconds or made 5 attempts
- **THEN** the call fails with the last attempt's error, and its Resource is reported and leaves the Scan with no
  Finding, as a failed Resource does today

#### Scenario: A response that asks for more than 30 seconds fails at once

- **WHEN** a scoring call gets a 429 with `Retry-After: 45`
- **THEN** the call fails at once with that error instead of waiting

#### Scenario: A wait that would pass the call's limit is not started

- **WHEN** a call has waited 50 seconds and its next response asks for a 20-second wait
- **THEN** the call fails at once instead of waiting

### Requirement: A Scan's model call fails at once on a rejection or a spent budget

A Scan's model call SHALL NOT try again after a response that another attempt cannot fix: a 4xx other than a 408 or a
rate limit, a rate limit or any other response that names a spent budget, or a model output that fails its schema. Such
a failure SHALL reach the caller on its first occurrence, as it does today.

#### Scenario: A rejected request fails at once

- **WHEN** a scoring call gets a 400 that names no spent budget
- **THEN** no second attempt is made, and the Resource is reported as failed

#### Scenario: A spent budget fails at once

- **WHEN** a scoring call gets a 429 whose body names a spent budget
- **THEN** no second attempt is made, and the Scan ends its paid stages as a spent budget does today

#### Scenario: The scan report does not retry a spent budget

- **WHEN** the scan report call gets a response that names a spent budget
- **THEN** no second attempt is made, and the Scan succeeds with an empty report

### Requirement: No model call waits past the review attempt's twentieth minute

A review attempt SHALL stop its model calls from waiting 20 minutes after the attempt starts, so the waits always fit
inside the 30-minute review timeout. A call whose next wait would end past that moment SHALL fail at once with its last
error, and an attempt in progress SHALL run to its end. A second review attempt SHALL get a fresh 20 minutes. The stage
SHALL keep heartbeating while a call waits.

#### Scenario: A late rate limit fails at once

- **WHEN** a scoring call gets a 429 at the review attempt's 19th minute and 59th second and the wait would end past
  the 20th minute
- **THEN** the call fails at once, and the Resource is reported as failed

#### Scenario: A wait does not stop the heartbeat

- **WHEN** every scoring call in a review attempt is waiting
- **THEN** the stage still heartbeats every 30 seconds, and Temporal does not fail it for a missed heartbeat

#### Scenario: A retried review starts a fresh deadline

- **WHEN** a review attempt dies and the stage is attempted again
- **THEN** the second attempt's calls may wait until 20 minutes after the second attempt starts

### Requirement: No Resource starts past the review attempt's wait deadline

A review attempt SHALL start scoring no new Resource once its model call wait deadline has passed. Each Resource it
leaves SHALL be deferred, as a Resource past the Scan's limit is.

#### Scenario: No Resource starts past the deadline

- **WHEN** a review attempt reaches its 20th minute with Resources still queued
- **THEN** the Resources already scoring run to their end, and the rest are deferred, not scored or failed

### Requirement: A model call that waited is charged and reserved as one call

A Scan's Budget SHALL be charged for each attempt that returned usage and for no attempt that did not. A Resource's
spend reservation SHALL be held from before its first attempt until its paid section ends, across every wait, and then
released as it is today. A call that fails after its waits SHALL be reported once, not once per attempt.

#### Scenario: A rate-limited attempt costs nothing

- **WHEN** a scoring call gets a 429 and then succeeds
- **THEN** the Budget is charged for the successful attempt's usage alone

#### Scenario: The reservation is held across a wait

- **WHEN** a Resource's scoring call is waiting to try again
- **THEN** its reservation still counts against the Scan's dollar limit, and it is released once the Resource's paid
  section ends, whether the call succeeded or failed
