## ADDED Requirements

### Requirement: Every provider call takes a slot from one limit shared in Redis

Every call to Resend, from the api's senders and from the worker's scan emails, SHALL first take a slot from one limit held in Redis, which allows one call in any 200 milliseconds across every api and worker process together, so calls leave evenly spaced at five a second, half of Resend's limit of ten requests a second per team. A call that finds no slot SHALL wait for the next one instead of going out. If Redis cannot be reached, the call SHALL go out without a slot, as the app's other limits in Redis allow a request, and the api and the worker SHALL each report the outage to Sentry through their once-a-minute Redis-down warning.

#### Scenario: Every process counts against the same limit

- **GIVEN** two api processes and two worker processes sending at once
- **WHEN** their calls are counted over any one second
- **THEN** no more than five calls leave across all four processes, and no two within 200 milliseconds of each other

#### Scenario: A burst of api mail waits its turn

- **WHEN** the api sends the verification mail for twenty signups at once
- **THEN** the mail leaves five calls a second, and none draws a 429

#### Scenario: A digest for a large Topic spreads its batches

- **GIVEN** a scheduled Scan whose Topic has 350 email subscribers
- **WHEN** its digest is sent
- **THEN** it makes four batch calls, each from its own activity and each taking its own slot

#### Scenario: Waiting calls never leave together

- **WHEN** twenty calls from two processes are waiting for slots at once
- **THEN** they leave one at a time, 200 milliseconds apart, and never in a burst

#### Scenario: Redis is unreachable

- **WHEN** a send runs while Redis cannot be reached
- **THEN** the email goes out without a slot, and within a minute Sentry receives the sending process's Redis-down warning

### Requirement: A send that cannot go out is reported

A send that cannot go out SHALL be reported to Sentry, not only logged. A missing `RESEND_API_KEY` or `RESEND_FROM_EMAIL` SHALL be reported by every send path, with the email kind. An address dropped as unsendable SHALL be reported with the email kind and the number dropped. A report SHALL NOT include an email address.

#### Scenario: Missing configuration is reported

- **WHEN** a send runs with `RESEND_API_KEY` or `RESEND_FROM_EMAIL` unset
- **THEN** nothing is sent, and Sentry receives a report naming the email kind

#### Scenario: A dropped address is reported without the address

- **WHEN** a batch drops two recipients whose addresses Resend would reject
- **THEN** the rest of the batch is sent, and Sentry receives a report with the email kind and a count of two, and no address
