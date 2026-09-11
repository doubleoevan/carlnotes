# topic-tools Specification

## Purpose
TBD - created by archiving change mcp-server-topic-tuning. Update Purpose after archive.
## Requirements
### Requirement: Three Topic Tools live in one module with authorization inside
`api/tool/` SHALL hold `updateTopicPrompt`, `addTopicSource`, and `removeTopicSource`. Each SHALL take the acting user id, the topic id, and its input, load the Topic, and ask `isAllowed(user, "topic:edit", topic)` itself before writing. Each SHALL return a discriminated result: saved, missing, forbidden, or a named validation failure. No caller SHALL check edit rights on a tool's behalf, and a null user id SHALL be rejected.

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
`removeTopicSource` SHALL delete a Source only when the row belongs to the Topic, SHALL return saved for a row already gone, and SHALL return missing for a source id that belongs to another Topic.

#### Scenario: Another Topic's source cannot be removed through this one
- **WHEN** `removeTopicSource` names a source id held by a different Topic
- **THEN** it returns missing and that Source still exists

### Requirement: The chat adapter binds the Topic and gates the tool list
The chat turn route SHALL add the three edit tools to Carl's tool list only when the gate grants the user `topic:edit` on the Topic, and the conversation payload SHALL say so. The Topic SHALL be bound from the chat turn's page and SHALL NOT appear in any tool's input schema. A user without edit rights, and a visitor on a public Topic, SHALL get the read-only Carl. Carl SHALL propose an edit in prose, citing the findings and relevance explanations behind it, and SHALL call a tool only in a turn after the user confirmed. A turn in which a tool fired SHALL keep its text even when the gate denies `chat:persist`, and its spend SHALL be metered through the same chat ledger and budget pool as a read-only turn. The chat SHALL show a toast for each save a Topic Tool makes in a turn, and an error toast for each change a Topic Tool rejects, naming what stopped it. A Topic's team chat room turn SHALL offer the same tools when the gate grants the member who addressed Carl `topic:edit` on that Topic, and the team's own room, which has no Topic, SHALL offer none.

#### Scenario: An editor's Carl can edit
- **WHEN** the Topic's owner or a member of its owning team sends a chat turn
- **THEN** the turn runs with the three edit tools available, and the conversation payload says the user may edit

#### Scenario: Everyone else keeps the read-only Carl
- **WHEN** a subscriber, a member of a Team that only holds a share, or a visitor on a public Topic opens the chat
- **THEN** the turn runs with no edit tool and the payload says they may not edit

#### Scenario: A message cannot point a tool at another Topic
- **WHEN** a message asks Carl to edit a different Topic by name or id
- **THEN** no tool accepts a Topic argument, and any edit applies to the conversation's Topic alone

#### Scenario: Carl proposes before he acts
- **WHEN** an editor asks Carl to tighten the prompt
- **THEN** his reply names the findings and explanations behind the proposal and the wording he would save, and no Prompt Version is written until a later turn in which the user agrees

#### Scenario: A tool-firing turn persists and is metered
- **WHEN** a turn calls a tool
- **THEN** its chat turn row keeps its question and answer text and saves the turn's full token cost

#### Scenario: The chat confirms the edit and the page shows it
- **WHEN** a Topic Tool saves in a turn, in the private chat or in a team chat room
- **THEN** the chat shows a toast naming each save, and the Topic page reloads its payload and shows the new prompt or Source

#### Scenario: The chat reports a rejected edit
- **WHEN** a Topic Tool rejects a change in a turn, because the Topic is full, the Source is already read, or the plan says no
- **THEN** the chat shows an error toast naming what stopped it, whatever Carl's reply says

#### Scenario: A team room turn tunes for a member with edit rights
- **WHEN** a member the gate grants `topic:edit` addresses Carl in the Topic's team chat room and confirms a proposed edit
- **THEN** the turn runs with the three edit tools, the edit is saved with a Prompt Version of origin `chat`, and Carl's reply posts to the room for every member to read

#### Scenario: A team room turn from a member without edit rights stays read-only
- **WHEN** a member the gate does not grant `topic:edit` addresses Carl in that room, whoever proposed the change
- **THEN** the turn runs with no edit tool and nothing is written

### Requirement: The MCP adapter takes the Topic as an argument and asks no second confirmation
The MCP server SHALL register the three edit tools with `topic_id` as an ordinary argument, each annotated `readOnlyHint: false` and `destructiveHint: true`. A visitor's call SHALL return the connect-an-account result. A user's call SHALL run the tool and return its result, the cost included, with no confirmation step. The client runs its own tool approval.

#### Scenario: An MCP edit runs on approval alone
- **WHEN** an authenticated client calls `update_topic_prompt` for a Topic the user may edit
- **THEN** the prompt is saved with a Prompt Version of origin `mcp` and the result confirms it, with no confirmation step from the server

#### Scenario: The tools are annotated destructive
- **WHEN** a client lists tools
- **THEN** the three edit tools have a destructive hint and the read tools have a read-only hint

### Requirement: createTopicFromDraft runs the editor's create path
`api/tool/` SHALL hold `createTopicFromDraft`, taking the acting user id and a Topic Draft: a name, a prompt, Sources as source option and value pairs, and invite emails. It SHALL build the editor's create payload with the editor's defaults, weekly on Wednesday at 09:00, invite visibility, ten results, no tags, and the default Sources beside the chosen ones built through the shared source registry, and SHALL call the same create function the editor's route calls, with the Prompt Version origin of the adapter. It SHALL return created with the Topic's id and name, or the create path's own rejection: quota, a daily-frequency limit, an invitee the app will not invite, or an unusable Source value. A null user id SHALL be rejected.

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
`api/tool/` SHALL hold `suggestTopicDraftSources`, taking the acting user id, a name, and a prompt, and returning the verified suggestions the editor's Recommend button gets, each with its source option and value, under the same daily suggestion limit and on the user's own key. A reached limit SHALL return a named failure and no suggestions.

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

