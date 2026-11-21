## ADDED Requirements

### Requirement: A card's lookup is read through a cache

A card route's lookup, from the id in its path to the card's storage key and version, SHALL be read through the Redis
store's read-through cache with a short time to live, so a repeated request for one card sends no query. A request whose
query string is anything but the current `v` SHALL be redirected to the versioned url before storage is asked for the
card, as the edge-caching capability states. A request at the card's current version SHALL never be redirected to an
earlier one.

#### Scenario: A looped card request sends no query

- **WHEN** one address requests a Topic's card a hundred times inside the lookup's time to live
- **THEN** the lookup's queries run once

#### Scenario: A changing query string reads no storage

- **WHEN** a card is requested with a query string other than its current `v`
- **THEN** the response is the redirect to the versioned url, and storage is not asked whether the card exists

#### Scenario: A new version is served at once

- **WHEN** a Topic's title changes and a crawler requests the card at its new version inside the lookup's time to live
- **THEN** the card for the new title is served, and the request is not redirected to the earlier version
