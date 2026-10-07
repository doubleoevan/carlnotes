## ADDED Requirements

### Requirement: A Podcast Episode page credits the theme song

A note icon SHALL sit beside the Coffee Break podcast heading and beside each Podcast Episode title: on a Podcast
Episode page, beside the title heading and beside the title in the player card, and on a topic page, beside the podcast
section's heading and the title in its player card. The episode page's podcast line above the title SHALL have no note.
The note's popup SHALL open with the centered heading Coffee Break Theme Song, its song title linking to the song on
YouTube, then credit the song's lyrics and melody with the copyright year and the songwriter linking to the songwriter's
site, its performer, its producer, and its drummer. The popup and the podcast feed SHALL read the credits from one
config entry, and the Coffee Break docs page SHALL write the same credits. Under the credits the popup SHALL show the
song's lyrics from the lyrics file in the app's standard scroll box, with its orange border and orange scrollbar, each
section's heading over its lines, and SHALL show no lyrics box while the file holds none. The popup SHALL end with a
bold Enjoy 😊 link at its far right, below the lyrics, that opens the song on YouTube.

#### Scenario: The note credits the song, its songwriter, and its producer

- **WHEN** a visitor opens the note beside a public Podcast Episode's title
- **THEN** the popup reads Coffee Break Theme Song, then Lyrics and melody © 2022 Laura Atkinson, then Performed by
  Chase Wimberly, then Production by Jimmy Deer, then Drumming by Nate Barnes, and the heading's song title and the
  songwriter's name open their links in a new tab

#### Scenario: The lyrics show under the credits

- **WHEN** the lyrics file holds a Verse 1 section and a Chorus section
- **THEN** the popup shows a scroll box under the credits, with Verse 1 over its lines, then Chorus over its lines, and
  a bold Enjoy 😊 link below the box at the far right opens the song on YouTube

#### Scenario: The topic page's podcast section has the note

- **WHEN** a visitor opens a topic page with a published Podcast Episode
- **THEN** a note sits beside the Coffee Break podcast heading and beside the episode's title in the player card
