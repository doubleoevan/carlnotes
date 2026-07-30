## MODIFIED Requirements

### Requirement: Invitees are editable only for invite visibility
The Invitees field SHALL render only while the modal's visibility is invite: email pills with ✕, an "add by email…" input with an Invite button, and a helper line explaining that invitees are asked to subscribe and choose for themselves. Saved invitees SHALL be stored in `topic_invites`. An invited email SHALL grant topic-page view access and a pending invite the invitee must accept before any subscription exists — saving an invitee SHALL never subscribe them or place the Topic in their view.

#### Scenario: Switching visibility reveals the invitee editor
- **WHEN** the owner switches visibility from private to invite
- **THEN** the invitee editor appears, and saved emails persist to the invite list

#### Scenario: Saving an invitee does not subscribe them
- **WHEN** the owner saves a new invitee email
- **THEN** the invite is pending for that email's user, and no subscription row exists until they accept
