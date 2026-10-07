## ADDED Requirements

### Requirement: A narrated Finding's pill shows wherever the Finding shows

The chapter pill of a Finding narrated in its Topic's latest Podcast Episode SHALL show on every row and note that
shows the Finding: the homepage's topic finding rows, the topic page's rows, and the Finding's note, opened from the
homepage, the topic page, or a chapter's row. The pill SHALL end in a small play icon, which SHALL turn into a pause
icon while its chapter plays. A Finding that no chapter of the latest Podcast Episode narrates SHALL show no pill.

#### Scenario: The homepage row shows the pill

- **WHEN** the latest Podcast Episode's third chapter narrates a Finding on the homepage
- **THEN** that Finding's homepage row shows `E14 · ch 3` with a play icon after it

#### Scenario: The Finding's note shows the pill

- **WHEN** a user opens the note of a narrated Finding, from the homepage, the topic page, or a chapter's row
- **THEN** the note shows the same pill beside the Finding's source

#### Scenario: The playing chapter's pill shows a pause icon

- **WHEN** the chapter that narrates a Finding is playing
- **THEN** the Finding's pill shows a pause icon, and pressing it pauses the Podcast Episode

### Requirement: The latest Podcast Episode plays from beside the topic's note icon

A Topic with a published Podcast Episode that the user may listen to SHALL show a play button to the left of its note
icon, on its homepage card and in its topic page heading. The button SHALL play or pause the latest Podcast Episode.
Its tooltip SHALL name the Coffee Break podcast, then show the Podcast Episode's season and episode number, its title
in bold, and its date, length, chapter count, and the AI voices note, at the tooltip's text size. Hovering the button
inside the topic page heading SHALL show this tooltip instead of the heading's note hint. The podcast player at the
bottom of the screen SHALL show the same tooltip on its Podcast Episode's title.

#### Scenario: The homepage card plays the latest Podcast Episode

- **WHEN** a user presses the play button beside a Topic's note icon on the homepage
- **THEN** the Topic's latest Podcast Episode plays, and the button shows a pause icon

#### Scenario: The tooltip describes the Podcast Episode

- **WHEN** a user hovers the play button of a Topic whose latest Podcast Episode is season 2026's episode 14
- **THEN** the tooltip reads Coffee Break podcast, then Season 2026 · Episode 14, then the title in bold, then the
  date, length, chapter count, and AI voices note

### Requirement: The topic roast shows the latest Podcast Episode

The topic roast popover SHALL show the Topic's latest Podcast Episode directly above Carl's Prompt, in a section named
for the Coffee Break podcast, as the same row that the episodes card lists: its play button, its number and title
linked to its page, and its date and length marked latest. The row SHALL have no remove button and no hover
highlight. The topic page's roast card SHALL leave the row out, since the episodes card sits beside it.

#### Scenario: The roast plays the latest Podcast Episode

- **WHEN** a user opens a Topic's roast and presses the play button of its latest Podcast Episode
- **THEN** the Podcast Episode plays from the roast, and the roast shows no remove button

### Requirement: Playback controls name their actions

The skip back, skip forward, and playback speed buttons SHALL each have a tooltip that matches its accessible name:
"Skip back 15 seconds", "Skip forward 30 seconds", and "Playback speed". The podcast player at the bottom of the
screen SHALL show skip forward beside skip back, and SHALL show no playback speed button.

#### Scenario: The bottom player skips forward

- **WHEN** a Podcast Episode is loaded and a listener presses skip forward in the bottom player
- **THEN** playback moves 30 seconds ahead

#### Scenario: A control's tooltip names it

- **WHEN** a listener hovers the skip back button
- **THEN** its tooltip reads "Skip back 15 seconds"
