## ADDED Requirements

### Requirement: A chat turn's events name its kind and a podcast chat turn's its speaker
`chat_turn_sent` SHALL include `chatTurnKind`, `private` or `podcast`, from the row it records, and a podcast chat
turn's SHALL also include `speaker`, `host` or `cohost`. `spoken_question_sent` SHALL include `chatTurnKind`, sent by
the browser as `podcast` for a question asked from the podcast player and `private` otherwise, and checked against those
two values on the server. No event SHALL include a host's name.

#### Scenario: A podcast question names its kind and its host
- **WHEN** Vienna answers a question asked from the podcast player
- **THEN** PostHog receives `spoken_question_sent` with `chatTurnKind` set to `podcast`, and `chat_turn_sent` with
  `chatTurnKind` set to `podcast` and `speaker` set to `cohost`

#### Scenario: A chat mic question is private
- **WHEN** a user asks Carl from the chat mic
- **THEN** both events include `chatTurnKind` set to `private`, and `chat_turn_sent` has no `speaker`
