## ADDED Requirements

### Requirement: The draft takes the topic's settings
The Topic Draft SHALL hold `tags`, `frequency`, and `maxTopicFindings`, defaulting to none, weekly, and ten, which `draftTopic` writes, the card shows, and `createTopicFromDraft` saves. The `chat-new-topic.md` prompt SHALL offer the three once, as optional, before the read-back.

#### Scenario: A reader asks for daily
- **WHEN** a reader says the topic should brew every day and keep twenty
- **THEN** the card reads daily and twenty, and the created Topic has that frequency and results count

#### Scenario: The settings are skipped
- **WHEN** a reader says nothing about them
- **THEN** the Topic is created weekly with ten results and no tags
