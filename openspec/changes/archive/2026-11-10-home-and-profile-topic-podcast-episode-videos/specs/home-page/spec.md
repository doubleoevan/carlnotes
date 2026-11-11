## ADDED Requirements

### Requirement: The home payload carries the home films and the new films from the cached query

The home payload SHALL hold the home films and the films new this week as film cards, read from the same cached entry
as the home podcast episodes, never computed per request. The fields SHALL be optional, so a released mobile app that
does not read them keeps working. Only ready films of public shown Topics SHALL ever appear.

#### Scenario: An older app reads the new payload

- **WHEN** a released mobile version without the film sections reads the home payload
- **THEN** it renders its sections as before

#### Scenario: A turned-private Topic's film leaves the home

- **WHEN** a Topic whose film is pinned turns private
- **THEN** the film leaves both home film sections on the next cache refresh
