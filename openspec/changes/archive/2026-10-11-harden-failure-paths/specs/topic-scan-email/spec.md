## MODIFIED Requirements

### Requirement: Each email offers a working one-click unsubscribe

Every topic-scan email SHALL include a per-recipient unsubscribe link and a `List-Unsubscribe` header (with
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`) so inbox providers can offer their own one-click unsubscribe. The
link SHALL include a signed token naming the recipient and the Topic, and the signature SHALL be verified before any
action so a forged or altered token unsubscribes nothing. Visiting the link (GET) SHALL change nothing: it SHALL show a
page naming the Topic with one button, so a mail provider or a security scanner that fetches the link to check it
unsubscribes nobody. Pressing the button (POST) SHALL deactivate the recipient's direct subscription to the Topic and
show a confirmation page naming the Topic, and a provider one-click (POST with the RFC 8058 body) SHALL perform the same
unsubscribe and return 200 with no body. Each unsubscribe SHALL be reported with the entry point that performed it, the
page or the provider's one-click, and the device properties the request shows. If the app base url is not configured,
the email SHALL omit the link and the header instead of sending a broken one.

#### Scenario: A fetch of the link unsubscribes nothing

- **WHEN** a mail provider or a scanner fetches a recipient's unsubscribe link
- **THEN** the subscription stays active and the response is the page with the button

#### Scenario: A valid unsubscribe removes the subscription and confirms

- **WHEN** a recipient opens their unsubscribe link and presses the button
- **THEN** their direct subscription to the Topic is deactivated and a page confirms they're unsubscribed from that
  Topic

#### Scenario: A forged token unsubscribes nothing

- **WHEN** the unsubscribe token's signature does not verify
- **THEN** no subscription is deactivated and an invalid-link page is shown, on the GET and the POST alike

#### Scenario: A provider one-click unsubscribes

- **WHEN** an inbox provider POSTs the RFC 8058 body to the `List-Unsubscribe` URL
- **THEN** the recipient's direct subscription is deactivated and the route returns 200 with no body
