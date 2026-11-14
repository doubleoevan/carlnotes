## MODIFIED Requirements

### Requirement: Someone else's profile shows public events only

For anyone but the person and an admin, a visitor included, a profile's news SHALL hold only events on public Topics.
It SHALL hold the person's own group, and the team group only for public Teams where the person's membership is shown,
read from the one query the Café's Teams come from. It SHALL hold nothing from the Topics the person follows.

#### Scenario: A visitor's first page is up to a minute old

- **WHEN** two visitors open the same profile's news for the week within a minute
- **THEN** the second is served the first one's page, and a signed-in reader's page is always read new

#### Scenario: A private Topic's event is absent

- **WHEN** a visitor opens the profile of a person whose private Topic gained a Comment
- **THEN** the news holds no row for that Comment

#### Scenario: A hidden membership's Team is absent

- **WHEN** a person hid their membership of a public Team and another user opens their profile
- **THEN** the news holds no event from that Team's Topics

#### Scenario: A followed Topic's event is absent

- **WHEN** a person follows a public Topic that gained a Finding, and another user opens their profile
- **THEN** the news holds no row for that Finding

## ADDED Requirements

### Requirement: An admin reads anyone's whole news

A signed-in admin SHALL read any person's news as the person reads it: all three groups, the followed group included,
but no private Topic of the person's whose Personal sources text is not converted. An admin's read SHALL never be
cached and SHALL show the admin's own listening progress. A read in the visitor audience SHALL return what a
visitor reads to any reader.

#### Scenario: An admin opens someone's Café

- **WHEN** an admin opens the profile of a person whose private Topic gained a Finding
- **THEN** the news holds the Finding's row

#### Scenario: A read in the visitor view

- **WHEN** an admin reads that person's news in the visitor view
- **THEN** the news leaves out the private Topic's row and starts at its first page

#### Scenario: An unconverted private Topic stays out of an admin's read

- **WHEN** an admin reads the news of a person whose private Topic still has Personal sources text to convert
- **THEN** the news leaves out that Topic's rows
