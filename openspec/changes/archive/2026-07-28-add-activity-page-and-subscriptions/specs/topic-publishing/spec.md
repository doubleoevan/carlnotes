## ADDED Requirements

### Requirement: The owner publishes a Topic by setting its visibility
The edit-topic modal's visibility field SHALL be the publish control: it sets `topics.visibility` (public, invite, or private) through the topic-update endpoint, authorized through the gate like every other Topic write, with no dedicated visibility endpoint. An invite Topic stays unlisted — off the homepage, its URL gated by the invited-email list. Demoting a public Topic to private SHALL leave its subscription rows in place: they simply stop resolving, since a private Topic refuses everyone but the owner, and nothing is deleted, so re-publishing restores the previous subscribers.

#### Scenario: Publishing opens the Topic
- **WHEN** the owner sets a private Topic's visibility to public
- **THEN** the Topic appears on the public read path and its findings are browsable

#### Scenario: Demoting keeps subscription rows inert
- **WHEN** the owner sets a public Topic with subscribers back to private and later re-publishes it
- **THEN** no subscription row is deleted, subscribers see nothing while private, and re-publishing restores their access

#### Scenario: A non-owner cannot change visibility
- **WHEN** a signed-in user who is neither the owner nor an admin submits a visibility change through the topic-update endpoint
- **THEN** the api rejects it

### Requirement: Self-subscribing to a public Topic stays consentless and idempotent
The Subscribe control SHALL create and remove the calling user's own subscription row on a public Topic they can already see, refused on a private Topic, idempotent on repeat. No consent step SHALL be added: the user is only granting themselves read access to already-public content. The subscribe bell SHALL render on the topic page and on each homepage feed card (right of the "# new" count, non-owners only), filled in the primary color while subscribed; a signed-out click SHALL route to signup instead of calling the api.

#### Scenario: Subscribe and unsubscribe round-trip
- **WHEN** a signed-in non-owner subscribes to a public Topic and later unsubscribes
- **THEN** their subscription row is created then removed, and repeating either action changes nothing

#### Scenario: A visitor's bell click routes to signup
- **WHEN** a signed-out visitor clicks a subscribe bell on the feed or a topic page
- **THEN** they land on the signup page and no subscription request is sent

### Requirement: Invites are pending until the invitee accepts
An invite SHALL never silently subscribe anyone or force a Topic into their view. An owner's invite SHALL create a pending invite that grants no subscription until the invitee accepts. The invitee SHALL see their pending invites on their own Activity page and approve or deny each: approval creates their subscription row, active from that moment; denial deletes the invite. No email SHALL be sent — the approve/deny inbox is on-platform. Only the owner MAY add invitees, and only to their own Topic. Authority stays `topic.owner_id` throughout: a subscriber gets read access through the subscription path, never through a role.

#### Scenario: An invite grants nothing until accepted
- **WHEN** an owner invites a user's email to an invite Topic
- **THEN** the Topic does not enter that user's subscriptions or feed, and no Findings open to them, until they accept

#### Scenario: Accepting activates the subscription
- **WHEN** the invitee approves the pending invite on their Activity page
- **THEN** their subscription row is created and active from that moment

#### Scenario: Denying removes the invite
- **WHEN** the invitee denies the pending invite
- **THEN** the invite is deleted and nothing else changes

### Requirement: Invite-topic Findings open only from activation forward
On an invite Topic — where the subscription is the sole access grant — a subscriber SHALL see only Findings whose Scan started after their subscription became active, never the back catalogue, so Scans influenced by earlier configuration (including private-era context) stay invisible to later joiners. The filter SHALL compare the start time of the Scan that last touched each Finding (its `scanId`'s Scan) against the subscription's activation time. The owner SHALL be exempt and always see full history. Public Topics SHALL stay fully browsable for everyone, subscribers included.

#### Scenario: A new subscriber sees no back catalogue
- **WHEN** a user accepts an invite on a Topic with existing Findings
- **THEN** they see no Findings until a Scan starts after their activation, and Findings from that Scan onward are visible

#### Scenario: The owner keeps full history
- **WHEN** the owner views their invite Topic
- **THEN** every Finding renders regardless of any subscriber's activation time

#### Scenario: A public topic's catalogue stays open to its subscribers
- **WHEN** a user subscribes to a public Topic
- **THEN** they continue to see the Topic's full Findings history, exactly as any visitor does

### Requirement: The consent moment sets the next-scan expectation
Because an invite acceptor sees nothing until the next scheduled Scan runs, the accept controls SHALL carry a static disclaimer and acceptance SHALL show a toast, both worded around the next scheduled scan rather than an immediate result, so a weekly-cadence Topic does not read as broken during the wait.

#### Scenario: Accepting sets the expectation
- **WHEN** the invitee accepts a pending invite
- **THEN** a toast tells them the Topic fills in after its next scheduled scan, and the accept control carried the same disclaimer before the click
