## ADDED Requirements

### Requirement: The team page read holds the team's head and its saved Visitors count

`GET /api/teams/:id/page` SHALL also return the team's head and the team's saved Visitors count, so the server render of
a team page sends one api request. A visitor's read of a public team SHALL be served from the team page's 60-second
copy, as the page-reads capability states. The team's notes SHALL stay a read of their own.

#### Scenario: A team render is one request

- **WHEN** the server renders a public team's page
- **THEN** its loader sends the page read alone, where it sent the head and the page as two

#### Scenario: The Visitors line reads the saved count

- **WHEN** a visitor's team page mounts
- **THEN** the Visitors line shows the saved count that the page read holds, and the server-rendered line stays empty,
  as the viewer-counts capability states

#### Scenario: The saved count may lag

- **WHEN** a team's Visitors count rises and a visitor opens its page inside the copy's lifetime
- **THEN** the page read MAY hold the earlier count, and the page's next counts read shows the new one

#### Scenario: A member's own rows are never in the copy

- **WHEN** a member of the team opens its page
- **THEN** the page shows the members and the Topics that the member may see, read for that member alone, and the
  visitors' copy holds none of what a visitor may not see

#### Scenario: The notes load on their own

- **WHEN** a reader opens a team page
- **THEN** the team's notes are requested apart from the page read
