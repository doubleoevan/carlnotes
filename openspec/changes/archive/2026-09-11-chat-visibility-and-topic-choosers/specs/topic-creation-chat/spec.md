## ADDED Requirements

### Requirement: The wizard asks who should see the Topic
The `chat-new-topic.md` prompt SHALL tell Carl to ask, after the Sources and before the invites, whether the Topic is for everyone, for people the user invites, or for the user alone, and to write the answer into the draft with `draftTopic` as `public`, `invite`, or `private`. The Topic Draft SHALL hold a `visibility` that defaults to `invite`, the draft card SHALL show it, and `createTopicFromDraft` SHALL create the Topic with it.

#### Scenario: A public Topic is asked for
- **WHEN** a user says anyone should be able to read it
- **THEN** the card reads Public, and the created Topic's visibility is `public`

#### Scenario: The visibility is skipped
- **WHEN** a user says yes to the Topic without answering who should see it
- **THEN** the Topic is created shared by invite

### Requirement: The New Topic button offers the chat
The New Topic button on the home, activity, and profile pages SHALL open a dialog with two choices, making the Topic in the form or making it with Carl, and the second SHALL open the panel on the new-topic chat. The team page's Add Topic SHALL keep opening the form, since the chat cannot put a Topic on a team.

#### Scenario: A user chooses Carl
- **WHEN** a signed-in user presses New Topic on the home page and picks making it with Carl
- **THEN** the dialog closes and the panel opens on the new-topic chat

#### Scenario: A user chooses the form
- **WHEN** a signed-in user presses New Topic and picks making it themselves
- **THEN** the create form opens in place of the dialog
