## MODIFIED Requirements

### Requirement: The wizard asks who should see the Topic
The `chat-new-topic.md` prompt SHALL tell Carl to ask, after the Sources and before the invites, whether the Topic is
for everyone, for people the user invites, or for the user alone, and to write the answer into the draft with
`draftTopic` as `public`, `invite`, or `private`. The Topic Draft SHALL hold a `visibility` that defaults to `invite`,
the draft card SHALL show it, and `createTopicFromDraft` SHALL create the Topic with it.

#### Scenario: A public Topic is asked for
- **WHEN** a user says anyone should be able to read it
- **THEN** the card reads Public, and the created Topic's visibility is `public`

#### Scenario: The visibility is skipped
- **WHEN** a user who leads a team says yes to the Topic without answering who should see it
- **THEN** the Topic is created shared by invite, on the team the user picked

### Requirement: The wizard asks which team the Topic joins
The `chat-new-topic.md` prompt SHALL list the teams the user leads, and SHALL tell Carl that a public or invite Topic
goes on one of them. After the visibility step, unless the draft is private or already names a team, Carl SHALL name the
user's teams and ask which one the Topic goes on, writing the pick into the draft's `team` field, `{ teamId, name }`,
with `draftTopic`. A user who wants no team, or who leads none, SHALL get a private Topic: Carl says so and writes the
visibility as private. Carl's read-back before the yes SHALL include the team.

The chat's create tool SHALL NOT create a public or invite draft that names no team. It SHALL return a line telling Carl
to ask which team the Topic goes on, or to make it private, and SHALL create nothing.

The Topic Draft SHALL hold a `team` that defaults to none, the draft card SHALL show its name, and
`createTopicFromDraft` SHALL add the created Topic to it through the leader-only add-to-team path, reporting a rejected
add beside the created Topic.

#### Scenario: A leader team is picked
- **WHEN** a user who leads a team makes a public Topic and picks that team
- **THEN** the card shows the team, and the created Topic is on it

#### Scenario: The user leads no team
- **WHEN** a user on no team, or a member of teams they do not lead, makes a Topic with Carl
- **THEN** Carl says the Topic will be private, and it is created private on no team

#### Scenario: A shared draft with no team is not created
- **WHEN** Carl calls the create tool on a public or invite draft that names no team
- **THEN** no Topic is created, and the tool tells Carl to ask which team or to make it private

#### Scenario: The add is rejected at the save
- **WHEN** the draft names a team the user no longer leads
- **THEN** the Topic is created, an error toast says it was not added to the team, and Carl says so
