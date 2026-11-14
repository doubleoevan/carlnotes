## REMOVED Requirements

### Requirement: The wizard asks which team the Topic joins

**Reason**: A shared draft now starts on the user's default team, and the create tool no longer stops a shared draft
with no team.

**Migration**: The requirements "A shared draft starts on the default team", "Carl's read-back names the draft's team",
and "The draft holds its team" hold the wizard's team rules.

## ADDED Requirements

### Requirement: A shared draft starts on the default team

The `chat-new-topic.md` prompt SHALL list the teams the user leads, the default team first and marked. A public or
invite draft SHALL go on the default team when the chat loads it and when `draftTopic` writes it, unless it names
another led team. Carl SHALL NOT ask which team the Topic goes on. A private draft holds no team, and a user who leads
no team gets the Topic at the visibility they chose on no team.

#### Scenario: A public draft goes on the default team

- **WHEN** a user who leads two teams makes a Topic public with Carl
- **THEN** the draft is on the led team they joined first, and Carl does not ask which team

#### Scenario: The user leads no team

- **WHEN** a user on no team, or a member of teams they do not lead, makes a public Topic with Carl
- **THEN** the Topic is created public on no team

### Requirement: Carl's read-back names the draft's team

Carl SHALL say which team a shared draft is on and, if the user leads other teams, name them as the teams it could go
on instead, without asking first. His read-back before the yes SHALL do the same. A user who picks another team gets
it written with `draftTopic` as `{ teamId, name }`.

#### Scenario: Another led team is offered and picked

- **WHEN** Carl names the default team and the user asks for their other team
- **THEN** the card shows that team, and the created Topic is on it

### Requirement: The draft holds its team

The Topic Draft SHALL hold a `team`, the draft card SHALL show its name, and `createTopicFromDraft` SHALL add the
created Topic to it through the leader-only add-to-team path, reporting a rejected add beside the created Topic.

#### Scenario: The add is rejected at the save

- **WHEN** the draft names a team the user no longer leads
- **THEN** the Topic is created, an error toast says it was not added to the team, and Carl says so
