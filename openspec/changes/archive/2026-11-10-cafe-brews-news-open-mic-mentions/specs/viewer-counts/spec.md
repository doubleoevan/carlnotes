# Spec Delta

## ADDED Requirements

### Requirement: A profile's and a Team's viewers are counted once per person, all time

A profile's viewers and a Team's viewers SHALL be the unique people who opened that page, signed in or not, counted all
time as a Topic's viewers are: one request after the page loads, at most once per page per tab, a 204 in every case,
crawlers skipped, the same rate limit, the same keyed hash for a visitor, and nothing set on the device. A Team's view
SHALL count only from someone who may open the Team's page.

#### Scenario: A visitor's profile view counts once

- **WHEN** a visitor opens a profile page, leaves it, and comes back in the same tab
- **THEN** the page sends one view request, and the profile's viewers rise by one

#### Scenario: A private Team's view from a non-member counts nothing

- **WHEN** a user who is not a member sends a view request for a private Team
- **THEN** the route responds with 204 and counts nothing

#### Scenario: Redis down leaves the profile working

- **WHEN** Redis is unreachable and a visitor opens a profile page
- **THEN** the page renders, the view request responds with 204, and the view is not counted

### Requirement: The sweep copies profile and team viewers too

The scheduled sweep that copies Topic viewers SHALL, under the same job lease, copy each changed profile's and Team's
estimate into a column on the user and on the Team, never lowering either, and save each changed counter's bytes. A
Redis rebuild SHALL merge the saved profile and team counters back before anything is copied.

#### Scenario: A saved profile count survives a Redis restart

- **WHEN** Redis restarts empty, a new visitor opens a profile page, and the next sweep runs
- **THEN** the profile's viewers are its saved count plus the new visitor, and its column never shows less

### Requirement: The counts endpoint returns a profile's and a Team's viewers

`GET /api/counts/profiles/:userId` and `GET /api/counts/teams/:id` SHALL each return a `viewerCount`, the larger of the
live estimate and the saved column. A Team the caller may not open SHALL respond with 404, checked like the Team's
page.

#### Scenario: A non-member reads no private Team count

- **WHEN** someone who may not open a private Team requests its counts
- **THEN** the route responds with 404

### Requirement: The profile and Team pages end with a Visitors line

The profile page and the Team page SHALL each end with a line reading "Visitors: N", on the web and in the mobile app,
drawn and refreshed as the Topic page's counts line is: empty in the server render, filled after the page mounts, and
read again every 60 seconds while visible. The web SHALL flash the count once on a change. The mobile app SHALL show
it with no flash, as `apps/mobile/parity.md` records for its Topic counts line. Code SHALL name the counts profile
viewers and team viewers.

#### Scenario: A count of one keeps its label

- **WHEN** a profile has one viewer and its count arrives
- **THEN** the line reads "Visitors: 1"

#### Scenario: The mobile app changes the count with no flash

- **WHEN** a profile's viewer count rises while its screen is open in the mobile app and on the web
- **THEN** both lines read the new count after the next read, and only the web's count flashes

#### Scenario: The server render holds no count

- **WHEN** a visitor's Team page is rendered on the server
- **THEN** its HTML holds the empty line and no count in it

### Requirement: The privacy page names what a profile makes public

The privacy page SHALL say that a person's Café is a public page, that it shows their public Topics, Podcast Episodes,
and Topic Posts and the public events on them, that Topic Posts on a public Topic are public, and that Café and Team
pages count their visitors the way Topic pages count viewers. Each SHALL be an addition that leaves the existing policy
whole.

#### Scenario: The policy names the Café and its counts

- **WHEN** a visitor opens the privacy page
- **THEN** it says a Café and the Topic Posts of a public Topic are public, and that Café and Team visits are counted
  with no cookie and no stored address
