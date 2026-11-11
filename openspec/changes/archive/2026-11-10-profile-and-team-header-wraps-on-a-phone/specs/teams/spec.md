## MODIFIED Requirements

### Requirement: The team page's header reads as the team's Franchise

The team page SHALL draw the team's avatar as tall as a Topic's image on the Topics page, on the web and in the mobile
app. Beside the avatar on a wide screen, and below it at phone width, it SHALL show the team's name followed by
Franchise as its heading, then how many members and Topics the team has, then its description. The page's head title
SHALL read the same heading. Identifiers, routes, and the page's url SHALL keep team.

#### Scenario: The heading names the Franchise

- **WHEN** a visitor opens the public team Design Guild, which has four members, two public Topics, and a description
- **THEN** the heading reads "Design Guild Franchise", with "4 members · 2 topics" and the description beside the avatar

#### Scenario: A phone puts the heading under the avatar

- **WHEN** a visitor opens a team page on a phone
- **THEN** the avatar sits on its own line, and the heading, the counts, and the description take the whole width
  below it
