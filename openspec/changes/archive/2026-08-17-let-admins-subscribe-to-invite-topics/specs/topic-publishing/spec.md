## MODIFIED Requirements

### Requirement: Invites are pending until the invitee accepts
An invite SHALL never silently subscribe anyone or force a Topic into their view. An owner's invite SHALL create a pending invite that grants no subscription until the invitee accepts. The invitee SHALL see their pending invites on their own Activity page and approve or deny each: approval creates their subscription row, active from that moment; denial deletes the invite. No email SHALL be sent — the approve/deny inbox is on-platform. Only the owner MAY add invitees, and only to their own Topic. Authority stays `topic.owner_id` throughout: a subscriber gets read access through the subscription path, never through a role.

An admin SHALL be able to subscribe themselves to any invite Topic without an invite, since an admin can already read every Topic. This grants the admin no read access they did not have — it puts the Topic in their own feed and emails. It is still self-initiated: an admin SHALL NOT be able to subscribe anyone else, and their subscription SHALL be an ordinary one, counted and emailed and bounded by activation like every other.

#### Scenario: An invite grants nothing until accepted
- **WHEN** an owner invites a user's email to an invite Topic
- **THEN** the Topic does not enter that user's subscriptions or feed, and no Findings open to them, until they accept

#### Scenario: Accepting activates the subscription
- **WHEN** the invitee approves the pending invite on their Activity page
- **THEN** their subscription row is created and active from that moment

#### Scenario: Denying removes the invite
- **WHEN** the invitee denies the pending invite
- **THEN** the invite is deleted and nothing else changes

#### Scenario: An admin subscribes without an invite
- **WHEN** an admin subscribes to an invite Topic they neither own nor were invited to
- **THEN** the api accepts it and their subscription is created, active from that moment

#### Scenario: An uninvited non-admin is still refused
- **WHEN** a user who is neither the owner, an invitee, nor an admin subscribes to an invite Topic
- **THEN** the api rejects it

#### Scenario: A private Topic takes no subscribers at all
- **WHEN** an admin subscribes to a private Topic
- **THEN** the api rejects it, since a private Topic is the owner's alone whoever asks
