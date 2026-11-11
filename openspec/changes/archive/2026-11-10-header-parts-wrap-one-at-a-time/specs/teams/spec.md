## MODIFIED Requirements

### Requirement: The team page's header reads as the team's Franchise

The team page SHALL draw the team's avatar as tall as a Topic's image on the Topics page, on the web and in the mobile
app. Beside the avatar it SHALL show the team's name followed by Franchise as its heading, then how many members and
Topics the team has, then its description. Each of the three SHALL drop below the avatar on its own as the screen
narrows, the description first and the heading last, and SHALL take the whole width once it drops. The page's head
title SHALL read the same heading. Identifiers, routes, and the page's url SHALL keep team.

#### Scenario: The heading names the Franchise

- **WHEN** a visitor opens the public team Design Guild, which has four members, two public Topics, and a description
- **THEN** the heading reads "Design Guild Franchise", with "4 members · 2 topics" and the description beside the avatar

#### Scenario: A narrow screen drops the description first

- **WHEN** a visitor narrows a team page until the description no longer fits beside the avatar
- **THEN** the description takes the whole width below the avatar while the heading and the counts stay beside it

#### Scenario: A phone puts the heading under the avatar

- **WHEN** a visitor opens a team page on a phone
- **THEN** the avatar sits on its own line, and the heading, the counts, and the description take the whole width
  below it
