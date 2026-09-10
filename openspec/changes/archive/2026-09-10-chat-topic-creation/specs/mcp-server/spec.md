## ADDED Requirements

### Requirement: The server creates Topics and suggests Sources for a connected account
The server SHALL expose `create_topic` and `suggest_sources`. Each SHALL return the connect-an-account result to a visitor. `create_topic` SHALL take a name, a prompt, Sources as source option and value pairs, and invite emails, run the `createTopicFromDraft` Topic Tool, and return the new Topic's id and name, annotated `destructiveHint: true`. `suggest_sources` SHALL take a name and a prompt, run the `suggestTopicDraftSources` Topic Tool, and return the suggestions, annotated `readOnlyHint: true` and `openWorldHint: true`.

#### Scenario: An agent makes a Topic
- **WHEN** an authenticated client calls `create_topic` within the account's limits
- **THEN** the Topic exists with a first Prompt Version of origin `mcp`, its first Scan is open, and the result names its id

#### Scenario: A visitor cannot create
- **WHEN** an anonymous client calls `create_topic`
- **THEN** the result says an account is needed and nothing is written
