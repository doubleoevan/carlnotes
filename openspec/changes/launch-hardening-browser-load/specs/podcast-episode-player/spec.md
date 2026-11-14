## ADDED Requirements

### Requirement: A Podcast Episode summary names its counted audio and film routes

A Podcast Episode summary SHALL hold two optional fields, `audioUrl` and `video`, with the stable paths the full
Podcast Episode holds: the audio route that counts a play, and for a ready film its film route, its captions route,
and its poster. Neither field SHALL hold a stored file's url or a signed url. A Podcast Episode that an MCP view plays
SHALL keep its absolute urls with the tool caller's play token.

#### Scenario: A published Podcast Episode's summary names its routes

- **WHEN** a card's summary is read for a published Podcast Episode with a ready film
- **THEN** `audioUrl` is `/api/episodes/<id>/audio.mp3`, `video` holds `/api/episodes/<id>/video.mp4` with its
  captions route and poster, and neither names a storage host

#### Scenario: A Podcast Episode with no film or no audio yet

- **WHEN** a summary is read for a Podcast Episode with no ready film, or for one that is not published
- **THEN** `video` is null for the first, and `audioUrl` is null for the second

#### Scenario: The summary's url still counts its play

- **WHEN** a browser requests a summary's `audioUrl` or its film route
- **THEN** the route counts one play in that format for the request's place, and redirects to a short-lived storage
  url

#### Scenario: A released build reads the summary

- **WHEN** a mobile build released before the two fields reads a summary
- **THEN** it reads the summary as before, and the contract freeze check passes

#### Scenario: An MCP view keeps its play token

- **WHEN** an MCP tool returns a Podcast Episode for its view to play
- **THEN** its audio and film urls are absolute and include the tool caller's play token
