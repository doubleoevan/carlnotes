# topic-tools Specification

## Purpose
TBD - created by archiving change mcp-server-topic-tuning. Update Purpose after archive.
## Requirements
### Requirement: Three Topic Tools live in one module with authorization inside
`apps/api/tool/` SHALL hold `updateTopicPrompt`, `addTopicSource`, and `removeTopicSource`. Each SHALL take the acting user id, the topic id, and its input, load the Topic, and ask `isAllowed(user, "topic:edit", topic)` itself before writing. Each SHALL return a discriminated result: saved, missing, forbidden, or a named validation failure. No caller SHALL check edit rights on a tool's behalf, and a null user id SHALL be rejected.

#### Scenario: A user without edit rights is rejected inside the tool
- **WHEN** any adapter calls a tool for a user who may view but not edit the Topic
- **THEN** the tool returns forbidden and writes nothing

#### Scenario: A visitor is rejected inside the tool
- **WHEN** a tool is called with no user
- **THEN** it returns forbidden and writes nothing

#### Scenario: A fix lands in both adapters
- **WHEN** a tool's authorization or behavior changes
- **THEN** the chat and the MCP server both have the change with no adapter edit

### Requirement: Every prompt change writes a Prompt Version
`updateTopicPrompt` SHALL write `topics.prompt` and, when the prompt changed, insert a Prompt Version in the same transaction through one shared function, saving the Topic, the prompt text, the saving user, the origin, and the time. The topic editor's save SHALL call the same function, and creating a Topic SHALL save its first version.

#### Scenario: A tool edit is versioned
- **WHEN** `updateTopicPrompt` saves a new prompt from either adapter
- **THEN** `topics.prompt` holds the new text and a `topic_prompt_versions` row holds it with that origin and user

#### Scenario: Three saves leave three versions
- **WHEN** an editor's Carl saves the prompt three times in one conversation
- **THEN** three Prompt Versions exist in order, and the previous text of each is readable from the row before it

### Requirement: Editing a Topic never starts a Scan
No Topic Tool SHALL start, request, or schedule a Scan. `addTopicSource` SHALL start the pending llm-guard screen for a url kind and nothing more.

#### Scenario: Three edits start no Scan
- **WHEN** an editor's Carl updates the prompt, adds a Source, and removes a Source
- **THEN** no `scans` row is inserted and the owner's daily scan count is unchanged

### Requirement: addTopicSource takes a source option and returns the projected cost
`addTopicSource` SHALL take a source option key and a value, the same pair the source picker and the suggestion flow use. It SHALL build the Source config through the shared source registry and reject a value the registry cannot build. It SHALL return present for a Source the Topic already holds and SHALL enforce the Topic's Source limit. Its saved result SHALL include what one more Source is projected to cost, in cents per scan and per month at the Topic's frequency. The per-scan figure is the Topic's mean cost over its last five succeeded Scans divided by its ready Source count, plus the ingester's per-scan price for a paid kind. A Topic with no Scans uses a fifth of `SCAN_COST_CENTS` in place of that share.

#### Scenario: A source is added with its projected cost
- **WHEN** an editor adds a reddit Source to a daily Topic with scan history
- **THEN** the Source row exists with the registry's config and the result includes the cost in cents per scan and per month

#### Scenario: A Source is not added twice
- **WHEN** `addTopicSource` is called with a kind and value the Topic already holds
- **THEN** it returns present and no second row exists

#### Scenario: A full Topic rejects
- **WHEN** a Topic holds the maximum number of Sources
- **THEN** `addTopicSource` returns the limit failure and writes nothing

### Requirement: removeTopicSource is scoped to the Topic and idempotent
`removeTopicSource` SHALL delete a Source only when the row belongs to the Topic, SHALL return saved for a row already
gone, and SHALL return missing for a source id that belongs to another Topic. It SHALL keep the Topic's web search,
which only the topic editor turns off, and return `webSearch` for it. It SHALL keep a Topic's last Source and return
`lastSource`, counting the Topic's Sources under a lock on the Topic row, so two removals at once never leave the Topic
with none. The chat, the MCP `edit_topic` tool, and the topic page's remove route SHALL each say which rule kept the
Source.

