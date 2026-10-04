## ADDED Requirements

### Requirement: Closing an account deletes its Podcast Episodes' audio

Closing an account SHALL delete the audio of every Podcast Episode of every Topic that the account owns, through the
same path that deletes a Topic, which deletes the audio objects from object storage before the Topic row goes. The
user's Podcast Episode rows, listen rows, and feed tokens SHALL be deleted with the user. Deleting one Topic on its own
SHALL delete its Podcast Episodes' audio the same way and keep the Podcast Episode rows with no Topic, so their cost
stays in the owner's spend history.

#### Scenario: A closed account's audio is gone

- **GIVEN** a user who owns a Topic with published Podcast Episodes
- **WHEN** the account is closed
- **THEN** every one of those Podcast Episodes' audio objects is deleted, and no Podcast Episode, listen, or feed token
  row of the user remains

#### Scenario: A deleted Topic's audio is gone and its cost remains

- **WHEN** an owner deletes a Topic with published Podcast Episodes
- **THEN** the audio objects are deleted, the Podcast Episode rows remain with no Topic, and their feed and audio urls
  respond as missing
