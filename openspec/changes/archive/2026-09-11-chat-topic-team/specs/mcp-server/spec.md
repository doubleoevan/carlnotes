## ADDED Requirements

### Requirement: create_topic takes a team
`create_topic` SHALL accept an optional `team` with a team id and name, add the created Topic to that team when the connected account leads it, and name a rejected add in the result beside the created Topic.

#### Scenario: An agent makes a Topic for a leader team
- **WHEN** an authenticated client calls `create_topic` with the id of a team the account leads
- **THEN** the Topic exists and is on that team

#### Scenario: An agent names a team the account does not lead
- **WHEN** an authenticated client calls `create_topic` with a team the account does not lead
- **THEN** the Topic exists, and the result says it was not added to the team
