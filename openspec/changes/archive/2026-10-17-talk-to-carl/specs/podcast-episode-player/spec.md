## MODIFIED Requirements

### Requirement: The player streams from a short-lived URL and resumes where the listener stopped

The player SHALL play through one audio element of its own. Carl's spoken chat replies SHALL play through a second
element the chat owns, so neither element ever plays the other's audio. It SHALL load the Podcast Episode's stable
audio url, which redirects to a short-lived presigned object storage URL that supports range requests, so seeking never
downloads the
whole file. For a signed-in listener it SHALL start at their saved progress. If the presigned URL has expired, the
player SHALL load the stable url again and continue from the same position.

#### Scenario: A listener resumes

- **GIVEN** a listener who stopped a Podcast Episode at 12:40
- **WHEN** they press play on it again, on any device
- **THEN** playback starts at 12:40

#### Scenario: Seeking uses a range request

- **WHEN** a listener drags the seek bar to chapter 8
- **THEN** the browser requests that byte range instead of the whole file

#### Scenario: An expired URL recovers

- **GIVEN** a listener who paused for longer than the presigned URL lasts
- **WHEN** they press play
- **THEN** the player loads the stable url again and continues from the saved position

#### Scenario: Carl's voice never touches the player
- **WHEN** Carl speaks a chat reply
- **THEN** the episode is paused where it stood and stays loaded there, and Carl's audio never reaches the episode's
  element

### Requirement: Lock-screen controls show the Podcast Episode and skip chapters

The player SHALL use the Media Session API, so the device's lock-screen and media controls show the Podcast Episode's
title, the current chapter's title, and the Podcast Episode's cover as the artwork. The topic page's player SHALL show
no cover, as its wireframe has none. The next and previous controls SHALL skip to the next and previous chapter.

While Carl speaks a chat reply, the lock screen SHALL show Carl, and once he stops the controls SHALL return to the
Podcast Episode. With no Podcast Episode loaded, the lock screen keeps Carl until something else claims it.

#### Scenario: Next skips a chapter

- **GIVEN** a Podcast Episode playing chapter 2
- **WHEN** the listener presses next on the lock screen
- **THEN** playback moves to the start of chapter 3, and the lock screen shows chapter 3's title

#### Scenario: The lock screen returns to the episode
- **WHEN** Carl finishes a spoken answer while an episode is loaded
- **THEN** the lock screen shows the episode again

### Requirement: A podcast player docks at the bottom while a Podcast Episode is loaded

On a phone the player SHALL be a compact card. Once a listener starts a Podcast Episode, a podcast player SHALL dock at
the bottom of the screen and SHALL stay there on every page while that Podcast Episode is loaded, whether or not the
player card is in view. It SHALL show the Podcast Episode's cover in its square icon slot, its number and title, and the
current chapter, with play and pause. Its cover and title SHALL link to the Podcast Episode's own page once the Podcast
Episode publishes, and a hover anywhere on them SHALL underline the title. The chat pill SHALL sit above the podcast
player while the podcast player shows, and SHALL return to its place once the podcast player is gone.

A chat mic tap or a spoken answer SHALL pause a playing Podcast Episode through the store and never resume it. The
podcast player SHALL stay docked and show play. Starting a Podcast Episode SHALL stop a spoken answer that is playing,
so only one voice is ever heard.

#### Scenario: The podcast player appears once a Podcast Episode starts

- **WHEN** a listener starts a Podcast Episode
- **THEN** a podcast player docks at the bottom with the podcast episode number, title, and current chapter

#### Scenario: The podcast player links to the Podcast Episode's page

- **WHEN** a listener presses the docked podcast player's title
- **THEN** the Podcast Episode's own page opens

#### Scenario: The podcast player stays beside the player card

- **GIVEN** a Podcast Episode that a listener started
- **WHEN** the player card is in view, or the listener opens another page
- **THEN** the podcast player is still docked

#### Scenario: The chat pill moves up

- **WHEN** the podcast player is docked
- **THEN** the chat pill sits above it, and neither covers the other

#### Scenario: Nothing loaded, no podcast player

- **WHEN** a listener has started no Podcast Episode
- **THEN** no podcast player shows

#### Scenario: The mic pauses the episode
- **WHEN** a listener taps the chat mic while an episode plays
- **THEN** the episode pauses, and the podcast player shows play
