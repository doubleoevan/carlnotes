## ADDED Requirements

### Requirement: The profile page arrives in one page read

`GET /api/profiles/:userId/page` SHALL return the profile's head, the profile, and the first page of the week's news,
which is null if the news read fails. A visitor's read SHALL be served from the profile's 60-second copy, as the
page-reads capability states. `GET /api/profiles/:userId`, its news route, and its team statuses route SHALL stay as
they are.

#### Scenario: A visitor's profile render is one request

- **WHEN** the server renders a visitor's profile
- **THEN** its loader sends the page read alone, where it sent the head, the profile, and the news as three, and the
  HTML holds the first page of the week's news

#### Scenario: A warm profile costs no query

- **WHEN** a second visitor opens the same profile inside a minute
- **THEN** the page read is served from the profile's copy and sends no query

#### Scenario: A failed news read leaves the profile

- **WHEN** the news read inside a profile's page read fails
- **THEN** the page read returns the head and the profile with a null news page, and the profile renders

#### Scenario: A person reads their own profile fresh

- **WHEN** a signed-in person opens their own profile
- **THEN** the page read is built from the database with their private and invite Topics, and no copy is read or stored

### Requirement: A person's own profile reads their Topics from its page read

A person's own profile page SHALL draw its topics table from the Topic rows its page read returns, and SHALL NOT read
the Activity page's payload for them. The Activity read SHALL send the reads that do not depend on one another together,
where it sent each after the one before it.

#### Scenario: One's own profile sends no Activity read

- **WHEN** a signed-in person opens their own profile
- **THEN** the topics table, with its email and active controls, is drawn from the page read, and no `GET /api/activity`
  is sent

#### Scenario: The Activity read runs its reads together

- **WHEN** `GET /api/activity` loads for a person with Topics
- **THEN** its independent reads run together, and the response holds what it held before
