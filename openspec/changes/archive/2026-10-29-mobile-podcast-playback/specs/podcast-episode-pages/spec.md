# Podcast episode pages delta

## ADDED Requirements

### Requirement: Mobile episode links open the existing episode content in the app

The mobile app SHALL open accessible Podcast Episode links and podcast search results on an episode screen.
It SHALL show the web's title, description, Topic byline, player, transcript, other episodes, and similar podcasts.
Opening the page SHALL NOT start playback. Existing mobile Topic cards, seasons, and lists SHALL remain the Topic entry points.

#### Scenario: A search result opens its episode

- **WHEN** a person opens a podcast search result or an episode link inside the app
- **THEN** the episode screen opens with that episode selected and no browser handoff
- **AND** audio continues unchanged until the person uses a playback control

#### Scenario: An older episode opens from the existing list

- **WHEN** a person selects an earlier season and opens an episode title
- **THEN** the screen shows that season's episode, independent of the latest episode or an episode already playing
- **AND** its play control can replace the loaded episode

#### Scenario: A link carries an old Topic slug

- **WHEN** an episode link contains an old slug but identifies an accessible Topic, season, and episode number
- **THEN** the app resolves the episode by those identifiers and presents its current Topic information

### Requirement: Mobile episode presentation follows the web's responsive structure

The mobile episode screen SHALL match the web's narrow-screen structure, Nightshift typography, colors, icons, and formatting.
It SHALL use the player's chapter list without a second chapter table on a phone.
The large heading cover SHALL follow the web's width rule; the mini player and system controls SHALL show the episode cover.
Player and chapter controls SHALL remain separate from Finding links.

#### Scenario: The phone shows one chapter list

- **WHEN** an episode screen opens at phone width
- **THEN** its full player shows the segmented progress, controls, and expandable chapter list
- **AND** no duplicate chapter table or large heading cover consumes the narrow screen

#### Scenario: Chapter navigation stays independent of the Finding

- **WHEN** a listener selects a later or earlier chapter title or play pill
- **THEN** playback follows the player specification without opening the Finding reader
- **WHEN** they select that chapter's Finding action
- **THEN** the existing mobile Finding reader opens without an unintended seek or pause

#### Scenario: A long chapter remains usable

- **WHEN** titles, sources, durations, or translated system text require extra space
- **THEN** labels wrap or truncate as on the web without overlapping play, expand, or Finding controls
- **AND** accessible labels expose the complete action and chapter title

### Requirement: Mobile transcripts preserve the readable web transcript

The episode screen SHALL show the authorized episode's transcript with chapter headings, dashed dividers, speaker labels, and the web's text formatting.
The transcript SHALL start collapsed behind read more, expand into a bounded scroll area, and offer read less.
Missing transcript content SHALL use an explicit empty state and SHALL NOT display a previous episode's text.

#### Scenario: A listener reads the transcript

- **WHEN** a listener expands Episode transcript
- **THEN** all available sections appear in order, including the sign-off, with distinct speakers and chapter headings
- **AND** read less collapses the section without changing playback

#### Scenario: The transcript is empty or changes episode

- **WHEN** the selected episode has no transcript or its request is still loading
- **THEN** the screen shows the corresponding empty or loading state without stale transcript content

### Requirement: Mobile chapter ratings keep the web's targets and permissions

Chapter ratings SHALL use the same eligibility, rating target, selected state, and failure rollback as the web.
An available Finding SHALL open the existing Finding reader and its rating controls.
For an eligible chapter whose Finding was filtered out, an accessible chapter action SHALL offer its episode-chapter rating without inventing a Finding.
People without rating permission SHALL see no actionable rating control.

#### Scenario: A chapter still has its Finding

- **WHEN** an eligible listener opens the chapter's Finding and rates it
- **THEN** the existing Finding rating flow updates the same target as web and restores the previous state if the write fails

#### Scenario: A filtered-out Finding still permits a chapter rating

