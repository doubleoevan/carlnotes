## ADDED Requirements

### Requirement: The wizard asks which team the Topic joins
The `chat-new-topic.md` prompt SHALL list the teams the user leads, and SHALL tell Carl to ask, after the visibility step, whether the Topic should join one of them, writing the pick into the draft's `team` field, `{ teamId, name }`, with `draftTopic`, skipping the question when the user leads no team or the draft already names one. The Topic Draft SHALL hold a `team` that defaults to none, the draft card SHALL show its name, and `createTopicFromDraft` SHALL add the created Topic to it through the leader-only add-to-team path, reporting a rejected add beside the created Topic.

#### Scenario: A leader team is picked
- **WHEN** a user who leads a team says the topic is for that team
- **THEN** the card shows the team, and the created Topic is on it

#### Scenario: The user leads no team
- **WHEN** a user on no team, or a member of teams they do not lead, makes a Topic with Carl
- **THEN** Carl does not ask about teams, and the Topic is created on none

#### Scenario: The add is rejected at the save
- **WHEN** the draft names a team the user no longer leads
- **THEN** the Topic is created, an error toast says it was not added to the team, and Carl says so

### Requirement: The team page's New topic option offers the chat
The New topic option at the end of the team page's Add Topic picker SHALL open the chooser, its form choice SHALL open the create form with the team preset as today, and its Build with Carl choice SHALL open the new-topic chat with that team already on the draft, so Carl keeps it without asking.

#### Scenario: Carl is chosen from a team page
- **WHEN** a leader picks New topic in the team's Add Topic picker and then Build with Carl
- **THEN** the panel opens on the new-topic chat with the team on the draft card, and the yes creates the Topic on that team
