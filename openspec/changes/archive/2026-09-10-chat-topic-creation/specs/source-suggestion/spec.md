## ADDED Requirements

### Requirement: The chat asks for suggestions the same way
The `suggestTopicDraftSources` Topic Tool SHALL call the same suggestion function the route calls, with the name and prompt Carl proposed, no stored Topic involved, the caller's own key, and the same daily suggestion limit. Its suggestions SHALL be verified the same way and SHALL name the source option each is added through.

#### Scenario: Carl's suggestions are the route's
- **WHEN** Carl calls `suggestTopicDraftSources` in the new-topic chat
- **THEN** the suggestions are the ones the editor's Recommend button would show for the same name and prompt
