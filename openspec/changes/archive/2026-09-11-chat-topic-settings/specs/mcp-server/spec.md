## ADDED Requirements

### Requirement: The server changes a topic's settings
The server SHALL expose `update_topic_fields`, taking a topic id and any of tags, frequency, and results count, running the `updateTopicFields` Topic Tool, annotated `destructiveHint: true`. `create_topic` SHALL take the same three fields.

#### Scenario: An agent sets a weekly topic to daily
- **WHEN** an authenticated client calls `update_topic_fields` with `frequency: "daily"` on a topic it may edit
- **THEN** the Topic brews daily, or the result names the plan's daily limit
