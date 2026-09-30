# topic-scan-email Specification

## Purpose
TBD - created by archiving change add-scheduled-scans-digest-reuse. Update Purpose after archive.
## Requirements
### Requirement: A scheduled Scan emails its new Findings to subscribers

After a scheduled Scan finishes `succeeded`, the worker SHALL email that Scan's new Findings to the Topic's matched subscribers. New Findings SHALL be those first created by this Scan — the Findings carrying its `scan_id` — which are exactly the Findings surfaced since the Topic's last succeeded Scan, since curation scores only Resources that have no Finding for the Topic yet. A scheduled Scan that produced no new Findings SHALL send no email. A manual "Run now" Scan SHALL NOT send the email, and a `failed` Scan SHALL NOT send one.

#### Scenario: A scheduled Scan with new Findings emails them

- **WHEN** a scheduled Scan succeeds and wrote one or more new Findings for the Topic
- **THEN** an email of those Findings is sent to the Topic's matched subscribers

#### Scenario: A scheduled Scan with no new Findings sends nothing

- **WHEN** a scheduled Scan succeeds but wrote no new Findings
- **THEN** no email is sent

#### Scenario: A manual Scan sends no email

- **WHEN** an owner triggers a manual "Run now" Scan that writes new Findings
- **THEN** no email is sent, since the email fires only for scheduled Scans

#### Scenario: A failed Scan sends no email

- **WHEN** a scheduled Scan finishes `failed`
- **THEN** no email is sent

### Requirement: Recipients are the Topic's frequency-matched subscribers

Recipients SHALL be the distinct email addresses of the Topic's directly subscribed users whose `subscriptions.frequency` matches the Topic's frequency, whose subscription is active, and whose email preference is on. A subscriber reached more than once SHALL be emailed once — duplicate addresses SHALL be collapsed. A Topic with no matched subscribers SHALL send no email.

A team member's delivery goes through their own Subscription row like anyone else's: written muted at join, it makes them a recipient only after they turn the email preference on.

#### Scenario: A direct subscriber at the matching frequency is a recipient

- **WHEN** a user is subscribed to the Topic with `frequency` equal to the Topic's frequency, active, and email on
- **THEN** that user's email is a recipient

#### Scenario: A mismatched-frequency subscriber is excluded

- **WHEN** a subscriber's `frequency` does not match the Topic's frequency
- **THEN** that subscriber is not a recipient

#### Scenario: A muted team member is not a recipient

- **WHEN** a team member's Subscription on a team Topic still has its email preference off
- **THEN** no scan email reaches them, and turning the preference on makes them a recipient from the next send

#### Scenario: No matched subscribers means no send

- **WHEN** a Topic has no active, email-enabled subscriber at its frequency
- **THEN** no email is sent

### Requirement: The email lists each new Finding grounded in the Scan's data

The email SHALL be grounded only in the Scan's real new Findings: a subject naming the Topic, and content listing each new Finding's title, a link to its Resource URL, and its relevance explanation. It SHALL NOT fabricate Findings or include Findings from other Topics or from prior Scans.

The scan recap card SHALL render through the sanitized markdown subset `injection-defense` requires — bold, lists, and headings render, a citation of one of this email's own Finding urls renders as a real link, and every other link, image, or piece of raw HTML is neutralized into inert text — and each Finding's relevance explanation SHALL render as plain text. Every anchor the email carries therefore points where the email already points: the Finding cards' Resource links and the unsubscribe link, so a model that read an attacker's page cannot point the inbox anywhere new.

#### Scenario: The content lists the new Findings and nothing else

- **WHEN** the email is built for a scheduled Scan's new Findings
- **THEN** the content lists each of those Findings' title, Resource link, and relevance explanation, and includes no Findings from other Topics or earlier Scans

#### Scenario: The recap links only to this email's own findings

- **WHEN** the Scan's recap cites one of the email's Finding urls and also links elsewhere, or a relevance explanation contains link syntax
- **THEN** the kept citation renders as a real link, everything else shows as inert text while the recap's formatting still renders, and every anchor in the email points at a Finding's Resource url or the unsubscribe link

### Requirement: Each email offers a working one-click unsubscribe

Every topic-scan email SHALL carry a per-recipient unsubscribe link and a `List-Unsubscribe` header (with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) so inbox providers can offer their own one-click unsubscribe. The link SHALL carry a signed token naming the recipient and the Topic, and the signature SHALL be verified before any action so a forged or altered token unsubscribes nothing. Visiting the link (GET) SHALL delete the recipient's direct subscription to the Topic and show a confirmation page naming the Topic; a provider one-click (POST) SHALL perform the same unsubscribe and return 200. When the app base url is not configured, the email SHALL omit the link and header rather than emit a broken one.

#### Scenario: A valid unsubscribe removes the subscription and confirms

- **WHEN** a recipient opens their unsubscribe link
- **THEN** their direct subscription to the Topic is deleted and a page confirms they're unsubscribed from that Topic

#### Scenario: A forged token unsubscribes nothing

- **WHEN** the unsubscribe token's signature does not verify
- **THEN** no subscription is deleted and an invalid-link page is shown

#### Scenario: A provider one-click unsubscribes

- **WHEN** an inbox provider POSTs to the `List-Unsubscribe` URL
- **THEN** the recipient's direct subscription is deleted and the route returns 200

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

