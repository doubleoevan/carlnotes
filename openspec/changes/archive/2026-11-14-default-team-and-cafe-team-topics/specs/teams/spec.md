## ADDED Requirements

### Requirement: A user's default team is their oldest led Team

A user's default team SHALL be the Team of their oldest active leader membership, by the membership's creation time
and then the Team's. A user who leads no Team SHALL have none. A Topic that a Team already owns or has shared in SHALL
keep its Teams.

#### Scenario: Two led Teams

- **WHEN** a user leads two Teams and joined one of them before the other
- **THEN** the default team is the one they joined first

#### Scenario: A held Topic keeps its Team

- **WHEN** a private Topic that a Team already holds is made public
- **THEN** it stays on that Team and is not added to the default team

### Requirement: Every create path puts a shared Topic on the default team

A Topic created public or invite SHALL go on the default team from the web and mobile form, the new-topic chat, and
MCP `create_topic`. The form's Team field SHALL start on the default team for a new Topic and for a private Topic no
Team holds, SHALL let the user pick another led Team or no team, and SHALL NOT be required. MCP `create_topic` SHALL
take an omitted `team` as the default team and `null` as no team.

#### Scenario: A new public Topic from the form

- **WHEN** a user who leads two Teams opens the create form and makes the Topic public
- **THEN** the Team field shows the led Team they joined first, and the saved Topic is on it

#### Scenario: The form saves with no team

- **WHEN** the user clears the Team field on a public Topic and saves
- **THEN** the Topic saves public on no Team

#### Scenario: A user who leads no Team

- **WHEN** a user who leads no Team creates a public Topic from any path
- **THEN** the Topic is created public on no Team

### Requirement: A switch from private puts a Topic on the default team

A private Topic switched to public or invite through the chat or MCP `edit_topic` SHALL go on its owner's default team,
and the saved line SHALL name the Team. An MCP edit that names its own team change SHALL skip the default.

#### Scenario: A private Topic goes public through Carl

- **WHEN** a leader asks Carl to make their private Topic, which no Team holds, public
- **THEN** the Topic goes on their default team, and Carl's saved line names it
