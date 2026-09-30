## REMOVED Requirements

### Requirement: Email delivery is best-effort and never fails the Scan

**Reason**: A rejected scan email is now retried by its own workflow instead of being logged and dropped, and a delivery failure is reported instead of swallowed.

**Migration**: See "A Scan's email is retried by its own workflow and never fails the Scan", "Each accepted batch is recorded with its Scan", and "A retry never mails a recipient twice" in this spec, and the email-delivery spec for the rate bound and the reports.

## ADDED Requirements

### Requirement: A Scan's email is retried by its own workflow and never fails the Scan

A Scan's email SHALL be sent by its own workflow, never inside the activity that completes the Scan, through Resend's HTTP API keyed by `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, with no `resend` package added. A 429 `rate_limit_exceeded` SHALL be retried after the response's `retry-after`. A 409 `concurrent_idempotent_requests`, a 5xx response, a network error, and a timeout SHALL be retried with exponential backoff, starting at 15 seconds and doubling up to 10 minutes apart, for at most 10 attempts. Any other rejection, a quota 429, and missing configuration SHALL NOT be retried. A send that fails for good or runs out of attempts SHALL be reported to Sentry with its Scan, Topic, email kind, batch, response status, and Resend error name, and never an address. A failed batch SHALL NOT stop the email's other batches. No outcome of the email SHALL change the Scan's recorded status or rerun the Scan's closing write, its analytics event, or its IndexNow notification.

#### Scenario: A rate-limited batch is retried after its retry-after

- **WHEN** Resend responds to a digest batch with a 429 `rate_limit_exceeded` and `retry-after: 3`
- **THEN** the batch is sent again about three seconds later, and its recipients are emailed once

#### Scenario: A validation error is reported at once

- **WHEN** Resend rejects a digest batch with a 400 `validation_error`
- **THEN** the batch is not retried, Sentry receives a report naming the Scan and the batch, and the email's other batches are still sent

#### Scenario: A send that runs out of attempts is reported

- **WHEN** Resend responds to a batch with a 5xx on all 10 attempts
- **THEN** Sentry receives a report naming the Scan, the batch, and the last status

#### Scenario: The Scan stays succeeded

- **GIVEN** a scheduled Scan that succeeded
- **WHEN** every attempt at its digest fails
- **THEN** the Scan remains recorded as `succeeded`, its stored outputs are unchanged, and its analytics event and IndexNow notification were sent once

#### Scenario: Missing Resend configuration stops the email

- **WHEN** `RESEND_API_KEY` or `RESEND_FROM_EMAIL` is unset
- **THEN** no email is sent, none is retried, and Sentry receives a report naming the email kind

### Requirement: Each accepted batch is recorded with its Scan

A digest SHALL read the Topic's email subscribers when it starts and divide them into batches of up to a hundred, one batch per provider call. Each batch SHALL recheck its recipients just before it is sent, so a recipient who unsubscribed or turned email off in between is not sent to. A batch's `topic_email_sends` rows SHALL be written as soon as Resend accepts the batch, one per recipient, each naming the Scan in `scan_id`. A send that Resend rejects or that is skipped SHALL write no row, so the send log records accepted sends only.

#### Scenario: A partial failure resends only what was not accepted

- **GIVEN** a digest of three batches whose second batch is rejected once with a 5xx
- **WHEN** the second batch is retried and accepted
- **THEN** each subscriber has exactly one row for the Scan, and the first and third batches were sent once

#### Scenario: A retry respects an unsubscribe made in between

- **GIVEN** a digest batch that was rate limited
- **WHEN** one of its recipients unsubscribes before the retry
- **THEN** the retried batch leaves that recipient out and writes no row for them

#### Scenario: A rejected batch writes no rows

- **WHEN** Resend rejects a batch for good
- **THEN** no `topic_email_sends` row is written for its recipients, and the Topic's Emailed count is unchanged

### Requirement: A retry never mails a recipient twice

A Scan's email, the digest or the manual-scan report, SHALL skip each recipient who already has a `topic_email_sends` row naming that Scan, and SHALL NOT compare send times to tell Scans apart. The rows SHALL be unique by Scan and recipient. Each provider call SHALL send an `Idempotency-Key` made of the email kind, the Scan, and a hash of the request body, so a retry of a call that Resend accepted before its rows were written gets the first response back instead of a second email.

#### Scenario: A retried report is not sent twice

- **GIVEN** a manual Scan's report that Resend accepted and that was recorded
- **WHEN** the report's activity runs again for the same Scan
- **THEN** no second email is sent

#### Scenario: A crash after acceptance does not resend

- **GIVEN** a digest batch that Resend accepted, and a worker that died before writing its rows
- **WHEN** the batch is retried with the same recipients and the same body
- **THEN** Resend returns the first response for the same `Idempotency-Key`, no second email is sent, and the rows are written

#### Scenario: Overlapping Scans keep their own recipients

- **GIVEN** a Topic whose first Scan's digest is still retrying when its second Scan's digest is sent
- **WHEN** both emails finish
- **THEN** each subscriber is emailed once for each Scan, and their rows tell the two Scans apart by `scan_id`
