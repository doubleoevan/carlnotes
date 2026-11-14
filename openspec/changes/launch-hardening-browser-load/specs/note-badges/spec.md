## MODIFIED Requirements

### Requirement: Badge refresh belongs to the active account

Both clients SHALL refresh note badges for the current account and clear old-account badge state on session exit or
replacement. The note badges SHALL arrive with the badges read on its one poll, and again right after the user's own
read record, and no timer of their own SHALL read them. Mobile SHALL refresh on foregrounding, reconnection, and the
active polling interval. Failed refreshes SHALL retain the last confirmed counts. Late responses from an earlier
account SHALL never populate the current account's badges.

#### Scenario: A user changes accounts during a poll

- **WHEN** account A's badge response arrives after account B signs in
- **THEN** no count, note name, or Topic name from A appears for B

#### Scenario: A refresh fails

- **WHEN** mobile loses connectivity or a badge request fails
- **THEN** known counts remain until a successful refresh confirms different values

#### Scenario: New changes arrive after a read

- **WHEN** another user edits or comments after the read record was accepted
- **THEN** the next refresh can show those changes and an old local suppression does not hide them indefinitely

#### Scenario: The note badges ride the badges poll

- **WHEN** the badges poll runs in a signed-in tab or in the foregrounded app
- **THEN** the note badges refresh from the badges read, and no separate note badges request is sent on a timer
