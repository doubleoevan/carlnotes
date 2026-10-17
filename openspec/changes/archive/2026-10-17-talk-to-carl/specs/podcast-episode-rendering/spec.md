## MODIFIED Requirements

### Requirement: Podcast Episodes are off if the speech model is set empty

`PODCAST_SPEECH_MODEL` SHALL default to `gemini-3.8-flash-tts`. If it is set empty, the app SHALL render no Podcast
Episode, the api SHALL return no episode data, and the ui SHALL show no player, episodes card, podcast switch, or
Subscribe button, so a self-hosted instance runs without a Google key. Otherwise Podcast Episodes SHALL be on for every
user, with no feature flag for admins first. A Topic's podcast SHALL be on by default, and a user who may edit the
Topic SHALL be able to turn it off and on for that Topic.

Voice SHALL share the gate: with `PODCAST_SPEECH_MODEL` empty, the chat composers SHALL show no mic and no reply SHALL
show a play button, whatever `CHAT_TRANSCRIPTION_MODEL` says.

#### Scenario: A self-hosted instance has no podcast episode UI

- **WHEN** a user opens a topic page on an instance with the speech model set empty
- **THEN** the page shows no player, no episodes card, and no podcast switch, and its Scans render no Podcast Episode

#### Scenario: An instance with no setting renders with the default model

- **GIVEN** an instance with `PODCAST_SPEECH_MODEL` unset
- **WHEN** a Scan succeeds with Findings to narrate
- **THEN** its Podcast Episode renders with `gemini-3.8-flash-tts`

#### Scenario: An owner turns a Topic's podcast off

- **GIVEN** an instance with a speech model configured
- **WHEN** an owner turns their Topic's podcast switch off and the Topic's next Scan succeeds
- **THEN** no Podcast Episode is rendered for it, and the Topic's published Podcast Episodes stay playable

#### Scenario: A user who may not edit the Topic cannot change the switch

- **WHEN** a subscriber who may not edit the Topic sends a change to its podcast setting
- **THEN** the api rejects it

#### Scenario: A self-hosted instance has no mic
- **WHEN** `PODCAST_SPEECH_MODEL` is set empty
- **THEN** every chat composer shows the send button alone
