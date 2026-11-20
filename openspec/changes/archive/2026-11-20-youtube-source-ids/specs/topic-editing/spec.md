## ADDED Requirements

### Requirement: A YouTube Source is saved as the id its ingester reads

Every path that saves a YouTube Source SHALL resolve its value to a YouTube channel or playlist id before it is written:
the editor, Carl's topic draft and add-source tools, and the MCP tools that call them. A handle, a `/c/` url, and a
`/user/` url SHALL be resolved by the YouTube channel page's canonical link. The id SHALL be stored under `channelId` or
`playlistId` by its kind, and a value that was not the id SHALL name the Source until a Scan stores its title.

#### Scenario: A legacy YouTube channel url is saved as its id

- **WHEN** a reader adds `https://www.youtube.com/c/veritasium` as a YouTube Source
- **THEN** the Source stores that YouTube channel's `UC…` id, named by the url until its first Scan

#### Scenario: A video played from a playlist is saved as the playlist

- **WHEN** a reader adds a `watch?v=…&list=PL…` url as a YouTube Source
- **THEN** the Source stores the playlist id under `playlistId`

### Requirement: A YouTube value that names nothing is not saved

A YouTube value that resolves to no YouTube channel or playlist SHALL be rejected with a message that names it and says
what to give instead, and nothing in that save SHALL be written. A lookup that YouTube does not respond to, through a
timeout, a rate limit, or a server error, SHALL be rejected with a message to try again instead.

#### Scenario: A display name is rejected

- **WHEN** a reader or Carl adds `Homeboy Sandman` as a YouTube Source
- **THEN** the save is rejected with a message asking for the YouTube channel's handle, url, or a playlist url, and no
  Source is written

#### Scenario: A lookup YouTube does not respond to asks for a retry

- **WHEN** a reader adds `@veritasium` and the YouTube channel page responds with 429
- **THEN** the save is rejected with a 503 and a message to try again in a minute, and no Source is written
