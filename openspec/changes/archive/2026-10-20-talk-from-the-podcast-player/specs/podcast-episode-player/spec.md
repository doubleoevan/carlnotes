## MODIFIED Requirements

### Requirement: A podcast player docks at the bottom while a Podcast Episode is loaded

On a phone the player SHALL be a compact card. Once a listener starts a Podcast Episode, a podcast player SHALL dock at
the bottom of the screen and SHALL stay there on every page while that Podcast Episode is loaded, whether or not the
player card is in view. It SHALL show the Podcast Episode's cover in its square icon slot, its number and title, and the
current chapter, with play and pause, and with the mic that asks Carl and Vienna about the episode beside play if voice
is configured. Its cover and title SHALL link to the Podcast Episode's own page once the Podcast Episode publishes, and
a hover anywhere on them SHALL underline the title. The chat pill SHALL sit above the podcast player while the podcast
player shows, and SHALL return to its place once the podcast player is gone.

A chat mic tap or a spoken chat reply SHALL pause a playing Podcast Episode through the store and never resume it. The
podcast player SHALL stay docked and show play. Starting a Podcast Episode SHALL stop a spoken answer that is playing,
so only one voice is ever heard. A question asked from the podcast player's own mic SHALL pause the Podcast Episode and
resume it after the answer, by the podcast chat's rules.

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

#### Scenario: The player's own mic resumes the episode
- **WHEN** a listener asks a question from the podcast player's mic while the episode plays, and the host finishes
- **THEN** the episode resumes where it paused

### Requirement: Playback controls name their actions

The skip back, skip forward, and playback speed buttons SHALL each have a tooltip that matches its accessible name:
"Skip back 15 seconds", "Skip forward 30 seconds", and "Playback speed". The podcast player at the bottom of the
screen SHALL show skip forward beside skip back, and SHALL show no playback speed button. While a question asked from
the podcast player is in progress, one stop control SHALL take the place of both skip buttons, and they SHALL return
once the question ends.

#### Scenario: The bottom player skips forward

- **WHEN** a Podcast Episode is loaded and a listener presses skip forward in the bottom player
- **THEN** playback moves 30 seconds ahead

#### Scenario: A control's tooltip names it

- **WHEN** a listener hovers the skip back button
- **THEN** its tooltip reads "Skip back 15 seconds"

#### Scenario: A question's stop replaces the skip buttons
- **WHEN** a listener taps the bottom player's mic
- **THEN** one stop control shows where the skip buttons were, and both skip buttons return once the episode resumes
