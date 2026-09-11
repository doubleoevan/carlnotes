## ADDED Requirements

### Requirement: updateTopicFields changes a topic's settings
The `updateTopicFields` Topic Tool SHALL take any of `tags`, `frequency`, and `maxTopicFindings`, check edit rights through the same gate as `updateTopicPrompt`, check a move onto a daily frequency against the owner's plan the way the editor does, write the named fields to the Topic, and return the Topic's name.

#### Scenario: A daily move the plan cannot hold
- **WHEN** an editor asks Carl for daily and the owner's plan has no daily slot left
- **THEN** nothing is written and the result names the daily limit

#### Scenario: A member without edit rights
- **WHEN** a reader who may not edit the Topic calls the tool
- **THEN** the gate rejects it and nothing is written
