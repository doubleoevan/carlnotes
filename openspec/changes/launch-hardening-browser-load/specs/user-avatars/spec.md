## ADDED Requirements

### Requirement: A stored avatar image loads lazily

On the web an avatar drawn from a stored image SHALL load lazily and decode off the main thread, wherever it shows.
The inline initials SHALL be unchanged.

#### Scenario: An avatar below the first screen waits

- **WHEN** a page shows avatars below its first screen
- **THEN** their images are requested only as they near the screen

#### Scenario: An avatar on the first screen still loads with the page

- **WHEN** a signed-in user's header shows their uploaded avatar
- **THEN** the image loads as the page loads, with asynchronous decoding
