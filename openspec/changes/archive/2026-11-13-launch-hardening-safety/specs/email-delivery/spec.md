## RENAMED Requirements

- FROM: `### Requirement: Every provider call takes a slot from one limit shared in Redis`
- TO: `### Requirement: Every provider call takes a slot from a limit shared in Redis`

## MODIFIED Requirements

### Requirement: Every provider call takes a slot from a limit shared in Redis

Every call to Resend, from the api's senders and from the worker's scan emails, SHALL first take a slot from a limit
kept in Redis. An account email, which is a verification, a password reset, a change of address, or an invitation,
SHALL take its slot from a limit of its own, so it never waits behind a bulk send. Every other call SHALL take its
slot from the shared limit, which allows one call in any 200 milliseconds across every api and worker process
together, so calls leave evenly spaced at five a second, half of Resend's limit of ten requests a second per team. A
call that finds no slot SHALL wait for the next one instead of going out, with a little jitter on each wait so callers
that woke together do not ask in lockstep, and SHALL go out without a slot once its wait would pass ten seconds, so a
backlog never holds a send for good; Resend's own limit rejects that overflow with a 429, which a scan email and an
account email retry and any other send reports to Sentry. If Redis cannot be reached, the call SHALL go out without a
slot, as the app's other limits in Redis allow a request, and the api and the worker SHALL each report the outage to
Sentry through their once-a-minute Redis-down warning.

#### Scenario: Every process counts against the same limit

- **GIVEN** Redis is reachable and two api processes and two worker processes send emails that are not account emails
  at once
- **WHEN** their calls are counted over any one second
- **THEN** no more than five calls leave across all four processes, and no two within 200 milliseconds of each other

#### Scenario: A burst of api mail waits its turn

- **WHEN** the api sends the verification mail for twenty signups at once while Redis is reachable
- **THEN** the mail leaves evenly spaced under the account emails' limit, and none draws a 429

#### Scenario: A digest for a large Topic spreads its batches

- **GIVEN** a scheduled Scan whose Topic has 350 email subscribers
- **WHEN** its digest is sent
- **THEN** it makes four batch calls, each from its own activity and each taking its own slot

#### Scenario: Waiting calls never leave together

- **WHEN** twenty calls from two processes are waiting for slots of the shared limit at once
- **THEN** they leave one at a time, 200 milliseconds apart, and never in a burst

#### Scenario: A wait past the deadline goes out

- **WHEN** a call would have to wait more than ten seconds for a slot
- **THEN** it goes out without one

#### Scenario: Redis is unreachable

- **WHEN** a send runs while Redis cannot be reached
- **THEN** the email goes out without a slot, and within a minute Sentry receives the sending process's Redis-down
  warning

#### Scenario: An account email does not wait behind a bulk send

- **GIVEN** a notifications email loop whose calls are waiting for the shared limit's slots
- **WHEN** a visitor signs up with a password
- **THEN** the verification email takes its slot from the account emails' limit and leaves without waiting for the
  loop

## ADDED Requirements

### Requirement: An account email is retried under a stable key

A verification, password reset, change-of-address, or invitation email SHALL be sent through the retrying call under
an idempotency key that stays the same across its tries. A call that fails in a way another try can help, a rate limit
that is not a spent quota, a 5xx, or a network failure, SHALL be tried again in the background, a rate limit after the
wait Resend names. A send that fails every try SHALL be reported by its kind.

#### Scenario: A rate limited verification email is sent again

- **WHEN** Resend responds to a verification email's call with a 429 and a retry wait
- **THEN** the call is made again after that wait under the same idempotency key, and the user gets one email

#### Scenario: A retry sends no second copy

- **GIVEN** a password reset email whose first call reached Resend and whose response was lost
- **WHEN** the call is tried again under the same idempotency key
- **THEN** Resend returns its first result, and the user gets one email

#### Scenario: A spent quota is not retried

- **WHEN** Resend rejects an invitation email for a spent daily quota
- **THEN** the send is not tried again, and Sentry receives a report naming the email kind

#### Scenario: A retry never holds the request

- **WHEN** a signup's verification email is waiting to be tried again
- **THEN** the signup has already responded
