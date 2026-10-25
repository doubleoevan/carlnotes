## MODIFIED Requirements

### Requirement: One palette serves both themes, and the avatar is styled like the app's other controls

The same six tints SHALL be used in the light and dark themes. An avatar is an identity, and a color that changes when
the reader flips the theme is a weaker identity than one that holds.

The letters stay legible in both themes without adjustment, because the circle supplies its own background, so the
ink-to-tint contrast never depends on the page.

The circle's **edge** does depend on the page, and in the dark theme the tint does not carry it: the tints separate
from the dark background by as little as 1.42:1 and from the dark card by 2.55:1, under the 3:1 a meaningful boundary
needs, against 3.84:1 to 7.06:1 in light.

An avatar sits inside a link to its owner's profile page, so it SHALL take the same styling the app's other controls
take: a border and the raised shadow, plus the standard focus-visible ring. That is what gives it an edge in the dark
theme, the border token instead of a bespoke ring invented for avatars, and the raised shadow raises it as it raises
every button and tile. Swapping the palette per theme SHALL NOT be used to solve this, since that would trade a stable
identity color away to fix a problem that lives at the edge.

#### Scenario: A user's color survives a theme change

- **WHEN** a reader switches between light and dark
- **THEN** every avatar keeps the tint it had

#### Scenario: The circle reads as a shape on a dark page

- **WHEN** an avatar renders against the dark theme's background or card
- **THEN** its edge is readable, carried by the same border treatment the app's other controls use

#### Scenario: The avatar carries the control styling

- **WHEN** an avatar renders inside a link to a profile
- **THEN** it has a border, the raised shadow, and the standard focus-visible ring, matching the app's buttons and
  tiles

#### Scenario: The avatar is reachable by keyboard

- **WHEN** a reader tabs to the link an avatar sits in
- **THEN** it takes focus visibly and activates to its owner's profile page
