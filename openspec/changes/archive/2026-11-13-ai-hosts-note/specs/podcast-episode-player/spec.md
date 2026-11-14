## MODIFIED Requirements

### Requirement: The topic page shows the latest Podcast Episode in a player under the title

On a Topic with a published Podcast Episode that the user may listen to, the topic page SHALL show a player directly
under the topic title and above the findings section, following the wireframes in `apps/docs/design/podcast/`.
Its section heading SHALL read "Coffee Break podcast". It SHALL show the latest Podcast Episode's season,
episode number, title, publish date, length, and chapter count, a seek bar split by chapter, a playback rate button once
the Podcast Episode is loaded, a Subscribe button, and a chapter list: the first three chapters shown, with a control
under the card that shows the rest. The page's html SHALL include every chapter, and in a browser without JavaScript
every chapter SHALL show and the control SHALL not. A chapter's title SHALL play the Podcast Episode from that chapter,
and a press anywhere else on its row SHALL open the note of its Finding, as a row in the findings list does. A chapter
whose Finding the user cannot see SHALL play from its whole row. A press on the seek bar SHALL play the Podcast Episode from the position that was pressed. The Podcast Episode's
details line SHALL end with "Carl and Vienna are AI hosts", and while the Podcast Episode is loaded in the player that
line SHALL show the chapter that is playing instead. Once the Podcast Episode is loaded, a pill beside the section
heading SHALL read "Playing" or "Paused" and SHALL pause or play the Podcast Episode. Each chapter's row SHALL show
the chapter's pill, such as `E14 · ch 2`, the same pill as on the Finding it narrates, which plays or pauses the chapter
and is highlighted while it plays. Until the user starts the published Podcast Episode that the player shows, the heading
SHALL show "new episode" in its place. A Topic with no Podcast Episode that the user may listen to SHALL show no player,
unless the player shows the recording state or a failed Podcast Episode, as the next requirement describes.

#### Scenario: The player sits under the title

- **WHEN** a user opens a Topic with a published Podcast Episode
- **THEN** the player renders between the topic title and the findings section, showing the latest Podcast Episode's
  season, number, title, date, and length

#### Scenario: The chapter list collapses past three

- **WHEN** the latest Podcast Episode has twelve chapters
- **THEN** the player lists the first three chapters, and a control under the card reads "+ 9 chapters"

#### Scenario: A chapter's title plays it, and its row opens its Finding

- **WHEN** a listener presses chapter 2's title, and then the rest of chapter 3's row
- **THEN** the Podcast Episode plays from chapter 2 with no note open, and then the note of chapter 3's Finding opens
  over the player

#### Scenario: Every chapter shows without JavaScript

- **GIVEN** a latest Podcast Episode with twelve chapters
- **WHEN** a visitor whose browser runs no script opens the page
- **THEN** the player lists all twelve chapters and shows no control to expand the list

#### Scenario: A press on the seek bar starts the Podcast Episode there

- **GIVEN** a Podcast Episode that is not playing
- **WHEN** a listener presses the seek bar at its midpoint
- **THEN** the Podcast Episode plays from the middle

#### Scenario: The voices are labeled as AI

- **WHEN** the player renders a Podcast Episode that is not loaded
- **THEN** the Podcast Episode's details line ends with "Carl and Vienna are AI hosts"

#### Scenario: A Topic without Podcast Episodes shows no player

- **WHEN** a user opens a Topic that has no Podcast Episode and no running Scan
- **THEN** no player renders and the page is otherwise unchanged

### Requirement: The latest Podcast Episode plays from beside the topic's note icon

A Topic with a published Podcast Episode that the user may listen to SHALL show a play button to the left of its note
icon, on its homepage card and in its topic page heading. The button SHALL play or pause the latest Podcast Episode.
Its tooltip SHALL name the Coffee Break podcast, then show the Podcast Episode's season and episode number, its title
in bold, and its date, length, chapter count, and the AI hosts note, at the tooltip's text size. Hovering the button
inside the topic page heading SHALL show this tooltip instead of the heading's note hint. The podcast player at the
bottom of the screen SHALL show the same tooltip on its Podcast Episode's title.

#### Scenario: The homepage card plays the latest Podcast Episode

- **WHEN** a user presses the play button beside a Topic's note icon on the homepage
- **THEN** the Topic's latest Podcast Episode plays, and the button shows a pause icon

#### Scenario: The tooltip describes the Podcast Episode

- **WHEN** a user hovers the play button of a Topic whose latest Podcast Episode is season 2026's episode 14
- **THEN** the tooltip reads Coffee Break podcast, then Season 2026 · Episode 14, then the title in bold, then the
  date, length, chapter count, and AI hosts note
