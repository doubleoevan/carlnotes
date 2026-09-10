## ADDED Requirements

### Requirement: The editor's save writes a Prompt Version
The topic update SHALL write a Prompt Version with origin `editor` when the saved prompt differs from the stored one. The version SHALL be written inside the save's own transaction, through the same function the Topic Tools use. Creating a Topic SHALL save its first Prompt Version. A save that leaves the prompt unchanged SHALL save none.

#### Scenario: An edited prompt is versioned
- **WHEN** the owner changes Carl's Prompt in the edit modal and saves
- **THEN** a `topic_prompt_versions` row holds the new text, origin `editor`, and the owner as the user who saved it

#### Scenario: A save without a prompt change adds no version
- **WHEN** the owner changes only the tags and saves
- **THEN** no Prompt Version row is added

#### Scenario: A new Topic starts its history
- **WHEN** a Topic is created
- **THEN** one Prompt Version holds its first prompt
