## MODIFIED Requirements

### Requirement: Receive mail at the digest sender mailbox

Each environment SHALL accept mail only at its configured `RESEND_FROM_EMAIL` mailbox. Carl SHALL send from that mailbox
with the display name Carl and use it as Reply-To.

#### Scenario: Mail arrives at a different mailbox

- **WHEN** a signed event names only a different recipient, even on the same domain
- **THEN** this environment ignores it before storing a confirmation, fetching content, matching, charging or replying

#### Scenario: A message is forged or automated

- **WHEN** the webhook signature or timestamp fails, the provider reports missing or failed DKIM alignment or DMARC, the
  sender changes, or the message is an automatic response
- **THEN** Carl neither replies nor files an item
- **AND** From, Reply-To and copied authentication headers alone grant no authority

#### Scenario: A human writes from an unregistered mailbox

- **WHEN** receiver-authenticated mail to Carl has a single From that matches the signed delivery but no CarlNotes
  account
- **THEN** Carl replies in the same thread to that From with instructions to use the account email and a sign-in link
- **AND** he creates no Topic item, runs no matcher and charges no allowance

### Requirement: Replies and retries cannot file twice

Carl SHALL use RFC Message-ID, In-Reply-To, References and the original subject to keep replies together. Signed webhook
deliveries, retries and simultaneous replies SHALL produce at most one item per destination and one daily charge per
original email. Reply snapshots SHALL be encrypted and erased on delivery or abandonment.

#### Scenario: A webhook or reply is redelivered

- **WHEN** a worker stops after filing or a provider times out after accepting a reply
- **THEN** the same provider request identity and reply resume, without rematching, charging again or restoring a
  deleted item
- **AND** deleting an entry, deleting an account or changing the account email prevents stale private confirmations from
  being sent

#### Scenario: A digest reply has a new link

- **WHEN** the sender replies to Carl with a new safe public link
- **THEN** Carl processes the new text and links as a fresh request
- **AND** a linkless acknowledgment or a link present only in quoted history produces no filing or reply
