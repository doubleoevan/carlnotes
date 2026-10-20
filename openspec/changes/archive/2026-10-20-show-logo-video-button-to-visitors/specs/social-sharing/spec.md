## MODIFIED Requirements

### Requirement: The card image is generated on demand and cached in object storage

The preview image SHALL be served from its own route. That route SHALL check object storage first and, on a miss, render JSX to SVG with Satori and SVG to PNG at 1200×630 with resvg, write the result to storage, and stream it.

Satori has no access to system fonts, so the font files SHALL be committed to the repository and passed as buffers.

The card SHALL carry the logo, the Topic title, the owner byline, and the Finding counts. The byline's avatar SHALL be the owner's initials on their tint, redrawn in the card's own layout. The card deliberately never fetches an uploaded or provider photo, so it stays a render of committed inputs.

#### Scenario: A cached card is served from storage

- **WHEN** a card image is requested for a Topic whose card is already stored
- **THEN** the stored object is streamed and nothing is re-rendered

#### Scenario: A miss renders, stores, and streams

- **WHEN** a card image is requested and no stored object matches
- **THEN** it is rendered to a 1200×630 PNG, written to storage, and streamed in the same request

#### Scenario: Fonts come from the repository

- **WHEN** the card renders
- **THEN** its fonts are read from committed files passed as buffers, not from system fonts

### Requirement: A profile link renders its own preview card

`GET /api/profiles/:userId/preview.png` SHALL render a card in the topic card's format: the logo on top, the user's avatar and username in the slot a topic card gives its title, the public topic count bottom left, and the follower count bottom right. The card SHALL be cached and versioned the way topic cards are, so an avatar or count change lands the card on a new URL. A missing user SHALL answer 404.

#### Scenario: A profile card draws the person

- **WHEN** the card is fetched for an existing user
- **THEN** a PNG at the platform preview size draws their avatar or initials, their username, and their public topic and follower counts

#### Scenario: A missing user has no card

- **WHEN** the userId matches nobody
- **THEN** the response is a 404
