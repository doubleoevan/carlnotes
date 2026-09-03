## ADDED Requirements

### Requirement: Deleting a led team never blocks and never strands members

A leader SHALL be able to delete any team they lead, including the last one — no code depends on a
user leading a team, and the teams index designs the zero-team state. Deleting a team whose only
active member is the caller SHALL delete it outright, its topics returning to their owners.

Deleting a team that has other active members SHALL NOT destroy their shared space: the caller
leaves instead, and when no other leader remains, the oldest active member — earliest membership
row — SHALL be promoted to leader first. The response SHALL name the new leader so the UI can say
who holds the team now.

#### Scenario: The solo default team deletes to zero teams

- **WHEN** a user deletes the only team they lead and they are its only member
- **THEN** the team is deleted and the user has no teams

#### Scenario: A populated team survives its leader leaving

- **WHEN** the only leader deletes a team that has other active members
- **THEN** the oldest member becomes leader, the caller is removed, and the team survives