#### Scenario: Another Topic's source cannot be removed through this one
- **WHEN** `removeTopicSource` names a source id held by a different Topic
- **THEN** it returns missing and that Source still exists

#### Scenario: removeTopicSource keeps web search
- **WHEN** `removeTopicSource` names a Topic's web search Source
- **THEN** it returns `webSearch`, the Source still exists, and the topic editor can still turn web search off
- **AND** a chat removal's toast reads "Carl couldn't remove web search."

#### Scenario: A Topic keeps its last Source
- **GIVEN** a Topic with one Source
- **WHEN** `removeTopicSource` names that Source
- **THEN** it returns `lastSource` and the Source still exists

#### Scenario: Two removals at once leave one Source
- **GIVEN** a Topic with two Sources
- **WHEN** two removals of different Sources run at once
- **THEN** one removes its Source and the other returns `lastSource`

#### Scenario: Two removals of the same Source both return saved
- **GIVEN** a Topic with two Sources
- **WHEN** two removals of the same Source run at once
- **THEN** one deletes it, the other finds the row gone under the Topic row's lock and returns saved, and the Topic
  keeps its other Source

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

### Requirement: createTopicFromDraft runs the editor's create path
`apps/api/tool/` SHALL hold `createTopicFromDraft`, taking the acting user id and a Topic Draft: a name, a prompt, Sources as source option and value pairs, and invite emails. It SHALL build the editor's create payload with the editor's defaults, weekly on Wednesday at 09:00, invite visibility, ten results, no tags, and the default Sources beside the chosen ones built through the shared source registry, and SHALL call the same create function the editor's route calls, with the Prompt Version origin of the adapter. It SHALL return created with the Topic's id and name, or the create path's own rejection: quota, a daily-frequency limit, an invitee the app will not invite, or an unusable Source value. A null user id SHALL be rejected.

#### Scenario: A Topic made by the tool is the editor's Topic
- **WHEN** `createTopicFromDraft` saves from either adapter
- **THEN** the Topic row, its first Prompt Version with the adapter's origin, the owner's subscription, the Sources, and an open first Scan exist as the editor's create writes them

#### Scenario: The topic limit is the gate's
- **WHEN** a user at their plan's topic limit calls `createTopicFromDraft`
- **THEN** it returns quota and writes nothing

#### Scenario: A rejected invitee writes nothing
- **WHEN** an invite email names an account that does not take invites
- **THEN** the tool returns that rejection and no Topic exists

### Requirement: suggestTopicDraftSources returns the editor's suggestions
`apps/api/tool/` SHALL hold `suggestTopicDraftSources`, taking the acting user id, a name, and a prompt, and returning the verified suggestions the editor's Recommend button gets, each with its source option and value, under the same daily suggestion limit and on the user's own key. A reached limit SHALL return a named failure and no suggestions.

#### Scenario: Suggestions are the verified ones
- **WHEN** `suggestTopicDraftSources` runs for a name and prompt
- **THEN** every suggestion was verified readable and names the option and value the draft takes

#### Scenario: The daily limit is returned plainly
- **WHEN** the user has used the day's suggestions
- **THEN** the tool returns the limit failure and no model call is made

### Requirement: updateTopicFields changes a topic's settings
The `updateTopicFields` Topic Tool SHALL take any of `tags`, `frequency`, and `maxTopicFindings`, check edit rights through the same gate as `updateTopicPrompt`, check a move onto a daily frequency against the owner's plan the way the editor does, write the named fields to the Topic, and return the Topic's name.

#### Scenario: A daily move the plan cannot hold
- **WHEN** an editor asks Carl for daily and the owner's plan has no daily slot left
- **THEN** nothing is written and the result names the daily limit

#### Scenario: A member without edit rights
- **WHEN** a reader who may not edit the Topic calls the tool
- **THEN** the gate rejects it and nothing is written

### Requirement: A topic draft holds the podcast setting

