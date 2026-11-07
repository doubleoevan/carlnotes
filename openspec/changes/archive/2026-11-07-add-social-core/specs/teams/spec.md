## ADDED Requirements

### Requirement: Team actions that can't be undone ask first

The web and mobile apps SHALL open a confirmation before they remove a member, leave a team from the members table,
delete a sent or received team invitation, remove a topic from a team, or save a leader's change of their own role to
member. Cancelling the confirmation SHALL leave the member, the invitation, the topic, and the role unchanged.

#### Scenario: A leader removes a member

- **WHEN** a leader presses the remove button or the active switch on another member's row
- **THEN** the app asks whether to remove that member, and the member stays on the team until the leader confirms

#### Scenario: A leader steps down

- **WHEN** a leader changes their own role to member
- **THEN** the app asks first, says that only another leader can restore the role, and saves the role on confirmation

#### Scenario: A team leader removes a topic

- **WHEN** a leader presses the remove button, the active switch, or the topic menu's team option for a topic on a team
- **THEN** the app asks first, and the topic stays on the team until the leader confirms

#### Scenario: A user deletes an invitation

- **WHEN** a user presses delete on a team invitation they sent or received
- **THEN** the app asks first, and the invitation stays until the user confirms
