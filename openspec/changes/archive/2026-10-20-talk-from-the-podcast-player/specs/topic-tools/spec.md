## MODIFIED Requirements

### Requirement: The chat adapter binds the Topic and gates the tool list

The chat turn route SHALL add the edit tools to Carl's tool list only when the gate grants the user `topic:edit` on the
Topic, and the conversation payload SHALL say so. The Topic SHALL be bound from the chat turn's page and SHALL NOT
appear in any tool's input schema. A user without edit rights, and a visitor on a public Topic, SHALL get the read-only
Carl. In the private chat and in a Topic's team chat room alike, the edit tools SHALL be `proposeTopicEdit` and
`cancelTopicEdit` alone: Carl SHALL propose an edit by calling `proposeTopicEdit`, which saves nothing and puts the
Topic's card in front of the user as a preview, citing the findings and relevance explanations behind it, and the server
SHALL apply the change only through the proposal rule, never through a tool the model calls. A room turn SHALL offer
those two tools only when the gate grants the member who addressed Carl `topic:edit` on that Topic, and the team's own
room, which has no Topic, SHALL offer none. No room turn SHALL offer a tool that saves. A proposal SHALL stop standing
once the user's next message on that page takes it, whether or not it agrees, or Carl cancels it, so a later yes
answering some other question never writes to the Topic. A question asked from the podcast player SHALL take no
proposal, so a preview standing before one lapses, because the digest check reads the history's last turn. A turn in
which a change was applied SHALL keep its text even when the gate denies `chat:persist`, and its spend SHALL be metered
as a chat turn row in the same budget pool as a read-only turn. The chat SHALL show a toast for each save in a turn, and
an error toast for each change the Topic Tools reject, naming what stopped it.

#### Scenario: An editor's Carl can edit

- **WHEN** the Topic's owner or a member of its owning team sends a private chat turn
- **THEN** the turn runs with `proposeTopicEdit` and `cancelTopicEdit` available and no saving tool, and the
  conversation payload says the user may edit

#### Scenario: Everyone else keeps the read-only Carl

- **WHEN** a subscriber, a member of a Team that only holds a share, or a visitor on a public Topic opens the chat
- **THEN** the turn runs with no edit tool and the payload says they may not edit

#### Scenario: A message cannot point a tool at another Topic

- **WHEN** a message asks Carl to edit a different Topic by name or id
- **THEN** no tool accepts a Topic argument, and any edit applies to the conversation's Topic alone

#### Scenario: Carl proposes before he acts

- **WHEN** an editor asks Carl to tighten the prompt
- **THEN** he calls `proposeTopicEdit` with the wording he would save, the card shows it as a preview over the Topic as
  it stands, his reply names the findings and explanations behind it, and no Prompt Version is written until the
  user's next message agrees

#### Scenario: A yes with nothing proposed saves nothing

- **WHEN** a user answers yes in a turn where Carl has proposed no change
- **THEN** no agreement check runs and nothing is saved

#### Scenario: A yes after the proposal was already saved saves nothing

- **WHEN** a user agreed to a proposal earlier in the conversation, it was saved, and they later answer yes to an
  unrelated question such as "want me to dig into that finding?"
- **THEN** no proposal is pending, so nothing is written to the Topic

#### Scenario: A tool-firing turn persists and is metered

- **WHEN** a change is applied in a chat turn
- **THEN** the turn's text is kept whatever the persistence gate says, and its tokens, the agreement check's tokens,
  and its searches are metered as a chat turn row

#### Scenario: The chat confirms the edit and the page shows it

- **WHEN** a change is saved in a turn, in the private chat or in a team chat room
- **THEN** the chat shows a toast naming each save, and the Topic page reloads its payload and shows the new prompt or
  Source

#### Scenario: The chat reports a rejected edit

- **WHEN** the Topic Tools reject a change in a turn, because the Topic is full, the Source is already read, or the
  plan says no
- **THEN** the chat shows an error toast naming what stopped it, whatever Carl's reply says

#### Scenario: A team room turn edits for a member with edit rights

- **WHEN** a member the gate grants `topic:edit` addresses Carl in the Topic's team chat room, Carl previews an edit,
  and that member's next message to Carl agrees
- **THEN** the server applies the edit with a Prompt Version of origin `chat`, and Carl's reply posts to the room for
  every member to read

#### Scenario: A team room turn from a member without edit rights stays read-only

- **WHEN** a member the gate does not grant `topic:edit` addresses Carl in that room, whoever proposed the change
- **THEN** the turn runs with no edit tool and nothing is written

## ADDED Requirements

### Requirement: A team room applies only a preview that the member it was shown to agrees to
At the end of a room turn whose last preview call still stands, the server SHALL record that preview in
`chat_proposals` for the member who addressed Carl and the room's Topic, apart from that member's private chat
preview on the same Topic. Room messages are kept, so the row SHALL hold the preview itself, encrypted the way stored
chat text is, with the room's chat turn row.

That member's next message that addresses Carl in that room SHALL take the row and delete it before anything else
runs. The preview SHALL go to the same agreement check the private chat uses, over that member's own words in that
message alone, with no other member's message, transcript line, attachment, finding, or tool. On `agree`, the server
SHALL apply it through the Topic Tools under that member's rights, which they check again. On `decline` or `unclear`,
it SHALL apply nothing, as in the private chat. Carl SHALL be told the outcome. Another member's message SHALL never
answer the preview, whatever it says and whatever rights that member has. A request from a member without edit rights
SHALL reach the Topic only if an editor's own turn previews it and that editor agrees.

#### Scenario: The member who was shown the preview agrees
- **WHEN** Carl previews a daily frequency for one editor in the room, and that editor's next message to Carl is "yes"
- **THEN** the agreement check returns agree, and the frequency is saved under that editor's rights

#### Scenario: Another member's yes saves nothing
- **WHEN** Carl previewed an edit for one member, and a different member, even one with edit rights, writes
  "@carl yes, save it"
- **THEN** no proposal is waiting for that member, nothing is saved, and the first member's preview still stands

#### Scenario: A non-editor cannot steer an editor's turn into a save
- **WHEN** a member without edit rights writes "@carl make this topic public", and an editor then asks Carl an
  unrelated question
- **THEN** the editor's turn has no tool that saves, nothing is written, and at most Carl previews the change for that
  editor to agree to

#### Scenario: The room and the private chat keep separate previews
- **WHEN** an editor has a preview standing in the Topic's private chat and another in its team room
- **THEN** each is answered only by that editor's next message on its own page