The topic draft SHALL hold whether the new Topic's podcast is on. On an instance with a speech model, the new-topic
chat's draft tool SHALL start it on and SHALL take it as a field, so Carl can turn a new Topic's podcast off before the
Topic exists. The MCP create tool SHALL take the same field, and the create SHALL save it, with a Topic whose draft left
it out starting with its podcast on. The card that shows a new Topic's draft and the card that previews a change to a
saved Topic SHALL both read the podcast setting from the draft they show. If the speech model is set empty, the draft
tool SHALL NOT offer the setting and neither card SHALL show it.

#### Scenario: Carl turns a new Topic's podcast off

- **WHEN** a user asks Carl in the new-topic chat for a Topic without a podcast
- **THEN** the draft's card shows the podcast off, and the Topic it creates has its podcast off

#### Scenario: A new Topic's podcast starts on

- **WHEN** Carl writes a new Topic's draft on an instance with a speech model
- **THEN** the draft's card shows the podcast on

#### Scenario: No speech model, no podcast in the draft

- **WHEN** Carl writes a new Topic's draft on an instance with the speech model set empty
- **THEN** the draft has no podcast setting, and its card shows none

### Requirement: updateTopicFields turns a Topic's podcast on and off on any plan

The `updateTopicFields` Topic Tool SHALL take an optional podcast setting beside the Topic's other settings, check edit
rights through the same gate, and write it with the other named fields. The chat adapter and the MCP `edit_topic` tool
SHALL offer it through the same tool, so the chat proposes it on the same card, the user confirms it, and the same
toast reports the save, with no flow of its own. The edit topic modal's podcast switch SHALL save through the same tool.

Turning the podcast on or off SHALL be allowed on every plan for a user who may edit the Topic. If the speech model is
set empty, the tool SHALL NOT offer the setting.

#### Scenario: Carl turns a Topic's podcast off

- **WHEN** an owner asks Carl in chat to turn the Topic's podcast off and confirms the proposal
- **THEN** the setting is saved, the toast reports it, and the Topic's next Scan records no Podcast Episode

#### Scenario: The MCP server changes the same setting

- **WHEN** an MCP client calls `edit_topic` with the podcast setting for a Topic that its user may edit
- **THEN** the setting is saved through the same tool on the first call, and the result names the Topic

#### Scenario: A free Topic with a Podcast Episode turns its podcast on

- **GIVEN** a Topic on the free plan with one published short Podcast Episode and its podcast off
- **WHEN** the owner asks to turn the podcast on
- **THEN** the setting is saved, and the Topic's next Scan records a short Podcast Episode that replaces the published
  one

#### Scenario: A member without edit rights

- **WHEN** a user who may not edit the Topic calls the tool with the podcast setting
- **THEN** the gate rejects it and nothing is written

#### Scenario: No speech model, no setting

- **WHEN** the tool's fields are listed on an instance with the speech model set empty
- **THEN** the podcast setting is not among them

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

### Requirement: A tool description speaks to the client and names no internal identifier

Every MCP tool description SHALL be written for the program and the person reading the tool list: it SHALL address the
caller as "you" and SHALL include no identifier from the code, no variable, type, or parameter name such as
`toolCaller`. The `list_topics` description SHALL say the topics you may read: the public ones for everyone, plus what a
connected account owns, follows, and holds through a team.

#### Scenario: The list_topics description names no identifier

- **WHEN** a client lists tools
- **THEN** the `list_topics` description says "you" where it names the caller, and no description includes `toolCaller`
  or another identifier from the code

### Requirement: The MCP edit_topic tool saves a proposed edit through the chat's save path
The MCP server SHALL expose `edit_topic`, taking `topic_id`, the fields of `proposeTopicEditPayload` that Carl's
`proposeTopicEdit` takes in chat, name, tags, visibility, frequency, schedule, max findings, the podcast setting, the
prompt, sources to add, and source ids to remove, and an optional `confirmation`. It SHALL save through the same
function the chat applies an agreed edit with, in the same order, the prompt, then the settings in one save, then each
removal, then each add, through the Topic Tools, which check edit rights themselves, with Prompt Versions of origin
`mcp`. Before reading the Topic for its result, the tool SHALL ask `isAllowed(user, "topic:edit", topic)` itself, and a
user who may not edit SHALL get the rejection and no Topic fields. A visitor's call SHALL return the
connect-an-account result. The result SHALL hold the status, the Topic before the edit and after it in the topic
card's shape, each saved Source with its id, and each save's outcome, and its text SHALL name each save or what stopped
it. The result SHALL be an error only if no save ran. The tool SHALL be annotated `readOnlyHint: false` and
`destructiveHint: true`, and on the topic-bound route its topic id SHALL default to the bound Topic.

