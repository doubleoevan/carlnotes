## ADDED Requirements

### Requirement: A cover is drawn off the request path and stored ahead of its first read

The worker's podcast episode image step SHALL draw a Podcast Episode's cover once and store it at both sizes, 3000
pixels and 600 pixels, from one drawn image. The cover route SHALL serve a stored cover with no draw, and SHALL draw
only a cover that is not stored yet. A draw SHALL run in a worker thread that is replaced every few draws, never on
the event loop that serves requests, so a draw stalls no other request and its memory is returned.

#### Scenario: A new Podcast Episode's cover is stored before a feed asks

- **WHEN** a Podcast Episode publishes and its image step ends
- **THEN** its cover is stored at 3000 pixels and at 600 pixels, and a podcast app's first request for it draws
  nothing

#### Scenario: A cover that is not stored yet is drawn by the route

- **GIVEN** a show cover whose Topic was just renamed
- **WHEN** the cover's new url is first requested
- **THEN** the route draws it in a worker thread, stores both sizes, and serves it

#### Scenario: A draw stalls no other request

- **WHEN** a cover is drawn while a chat reply streams from the same process
- **THEN** the reply's chunks keep arriving while the draw runs
