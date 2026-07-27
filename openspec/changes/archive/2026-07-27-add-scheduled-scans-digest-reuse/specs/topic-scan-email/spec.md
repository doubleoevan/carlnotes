## ADDED Requirements

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

Recipients SHALL be the distinct email addresses of the Topic's subscribers whose `subscriptions.frequency` matches the Topic's frequency, resolving both direct user subscriptions (`subscriber_user_id`) and the members of subscribed audiences (`subscriber_audience_id`). A subscriber reached by more than one path SHALL be emailed once — duplicate addresses SHALL be collapsed. A Topic with no matched subscribers SHALL send no email.

#### Scenario: A direct subscriber at the matching frequency is a recipient

- **WHEN** a user is directly subscribed to the Topic with `frequency` equal to the Topic's frequency
- **THEN** that user's email is a recipient

#### Scenario: An audience member is a recipient

- **WHEN** an audience is subscribed to the Topic at the matching frequency and a user is a member of that audience
- **THEN** that member's email is a recipient

#### Scenario: A mismatched-frequency subscriber is excluded

- **WHEN** a subscriber's `frequency` does not match the Topic's frequency
- **THEN** that subscriber is not a recipient

#### Scenario: A subscriber reached by two paths is emailed once

- **WHEN** a user is both directly subscribed and a member of a subscribed audience at the matching frequency
- **THEN** that user's address appears once in the recipient set and receives one email

#### Scenario: No matched subscribers means no send

- **WHEN** a Topic has no subscribers whose frequency matches its frequency
- **THEN** no email is sent

### Requirement: The email lists each new Finding grounded in the Scan's data

The email SHALL be grounded only in the Scan's real new Findings: a subject naming the Topic, and content listing each new Finding's title, a link to its Resource URL, and its relevance explanation. It SHALL NOT fabricate Findings or include Findings from other Topics or from prior Scans.

#### Scenario: The content lists the new Findings and nothing else

- **WHEN** the email is built for a scheduled Scan's new Findings
- **THEN** the content lists each of those Findings' title, Resource link, and relevance explanation, and includes no Findings from other Topics or earlier Scans

### Requirement: Email delivery is best-effort and never fails the Scan

The email SHALL send through the shared `sendEmail` helper — the same raw-`fetch` Resend call signup verification uses, keyed by `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, with no `resend` package added. A delivery failure — missing configuration, a non-2xx Resend response, or a network error — SHALL be logged and swallowed per recipient, never thrown, so one bad address neither blocks the other recipients nor changes the Scan's recorded status.

#### Scenario: A delivery failure is logged and swallowed

- **WHEN** sending to one recipient returns a non-2xx response or throws
- **THEN** the failure is logged, the remaining recipients are still attempted, and the error does not propagate

#### Scenario: The Scan status is unaffected by delivery

- **WHEN** an email send fails for a scheduled Scan
- **THEN** the Scan remains recorded as `succeeded` and its stored outputs are unchanged

#### Scenario: Missing Resend configuration skips sending

- **WHEN** `RESEND_API_KEY` or `RESEND_FROM_EMAIL` is unset
- **THEN** the worker logs that it cannot send and sends no email, without throwing

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
