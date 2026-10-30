# Spec Delta

## MODIFIED Requirements

### Requirement: Editing a Topic never starts a Scan
No Topic Tool SHALL start, request, or schedule a Scan. `addTopicSource` SHALL start the pending url Source screen for a
url kind and nothing more.

#### Scenario: Three edits start no Scan
- **WHEN** an editor's Carl updates the prompt, adds a Source, and removes a Source
- **THEN** no `scans` row is inserted and the owner's daily scan count is unchanged
