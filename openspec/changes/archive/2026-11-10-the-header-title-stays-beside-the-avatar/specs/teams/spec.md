## REMOVED Requirements

### Requirement: The team page's header reads as the team's Franchise

**Reason**: replaced by the requirement below, which keeps the heading beside the avatar at every width.

## ADDED Requirements

### Requirement: The team page's header keeps its Franchise heading beside the avatar

The team page SHALL draw the team's avatar as tall as a Topic's image on the Topics page. Its heading SHALL be the
team's name followed by Franchise, beside the avatar at every width, with the counts and the description under it.
The page's head title SHALL read the same heading. Identifiers, routes, and the url SHALL keep team.

#### Scenario: The heading names the Franchise

- **WHEN** a visitor opens the public team Design Guild, which has four members, two public Topics, and a description
- **THEN** the heading reads "Design Guild Franchise", with "4 members · 2 topics" and the description beside the avatar

#### Scenario: A narrow screen drops the description first

- **WHEN** a visitor narrows a team page until the description no longer fits beside the avatar
- **THEN** the description takes the whole width below the avatar while the heading and the counts stay beside it

#### Scenario: A phone keeps the heading beside the avatar

- **WHEN** a visitor opens a team page on a phone
- **THEN** the heading sits beside the avatar over two lines, and the counts and the description take the whole width
  below it
