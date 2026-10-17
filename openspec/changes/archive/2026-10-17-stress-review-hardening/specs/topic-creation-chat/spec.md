## MODIFIED Requirements

### Requirement: Carl runs the wizard in words and fills the Topic Draft

The new-topic chat's reply SHALL be built from a versioned `chat-new-topic.md` prompt with the docs block and no Topic
material, with the web search tool, `suggestSources`, `draftTopic`, and `proposeNewTopic` on, and no tool that creates
the Topic. The prompt SHALL tell Carl to ask what the user wants to follow, to propose a title and a prompt in the
user's words, to call `suggestSources` with them and offer what comes back, to ask whether anyone should read along by
email and whether any file is worth attaching as optional steps, to write each settled answer into the draft with
`draftTopic`, and to read the draft back, call `proposeNewTopic`, and wait. `proposeNewTopic` SHALL save nothing. The
server SHALL create the Topic from the draft only if the user's next message agrees to the draft that turn left, under
the proposal rule, and Carl SHALL be told whether it was created. The prompt SHALL include the rule that only a
draftTopic call or a server create in this turn is a save. A user who answers several questions at once SHALL be taken
ahead, and one who changes an answer SHALL be taken back.

#### Scenario: Carl proposes before he creates

- **WHEN** a user says what they want to follow
- **THEN** Carl answers with a title, a prompt, and the Sources the suggestion flow verified, asks about invites, and
  nothing is created until he has called `proposeNewTopic` and the user's next message agrees

#### Scenario: A user skips the invites

- **WHEN** a user says nobody, or agrees to the Topic without naming anyone
- **THEN** the Topic is created with no invites

#### Scenario: An app question still gets an answer

- **WHEN** a user asks what a brew is mid-wizard
- **THEN** Carl answers from the glossary and the docs block and returns to the wizard
