## ADDED Requirements

### Requirement: A podcast feed's channel description credits the theme song

Each podcast feed's channel description SHALL end with the theme song's credits: <title> Theme Song with the song's
YouTube url, its lyrics and melody with the copyright year and the songwriter, its performer, its producer, and its
drummer, read from the config entry that the Podcast Episode page uses.

#### Scenario: The channel description names the song and the people who made it

- **WHEN** a podcast app reads a Topic's podcast feed
- **THEN** the channel description ends with Coffee Break Theme Song, the song's YouTube url, Lyrics and melody © 2022
  Laura Atkinson, Performed by Chase Wimberly, Production by Jimmy Deer, and Drumming by Nate Barnes
