## MODIFIED Requirements

### Requirement: The edit chat changes the topic's settings

The edit chat's `proposeTopicEdit` SHALL take the settings fields beside the prompt and the Sources, the private
chat's edit block prompt SHALL name them, and an agreed settings change SHALL be applied through `updateTopicFields`
and SHALL toast like the prompt's save.

#### Scenario: Carl changes the tags on a yes

- **WHEN** an editor agrees to tags Carl previewed
- **THEN** the server writes them through `updateTopicFields`, a toast says the settings were saved, and the page
  reloads with them
