## ADDED Requirements

### Requirement: The server-rendered header and film poster show without an entrance animation

On a server-rendered topic page the header and the film player's poster SHALL be drawn in full from the first paint.
Neither SHALL start transparent, blurred, or moved, so the page's largest paint never waits for an animation.

#### Scenario: The header shows at once

- **WHEN** a visitor opens a server-rendered topic page
- **THEN** the header's image and title are at full opacity with no blur in the first paint

#### Scenario: The film poster is not faded in

- **WHEN** a visitor opens a server-rendered topic page whose latest Podcast Episode has a ready film
- **THEN** the film player's poster is at full opacity with no blur in the first paint
