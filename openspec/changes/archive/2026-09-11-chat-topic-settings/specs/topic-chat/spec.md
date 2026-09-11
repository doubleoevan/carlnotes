## ADDED Requirements

### Requirement: The edit chat changes the topic's settings
The edit chat SHALL offer `updateTopicFields` beside the prompt and source tools, the `chat-edit-topic.md` prompt SHALL name it, and a save SHALL toast like the prompt tool's.

#### Scenario: Carl changes the tags on a yes
- **WHEN** an editor agrees to tags Carl proposed
- **THEN** the tool writes them, a toast says the settings were saved, and the page reloads with them
