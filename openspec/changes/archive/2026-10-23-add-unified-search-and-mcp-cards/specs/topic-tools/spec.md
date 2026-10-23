## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: The MCP adapter takes the Topic as an argument and asks no second confirmation
**Reason**: The four MCP edit tools it described are replaced by `edit_topic`, which confirms making a Topic public and
removing a Source on the server.
**Migration**: Call `edit_topic` in place of `update_topic_prompt`, `update_topic_fields`, `add_source`, and
`remove_source`, and call it again with the returned confirmation for an edit that needs one.
