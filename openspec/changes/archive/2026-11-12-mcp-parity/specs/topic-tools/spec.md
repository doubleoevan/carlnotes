## MODIFIED Requirements

### Requirement: The MCP edit_topic tool saves a proposed edit through the chat's save path
The MCP server SHALL expose `edit_topic`, taking `topic_id`, the fields of `proposeTopicEditPayload` that Carl's
`proposeTopicEdit` takes in chat, name, tags, visibility, frequency, schedule, max findings, the podcast setting, the
prompt, sources to add, and source ids to remove, an optional team to add the Topic to or remove it from, and an
optional `confirmation`. It SHALL save through the same function the chat applies an agreed edit with, in the same
order, the prompt, then the settings in one save, then each removal, then each add, through the Topic Tools, which
check edit rights themselves, with Prompt Versions of origin `mcp`, and then the team change through the team page's
add and remove. Before any save, the name, the prompt, and the tags SHALL pass the editor's moderation, and a rejected
field SHALL save nothing. Before reading the Topic for its result, the tool SHALL ask `isAllowed(user, "topic:edit",
topic)` itself, and a user who may not edit SHALL get the rejection and no Topic fields. A visitor's call SHALL return
the connect-an-account result. The result SHALL hold the status, the Topic before the edit and after it in the topic
card's shape, each saved Source with its id, and each save's outcome, and its text SHALL name each save or what stopped
it. The result SHALL be an error only if no save ran. The tool SHALL be annotated `readOnlyHint: false` and
`destructiveHint: false`, and on the topic-bound route its topic id SHALL default to the bound Topic.

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

#### Scenario: A team change follows the team page's rules
- **WHEN** a team leader calls `edit_topic` to add a Topic they own to their team, with the confirmation a private
  Topic's preview returned
- **THEN** the Topic is one of the team's topics, and a member who is not a leader gets the team page's rejection

#### Scenario: The editor's moderation holds over MCP
- **WHEN** a client calls `edit_topic` with a name the topic editor rejects as objectionable
- **THEN** nothing is saved and the result gives the editor's moderation rejection

### Requirement: edit_topic confirms making a topic public and removing a source
An `edit_topic` call that sets `visibility` to `public` on a Topic that is not public, names any Source to remove, or
adds a Topic that is not public after the edit to a team, SHALL save nothing unless it brings a valid confirmation.
Without one it SHALL return the status `confirmRequired`, the Topic before and as it would read after, the reasons, and
a confirmation, and its text SHALL say what needs the person's agreement and to call again with the same edit and the
confirmation once they agree. The confirmation SHALL be a keyed signature, with its expiry 15 minutes out, over the
user, the Topic, the edit with its team change, the Topic's fields before it, and the expiry. A call with a confirmation
SHALL save only if the signature matches the edit it brings and the Topic as it stands, and the expiry has not passed. A
confirmation SHALL never save twice, and SHALL NOT save once the Topic has changed since the preview. An edit with
neither change SHALL save on its first call.

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

#### Scenario: Sharing a private topic with a team needs a confirmation
- **WHEN** a team leader calls `edit_topic` to add their invite Topic to their team
- **THEN** the Topic is not on the team, and the result is `confirmRequired` saying the team's members could read it