- **WHEN** an eligible listener opens the rating action for a chapter whose Finding identifier is absent
- **THEN** the app offers the web's chapter rating choices and submits an episode-chapter rating
- **AND** a rejected write restores the previous rating and shows the error

### Requirement: Mobile episode actions use the web's authorization and confirmations

The episode menu SHALL offer the web's permitted Add topic to team, Share topic, Report issue, and Remove episode actions.
Authorized episode removal from a page or episode row SHALL require the web's confirmation.
Confirmed removal SHALL stop that loaded episode, clear its resume state, and refresh affected lists; page removal SHALL return to the Topic.
Cancellation or failure SHALL retain the episode.

#### Scenario: Removal succeeds from the episode page

- **WHEN** an authorized owner or admin confirms Remove episode for the loaded episode
- **THEN** the app removes it, stops its audio, clears its system metadata and resume state, and opens the Topic
- **AND** stale load, autoplay, or retry responses cannot restart it

#### Scenario: Removal is cancelled or denied

- **WHEN** a person cancels the confirmation or the API rejects removal
- **THEN** no successful removal is shown and the page remains available according to current access
- **AND** a write failure shows feedback and permits retry

#### Scenario: A member opens another person's private Topic episode

- **WHEN** an authorized member opens that episode's menu
- **THEN** Add topic to team stays hidden where web hides it, and Remove episode appears only when explicitly allowed
- **AND** Share topic and Report issue act on the Topic through the existing mobile forms

### Requirement: Mobile episode gates and request states expose no private content

The mobile episode screen SHALL honor current episode access and join-date rules.
It SHALL distinguish loading, retryable request failure, missing episode, and the existing Topic gate.
An access denial SHALL clear protected episode content and audio. An offline failure SHALL NOT masquerade as confirmed permission loss.
Sign-in from a gate SHALL retain the episode destination.

#### Scenario: A visitor opens a gated episode

- **WHEN** a visitor opens an invite or private episode
- **THEN** the app shows the current Topic gate with the appropriate sign-in actions and no protected transcript, chapters, or player
- **AND** a private gate does not reveal the Topic's name

#### Scenario: A late subscriber opens an earlier episode

- **WHEN** an invite Topic subscriber requests an episode published before they joined
- **THEN** the screen treats that episode as unavailable according to the API, even if the Topic itself is accessible

#### Scenario: A request fails without an access decision

- **WHEN** an episode request fails because of connectivity or a server error
- **THEN** the screen offers retry and does not reveal stale protected content or claim that access was revoked

### Requirement: Mobile retains podcast credits and paused-show copy

Mobile SHALL retain the web's theme-song note placement, credits, lyrics, links, and paused-show copy.
The credits SHALL open in an accessible sheet using the same content as web.
Playback and transcripts SHALL retain the episode's sign-off. Disabling future episodes SHALL NOT hide already published episodes or their playback controls.

#### Scenario: The theme-song note opens

- **WHEN** a listener presses the note beside Coffee Break or an episode title
- **THEN** a sheet shows the shared song credits, available lyrics, and the same destination links as web

#### Scenario: The show is paused

- **WHEN** the Topic stops producing new episodes but has published episodes
- **THEN** mobile shows the web's paused-show explanation and retains access to permitted published episodes

### Requirement: Mobile podcast states remain accessible in both themes

Mobile podcast screens and sheets SHALL preserve meaningful loading, empty, error, disabled, selected, and expanded states in light and dark themes.
Controls SHALL expose labels, playback state, and adjustable progress to assistive technology.
Text scaling, safe areas, keyboard appearance, and open sheets SHALL NOT obscure required controls.
Listener counts SHALL accept the shared count display input without fabricating a live value.

#### Scenario: A listener adjusts progress with accessibility controls

- **WHEN** a screen-reader user adjusts the seek control or activates a chapter
- **THEN** playback performs the same seek as touch input and announces meaningful position and chapter information

#### Scenario: A count is unavailable

- **WHEN** no current listener-count value has been supplied
- **THEN** the display follows the shared unavailable state instead of inventing a count or starting an independent polling loop
