## MODIFIED Requirements

### Requirement: The pages show the counts after hydration and refresh them while visible

The topic page SHALL end with a line reading "Visitors: N" and "Followers: N", with space between the two counts and no
separator, and the Podcast Episode page with a line reading "Listeners: N". Each label SHALL be fixed and muted and
followed by a colon, so a count of one reads "Visitors: 1", and each number SHALL be bold in the text color. Each line
SHALL hold one line of height in the server render and SHALL show its counts only after the page has mounted, so no
count is in the server-rendered HTML and nothing shifts as the line fills in. The page SHALL read its counts once after
hydration if the page is visible, then every 60 seconds while its tab is visible, and at once when the tab shows again.
It SHALL never send a second read while one is in flight. The mobile app's Topic and Podcast Episode screens SHALL read
their counts on the same 60-second rhythm while the screen is the active route and the app is in the foreground, never
from the background, and a failed read SHALL keep the last counts shown.

#### Scenario: The server render includes no count
- **WHEN** a visitor's topic page is rendered on the server
- **THEN** its HTML holds the empty line and no visitor or follower count in it

#### Scenario: A count of one keeps its label
- **WHEN** a Topic has one viewer and the topic page's counts arrive
- **THEN** the line reads "Visitors: 1"

#### Scenario: A hidden tab stops reading
- **WHEN** the topic page's tab is hidden for five minutes
- **THEN** the page reads no counts until the tab shows again, then reads them at once

#### Scenario: The app's episode screen keeps its count
- **WHEN** a Podcast Episode screen is open in the app for three minutes and its second read fails
- **THEN** the screen sent three reads, one a minute, and the line still shows the last count that arrived

#### Scenario: A backgrounded app reads no counts
- **WHEN** the app goes to the background on a Topic screen for five minutes
- **THEN** no count is read until it returns to the foreground, then the counts are read at once

### Requirement: The privacy page names what a profile makes public

The privacy page SHALL say that a person's Café is a public page, that it shows their public Topics, Podcast Episodes,
and Topic Posts and the public events on them, that Topic Posts on a public Topic are public, and that Café and Team
pages count their visitors the way Topic pages count viewers. It SHALL say that views and plays are counted by day and
by the city Cloudflare reports, with no IP address stored, and that a city shows on a map only with at least ten
people. Each SHALL be an addition that leaves the existing policy whole.

#### Scenario: The policy names the Café and its counts

- **WHEN** a visitor opens the privacy page
- **THEN** it says a Café and the Topic Posts of a public Topic are public, and that Café and Team visits are counted
  with no cookie and no stored address

#### Scenario: The policy names visitors by place

- **WHEN** a visitor opens the privacy page
- **THEN** it says views and plays are counted by day and city with no IP address stored, and that a city needs ten
  people to show on a map

## ADDED Requirements

### Requirement: A Topic Post's visitors are counted once per person, all time

A Topic Post page visit SHALL count its sender among the post's viewers in an all-time counter of distinct people, on
the same terms as a topic page view: sent from the app's own origin, within the view rate limit, skipping crawlers, and
only for a post the sender may open. A reload SHALL never count a person twice. The post's author SHALL count as a
viewer.

#### Scenario: Reloads count once

- **WHEN** one visitor reloads a public Topic Post page ten times
- **THEN** the post's count rises by one

#### Scenario: A post the sender may not open counts nothing

- **WHEN** someone who may not open a private Topic sends a view of one of its posts
- **THEN** no count changes and the response is 204

### Requirement: The counts endpoint returns a Topic Post's visitors

The counts endpoint SHALL return a Topic Post's viewer count, shared at the edge if its Topic is public, and SHALL
respond with 404 for a post the caller may not open.

#### Scenario: A private post's count is withheld

- **WHEN** someone who may not open a private Topic requests one of its posts' counts
- **THEN** the route responds with 404

### Requirement: The Topic Post page ends with a Visitors line

The Topic Post page SHALL end with a line reading "Visitors: N", on the web and in the mobile app, drawn and refreshed
as the profile page's Visitors line is.

#### Scenario: A post shows its visitors

- **WHEN** a Topic Post with 42 viewers has loaded its count
- **THEN** its page ends with "Visitors: 42"
