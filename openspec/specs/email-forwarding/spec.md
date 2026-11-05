# email-forwarding Specification

## Purpose
Let readers email useful context to Carl and route it to existing Topics they can edit.

## Requirements

### Requirement: Receive mail at the digest sender mailbox

Each environment SHALL accept mail only at its configured `RESEND_FROM_EMAIL` mailbox. Carl SHALL send from that mailbox with the display name Carl and use it as Reply-To.

#### Scenario: Mail arrives at a different mailbox

- **WHEN** a signed event names only a different recipient, even on the same domain
- **THEN** this environment ignores it before storing a receipt, fetching content, matching, charging or replying

#### Scenario: A message is forged or automated

- **WHEN** the webhook signature or timestamp fails, the provider reports missing or failed DKIM alignment or DMARC, the sender changes, or the message is an automatic response
- **THEN** Carl neither replies nor files an item
- **AND** From, Reply-To and copied authentication headers alone grant no authority

#### Scenario: A human writes from an unregistered mailbox

- **WHEN** receiver-authenticated mail to Carl has a single From that matches the signed delivery but no CarlNotes account
- **THEN** Carl replies in the same thread to that From with instructions to use the account email and a sign-in link
- **AND** he creates no Topic item, runs no matcher and charges no allowance

### Requirement: File clear matches in one delivery

Plus and Premium SHALL be able to email Carl from their account address. The shared matcher SHALL rank editable Topics using content and optional `topic:` hints. Only a nonempty subject hint SHALL allow direct filing of clear matches. All other requests SHALL wait for a selection reply. Accepted destinations SHALL receive one sender-owned item each in one transaction, using one of the shared 200 daily sends.

#### Scenario: Several Topics match

- **WHEN** mail with a nonempty `topic:` subject hint clearly matches several editable Topics, including a Topic with ten fetched Sources
- **THEN** all receive an item and one daily charge is recorded
- **AND** Carl replies “Carl sent your message to these topics:” followed by a numbered list of links to those Topics

#### Scenario: A sender cannot file

- **WHEN** a sender’s plan does not include email
- **THEN** the same-thread reply links to the plans page and no matching or filing occurs
- **WHEN** the shared UTC-day allowance is exhausted
- **THEN** the reply says “The day's email limit is reached.” and gives the next UTC reset
- **AND** a refusal creates no item and uses no allowance

### Requirement: Clarify using the same email thread

If the subject has no nonempty `topic:` hint, or no Topic clearly matches, Carl SHALL ask the sender which existing Topics to use. He SHALL list up to five relevant editable Topics, numbered in stable order, or ask for Topic names when there are no suggestions. The sender MAY reply with numbers, names, or both. Only newly written reply text SHALL choose destinations.

#### Scenario: Strong matches without a subject Topic wait for approval

- **WHEN** a new email has no nonempty `topic:` hint in the subject, including when its first body line names a Topic
- **THEN** Carl sends numbered suggestions in the same thread even when matches are strong
- **AND** no Personal Source Entry is created, no context work is scheduled, and no daily send is charged before the sender chooses
- **AND** replying with numbers or existing Topic names files the original once through the existing selection flow

#### Scenario: A reader replies with numbers and a name

- **WHEN** the verified sender replies with `1, 3, AI Agent infrastructure` to Carl’s clarification
- **THEN** Carl resolves the original choices, accepts an unambiguous written name or close spelling and rechecks edit access and entitlement
- **AND** he retrieves the original message from Resend, files it to all selected Topics together and replies with links
- **AND** a copied thread reference from another account grants no access

#### Scenario: A choice is ambiguous or permission changes

- **WHEN** a number is invalid, a written name is ambiguous, or a destination is no longer editable
- **THEN** Carl asks for clarification without partially filing, revealing a lost Topic or charging the sender
- **AND** he never assigns an existing number to a different Topic

#### Scenario: A reply has only one character

- **WHEN** the email client sends “2” with the original thread references and no quoted history
- **THEN** Carl uses the sender-bound provider reference and original ordered Topic IDs
- **AND** clarification stores no copy of the original body, attachments, links or private Topic names for matching
- **AND** successful filing or account deletion removes the saved choices

#### Scenario: The original is no longer available

- **WHEN** Resend confirms that the original email cannot be retrieved
- **THEN** Carl asks the sender to send it again with a Topic hint and records no accepted item or charge
- **AND** temporary provider failures retry before that fallback

### Requirement: Replies and retries cannot file twice

Carl SHALL use RFC Message-ID, In-Reply-To, References and the original subject to keep replies together. Signed webhook deliveries, retries and simultaneous replies SHALL produce at most one item per destination and one daily charge per original email. Reply snapshots SHALL be encrypted and erased on delivery or abandonment.

#### Scenario: A webhook or reply is redelivered

- **WHEN** a worker stops after filing or a provider times out after accepting a reply
- **THEN** the same provider request identity and reply resume, without rematching, charging again or restoring a deleted item
- **AND** deleting an entry, deleting an account or changing the account email prevents stale private receipts from being sent

#### Scenario: A digest reply has a new link

- **WHEN** the sender replies to Carl with a new safe public link
- **THEN** Carl processes the new text and links as a fresh request
- **AND** a linkless acknowledgment or a link present only in quoted history produces no filing or reply

### Requirement: Preserve sender privacy and link provenance

Carl SHALL keep bounded text and safe public links encrypted until the sender deletes the filed item. He SHALL discard attachments, tracking links and quoted reply history without loading remote content. A deliberate forward SHALL retain its forwarded content. Scoring SHALL distinguish direct sends and forwards from forwarded newsletters.

#### Scenario: A forwarded newsletter is filed

- **WHEN** a newsletter contains a public article, an unsubscribe link and an attachment
- **THEN** only the bounded content and safe article links are retained
- **AND** newsletter links receive half the personal-source bonus and remain subject to relevance review

### Requirement: Readers can find out how to email Carl

The email guide SHALL cover the digest sender address, optional Topic hints, same-thread selections, filtering, privacy, Plus/Premium access, the shared limit and retention. It SHALL distinguish manually forwarding a message from reading a reader's mailbox.

#### Scenario: A reader wants to send a message

- **WHEN** they open the email guide
- **THEN** they can send their first message, answer a clarification, and find the saved item on the Topic
