## MODIFIED Requirements

### Requirement: Invitees are editable only for invite visibility

The Invitees field SHALL render while the modal's visibility is public or invite, hidden only while it is private: email pills with ✕, an "add email and press enter…" input with an Invite button, and a helper line explaining that invitees are asked to subscribe and choose for themselves. Saved invitees SHALL be stored in `topic_invites`. An invited email SHALL grant topic-page view access and a pending invite the invitee must accept before any subscription exists — saving an invitee SHALL never subscribe them or place the Topic in their view.

Beneath the typed field SHALL sit an invite-with-link button opening a menu of webmail composers, each creating an invite token and opening that provider's own compose window with the invitation prewritten, plus copy link as the universal fallback. Opening a composer SHALL NOT add anyone to the invitee list, since the handoff is one way and returns no recipients. The two paths SHALL be told apart by their controls instead of by explanatory copy: the invitee field names addresses, and the button says it invites with a link.

The section SHALL also list the links that are still good, each showing how much of it is left and a control that revokes it. The addresses stay the pills above, which are the same list under a different grant, so no address is shown twice.

#### Scenario: Switching visibility reveals the invitee editor

- **WHEN** the owner switches visibility from private to invite
- **THEN** the invitee editor appears, and saved emails persist to the invite list

#### Scenario: Saving an invitee does not subscribe them

- **WHEN** the owner saves a new invitee email
- **THEN** the invite is pending for that email's user, and no subscription row exists until they accept

#### Scenario: A compose button adds no invitee

- **WHEN** the owner opens a provider's composer from the invite section
- **THEN** a token is created and the composer opens prewritten, while the invitee list is unchanged

#### Scenario: The invite list distinguishes the two paths

- **WHEN** the owner views a Topic holding both an email invite and a link invite
- **THEN** the address is a pill in the invitee field and the link is a row under the compose buttons showing its uses left, each with its own way to withdraw it
