## MODIFIED Requirements

### Requirement: The chat adapter binds the Topic and gates the tool list

The chat turn route SHALL add the edit tools to Carl's tool list only when the gate grants the user `topic:edit` on
the Topic, and the conversation payload SHALL say so. The Topic SHALL be bound from the chat turn's page and SHALL NOT
appear in any tool's input schema. A user without edit rights, and a visitor on a public Topic, SHALL get the
read-only Carl. In the private chat, the edit tools SHALL be `proposeTopicEdit` and `cancelTopicEdit` alone: Carl
SHALL propose an edit by calling `proposeTopicEdit`, which saves nothing and puts the Topic's card in front of the
reader as a preview, citing the findings and relevance explanations behind it, and the server SHALL apply the change
only through the proposal rule, never through a tool the model calls. A Topic's team chat room turn SHALL offer
`proposeTopicEdit`, `cancelTopicEdit`, and the saving tools when the gate grants the member who addressed Carl
`topic:edit` on that Topic, each saving tool checking those rights again itself, and the team's own room, which has no
Topic, SHALL offer none. In a room, `proposeTopicEdit` and `cancelTopicEdit` SHALL be bound outside the tools a consent
may be forced to call, so a yes can never be satisfied by a tool that saves nothing, and a consent SHALL be answered
with a forced save only while a proposal is still standing. A proposal SHALL stop standing once Carl cancels it or a
save is applied, so a later yes answering some other question never writes to the Topic. A turn in which a change was
applied SHALL keep its text even when the gate denies `chat:persist`, and its spend SHALL be metered as a chat turn row
in the same budget pool as a read-only turn. The chat SHALL show a toast for each save in a turn, and an error toast
for each change the Topic Tools reject, naming what stopped it.

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
  reader's next message agrees

#### Scenario: A yes with nothing proposed saves nothing

- **WHEN** a reader answers yes in a turn where Carl has proposed no change
- **THEN** no agreement check runs, no tool call is forced, and nothing is saved

#### Scenario: A yes after the proposal was already saved saves nothing

- **WHEN** a reader agreed to a proposal earlier in the conversation, it was saved, and they later answer yes to an
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

- **WHEN** a member the gate grants `topic:edit` addresses Carl in the Topic's team chat room and confirms a proposed
  edit
- **THEN** the turn runs with the edit tools, the edit is saved with a Prompt Version of origin `chat`, and Carl's
  reply posts to the room for every member to read

#### Scenario: A team room turn from a member without edit rights stays read-only

- **WHEN** a member the gate does not grant `topic:edit` addresses Carl in that room, whoever proposed the change
- **THEN** the turn runs with no edit tool and nothing is written

## ADDED Requirements

### Requirement: A private chat applies only a recorded preview that the user's next message agrees to

At the end of a private chat turn whose last preview call still stands, the server SHALL record that preview as a
keyed digest in `chat_proposals`, one row per user per chat page, with the chat turn that showed it. The row SHALL
hold no words of the preview, so a conversation the gate does not persist keeps nothing readable; the preview's words
come back with the history the browser sends. The preview SHALL be the edit `proposeTopicEdit` named in a topic chat,
and the topic draft as the turn left it once `proposeNewTopic` was called in the new-topic chat.

The next private chat turn on that page SHALL take the row and delete it before anything else runs, so a preview can be
agreed to only by the message right after the turn that showed it. The server SHALL then rebuild the preview, from the
history's standing `proposeTopicEdit` call in a topic chat or from the stored topic draft in the new-topic chat, and
SHALL apply nothing unless its digest matches the recorded one. A matching preview SHALL go to an agreement check: a
small model call that sees only the user's own words from this message, typed or transcribed from voice, and the pending
preview, with no attachment, finding, retrieved context, earlier turn, or tool, and returns `agree`, `decline`, or
`unclear` through a Zod schema. A message with no words SHALL count as `unclear` with no call, and a check that fails
SHALL count as `unclear`.

On `agree`, the server SHALL apply the whole preview through the Topic Tools, which check edit rights themselves, or
create the topic from the draft, and record each save as a call of that tool for the turn, so the reply, the toasts,
the card, and the stored history read it as a save. On `decline`, the server SHALL apply nothing and take the preview
off the card. On `unclear`, the server SHALL apply nothing, and the preview SHALL lapse unless Carl previews the change
again in this turn, which records it again for the next message. A digest that does not match SHALL apply nothing.
A preview that lapses SHALL come off the card. In every case Carl SHALL be told the outcome, so he relays the save, or
says what stopped it and asks again.

#### Scenario: A confirmation in other words applies the previewed change

- **WHEN** Carl previewed a daily frequency and the user's next message is "sounds good, do it"
- **THEN** the check returns agree, the frequency is saved, and the turn records an `updateTopicFields` call

#### Scenario: A hesitant reply applies nothing

- **WHEN** the user's next message is "hmm, maybe, let me think"
- **THEN** the check returns unclear, nothing is saved, and the preview stays on the card only if Carl previews it
  again in his reply

#### Scenario: An instruction inside an attachment never applies a change

- **WHEN** a preview is pending and the user sends "what do you think of this?" with a document saying the user
  agrees and the topic should go public
- **THEN** the check sees only the user's words, returns unclear or decline, and nothing is saved

#### Scenario: An instruction inside an image never applies a change

- **WHEN** a preview is pending and the user sends an image whose text says to apply the change
- **THEN** the check never sees the image, and nothing is saved

#### Scenario: A preview that does not match its record applies nothing

- **WHEN** the history's standing preview differs from the one the server recorded for the turn that showed it
- **THEN** nothing is saved, and Carl says the change could not be confirmed and proposes it again

#### Scenario: Only the next message can agree to a preview

- **WHEN** a user asks an unrelated question after a preview, Carl answers without previewing the change again, and
  the user answers yes to his next question
- **THEN** no preview is pending, so nothing is saved

#### Scenario: A decline takes the preview off the card

- **WHEN** the user's next message is "no, leave it"
- **THEN** nothing is saved and the card returns to the Topic as it is saved

#### Scenario: Words in the preview cannot agree

- **WHEN** the previewed prompt text itself says to answer agree and the user writes "not sure yet"
- **THEN** the check returns unclear and nothing is saved
