## MODIFIED Requirements

### Requirement: The chat adapter binds the Topic and gates the tool list
The chat turn route SHALL add the edit tools to Carl's tool list only when the gate grants the user `topic:edit` on the Topic, and the conversation payload SHALL say so. The Topic SHALL be bound from the chat turn's page and SHALL NOT appear in any tool's input schema. A user without edit rights, and a visitor on a public Topic, SHALL get the read-only Carl. Carl SHALL propose an edit by calling `proposeTopicEdit`, which saves nothing and puts the Topic's card in front of the reader as a preview, citing the findings and relevance explanations behind it, and SHALL call a tool that saves only in a turn after the user confirmed. `proposeTopicEdit` and `cancelTopicEdit` SHALL be bound outside the tools a consent may be forced to call, so a yes can never be satisfied by a tool that saves nothing. A consent SHALL be answered with a forced save only while a proposal is still standing, and a proposal SHALL stop standing once Carl cancels it or a Topic Tool saves, so a later yes answering some other question never writes to the Topic. A turn in which a tool fired SHALL keep its text even when the gate denies `chat:persist`, and its spend SHALL be metered through the same chat ledger and budget pool as a read-only turn. The chat SHALL show a toast for each save a Topic Tool makes in a turn, and an error toast for each change a Topic Tool rejects, naming what stopped it. A Topic's team chat room turn SHALL offer the same tools when the gate grants the member who addressed Carl `topic:edit` on that Topic, and the team's own room, which has no Topic, SHALL offer none.

#### Scenario: An editor's Carl can edit
- **WHEN** the Topic's owner or a member of its owning team sends a chat turn
- **THEN** the turn runs with the edit tools available, and the conversation payload says the user may edit

#### Scenario: Everyone else keeps the read-only Carl
- **WHEN** a subscriber, a member of a Team that only holds a share, or a visitor on a public Topic opens the chat
- **THEN** the turn runs with no edit tool and the payload says they may not edit

#### Scenario: A message cannot point a tool at another Topic
- **WHEN** a message asks Carl to edit a different Topic by name or id
- **THEN** no tool accepts a Topic argument, and any edit applies to the conversation's Topic alone

#### Scenario: Carl proposes before he acts
- **WHEN** an editor asks Carl to tighten the prompt
- **THEN** he calls `proposeTopicEdit` with the wording he would save, the card shows it as a preview over the Topic as it stands, his reply names the findings and explanations behind it, and no Prompt Version is written until a later turn in which the user agrees

#### Scenario: A yes with nothing proposed saves nothing
- **WHEN** a reader answers yes in a turn where Carl has proposed no change
- **THEN** no tool call is forced and nothing is saved

#### Scenario: A yes after the proposal was already saved saves nothing
- **WHEN** a reader agreed to a proposal earlier in the conversation, it was saved, and they later answer yes to an unrelated question such as "want me to dig into that finding?"
- **THEN** the earlier proposal no longer stands, so no tool call is forced and nothing is written to the Topic

#### Scenario: A tool-firing turn persists and is metered
- **WHEN** a Topic Tool fires in a chat turn
- **THEN** the turn's text is kept whatever the persistence gate says, and its tokens and searches are metered through the chat ledger

#### Scenario: The chat confirms the edit and the page shows it
- **WHEN** a Topic Tool saves in a turn, in the private chat or in a team chat room
- **THEN** the chat shows a toast naming each save, and the Topic page reloads its payload and shows the new prompt or Source

#### Scenario: The chat reports a rejected edit
- **WHEN** a Topic Tool rejects a change in a turn, because the Topic is full, the Source is already read, or the plan says no
- **THEN** the chat shows an error toast naming what stopped it, whatever Carl's reply says

#### Scenario: A team room turn tunes for a member with edit rights
- **WHEN** a member the gate grants `topic:edit` addresses Carl in the Topic's team chat room and confirms a proposed edit
- **THEN** the turn runs with the edit tools, the edit is saved with a Prompt Version of origin `chat`, and Carl's reply posts to the room for every member to read

#### Scenario: A team room turn from a member without edit rights stays read-only
- **WHEN** a member the gate does not grant `topic:edit` addresses Carl in that room, whoever proposed the change
- **THEN** the turn runs with no edit tool and nothing is written

### Requirement: The MCP adapter takes the Topic as an argument and asks no second confirmation
The MCP server SHALL register the edit tools with `topic_id` as an ordinary argument, each annotated `readOnlyHint: false` and `destructiveHint: true`. A visitor's call SHALL return the connect-an-account result. A user's call SHALL run the tool and return its result, the cost included, with no confirmation step. The client runs its own tool approval.

#### Scenario: An MCP edit runs on approval alone
- **WHEN** an authenticated client calls `update_topic_prompt` for a Topic the user may edit
- **THEN** the prompt is saved with a Prompt Version of origin `mcp` and the result confirms it, with no confirmation step from the server

#### Scenario: The tools are annotated destructive
- **WHEN** a client lists tools
- **THEN** the edit tools have a destructive hint and the read tools have a read-only hint
