## ADDED Requirements

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