#### Scenario: An edit saves each field
- **WHEN** an authenticated client calls `edit_topic` on a Topic its user may edit with a new name, tags, frequency,
  schedule, max findings, podcast setting, and prompt, and one Source to add
- **THEN** every field is saved in one call, the prompt with a Prompt Version of origin `mcp`, the Source exists, and
  the result's after holds every new value

#### Scenario: The result shows before and after
- **WHEN** `edit_topic` saves a new frequency
- **THEN** the result's before holds the old frequency, its after the new one, and its text names the save

#### Scenario: One rejected save does not hide the others
- **WHEN** an edit names a new prompt and a daily frequency the owner's plan cannot hold
- **THEN** the prompt is saved, the frequency is not, the result names both outcomes, and it is not an error

#### Scenario: A user without edit rights reads nothing
- **WHEN** a subscriber who may not edit a Topic calls `edit_topic` on it
- **THEN** the result says they may not change it, holds no before or after, and nothing is written

#### Scenario: A visitor cannot edit
- **WHEN** an anonymous client calls `edit_topic`
- **THEN** the result says an account is needed and nothing is written

### Requirement: edit_topic confirms making a topic public and removing a source
An `edit_topic` call that sets `visibility` to `public` on a Topic that is not public, or names any Source to remove,
SHALL save nothing unless it brings a valid confirmation. Without one it SHALL return the status `confirmRequired`, the
Topic before and as it would read after, the reasons, and a confirmation, and its text SHALL say what needs the
person's agreement and to call again with the same edit and the confirmation once they agree. The confirmation SHALL be
a keyed signature, with its expiry 15 minutes out, over the user, the Topic, the edit, the Topic's fields before it,
and the expiry. A call with a confirmation SHALL save only if the signature matches the edit it brings and the Topic as
it stands, and the expiry has not passed. A confirmation SHALL never save twice, and SHALL NOT save once the Topic has
changed since the preview. An edit with neither change SHALL save on its first call.

#### Scenario: Going public needs a confirmation
- **WHEN** an authenticated client calls `edit_topic` with `visibility: "public"` on an invite Topic its user may edit
- **THEN** the Topic stays invite, and the result is `confirmRequired` with the Topic as it would read public and a
  confirmation

#### Scenario: The confirmation saves the edit
- **WHEN** the client calls `edit_topic` again with the same edit and that confirmation within 15 minutes
- **THEN** the Topic is public and the result is saved

#### Scenario: Removing a source needs a confirmation
- **WHEN** an authenticated client calls `edit_topic` naming a Source to remove
- **THEN** the Source still exists, and the result is `confirmRequired` naming that Source

#### Scenario: A confirmation for one edit does not save another
- **WHEN** a client brings a confirmation issued for removing one Source with an edit that removes a different Source
- **THEN** nothing is saved, and the result is `confirmRequired` with a new confirmation for the edit it brought

#### Scenario: A confirmation saves once
- **WHEN** a client repeats a call whose confirmation already saved its edit
- **THEN** nothing is saved again

#### Scenario: A topic changed since the preview voids the confirmation
- **WHEN** the Topic's prompt is edited on the page between the preview and the confirming call
- **THEN** nothing is saved, and the result is `confirmRequired` over the Topic as it now stands

#### Scenario: An expired confirmation saves nothing
- **WHEN** a client brings a confirmation more than 15 minutes old
- **THEN** nothing is saved, and the result is `confirmRequired` with a new confirmation

#### Scenario: An edit with neither change saves at once
- **WHEN** an authenticated client calls `edit_topic` with a new prompt and an added Source
- **THEN** both are saved on the first call with no confirmation

