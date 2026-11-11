## MODIFIED Requirements

### Requirement: A Podcast Episode page credits the theme song

A headphones button labeled Theme song credits SHALL sit right after the title of the Coffee Break podcast section and
of the film section, on a Podcast Episode page and on a topic page. No Podcast Episode title SHALL have one: not the
episode page's title heading, and not the title in a player card. The episode page's podcast line above the title SHALL
have no button. The button's popup SHALL open with the centered heading Coffee Break Theme Song, its song title linking
to the song on YouTube, then credit the song's lyrics and melody with the copyright year and the songwriter linking to
the songwriter's site, its performer, its producer, and its drummer. The popup and the podcast feed SHALL read the
credits from one config entry, and the Coffee Break docs page SHALL write the same credits. Under the credits the popup
SHALL show the song's lyrics from the lyrics file in the app's standard scroll box, with its orange border and orange
scrollbar, each section's heading over its lines, and SHALL show no lyrics box while the file holds none. The popup
SHALL end with a bold Enjoy! 😊 link at its far right, below the lyrics, that opens the song on YouTube.

#### Scenario: The note credits the song, its songwriter, and its producer

- **WHEN** a visitor opens the credits after the Coffee Break podcast title of a public Podcast Episode's page
- **THEN** the popup reads Coffee Break Theme Song, then Lyrics and melody © 2022 Laura Atkinson, then Performed by
  Chase Wimberly, then Production by Jimmy Deer, then Drumming by Nate Barnes, and the heading's song title and the
  songwriter's name open their links in a new tab

#### Scenario: The lyrics show under the credits

- **WHEN** the lyrics file holds a Verse 1 section and a Chorus section
- **THEN** the popup shows a scroll box under the credits, with Verse 1 over its lines, then Chorus over its lines, and
  a bold Enjoy! 😊 link below the box at the far right opens the song on YouTube

#### Scenario: The topic page's podcast section has the note

- **WHEN** a visitor opens a topic page with a published Podcast Episode
- **THEN** the headphones button sits right after the Coffee Break podcast title, and no button sits beside the
  episode's title in the player card

### Requirement: Mobile retains podcast credits and paused-show copy

Mobile SHALL retain the web's theme-song credits placement, credits, lyrics, links, and paused-show copy. The credits
SHALL open in an accessible sheet using the same content as web. Playback and transcripts SHALL retain the episode's
sign-off. Disabling future episodes SHALL NOT hide already published episodes or their playback controls.

#### Scenario: The theme-song note opens

- **WHEN** a listener presses the headphones button after a film section's or a podcast section's title
- **THEN** a sheet shows the shared song credits, available lyrics, and the same destination links as web

#### Scenario: The show is paused

- **WHEN** the Topic stops producing new episodes but has published episodes
- **THEN** mobile shows the web's paused-show explanation and retains access to permitted published episodes
