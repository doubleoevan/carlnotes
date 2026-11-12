# viewer-counts Specification

## Purpose
TBD - created by archiving change viewer-counts-and-trending. Update Purpose after archive.

## Requirements

### Requirement: A topic's viewers are counted once per person, all time

A Topic's viewers SHALL be the unique people who opened its page, signed in or not, counted all time in a Redis
HyperLogLog for that Topic. A signed-in person SHALL count by their user id. The topic page SHALL record a view with one
request after it hydrates and loads its Topic, at most once per Topic per tab, remembered in the tab's memory alone. The
view route SHALL respond with 204 in every case and SHALL skip a request whose user agent names a crawler or a link
unfurler. It SHALL count at most 30 requests a minute per user for a signed-in person, or per address for a visitor,
and SHALL count a view only from someone who may view the Topic. A Redis failure SHALL lose the view and SHALL NOT fail
the request or the page.

#### Scenario: A repeat view in one tab counts once
- **WHEN** a visitor opens a topic page, leaves it, and comes back to it in the same tab
- **THEN** the page sends one view request, and the Topic's viewers rise by one

#### Scenario: A crawler is not a viewer
- **WHEN** a request to the view route includes a crawler's user agent
- **THEN** the route responds with 204 and counts nothing

#### Scenario: A view of a topic the caller cannot see counts nothing
- **WHEN** a visitor sends a view request for a private Topic
- **THEN** the route responds with 204 and counts nothing, revealing nothing about the Topic

#### Scenario: Redis down leaves the page working
- **WHEN** Redis is unreachable and a visitor opens a topic page
- **THEN** the page renders, the view request responds with 204, and the view is not counted

### Requirement: A Podcast Episode's listeners are counted from plays and downloads

A Podcast Episode's listeners SHALL be the unique people who played or downloaded it, in the web player or a podcast
app, signed in or not, counted all time in a Redis HyperLogLog for that Podcast Episode. Each audio route SHALL count a
GET that passes its access check: the public route counts the signed-in person or the visitor, and the token route
counts the token's person. A HEAD SHALL count nothing. A crawler or a link unfurler SHALL be skipped, and a podcast app
or a feed reader SHALL be counted. The web player's playback start SHALL also count a signed-in person, beside the
listen it already saves, with the same element, so one person never counts twice. A Redis failure SHALL lose the
listen and SHALL NOT fail the audio request.

#### Scenario: A podcast app's download from a public feed counts
- **WHEN** a podcast app with no session fetches a public Podcast Episode's audio
- **THEN** the Podcast Episode's listeners rise by one

#### Scenario: A size check counts nothing
- **WHEN** a podcast app sends a HEAD to a Podcast Episode's audio
- **THEN** no listener is counted

#### Scenario: A signed-in play counts once
- **WHEN** a signed-in person starts a Podcast Episode in the web player, which saves the listen and fetches the audio
- **THEN** the Podcast Episode's listeners rise by one

### Requirement: A visitor is told apart by a keyed hash that is never stored

A visitor SHALL be counted as an HMAC of their resolved address and their user agent, keyed by the app's auth secret
under a purpose of its own, so the counts need no new secret. The hash SHALL be added to the HyperLogLog and stored
nowhere else, and nothing SHALL be set on the device: no cookie, and nothing in `localStorage` or `sessionStorage`. A
request with no resolvable address SHALL count nothing. The privacy page SHALL say how the counts are kept, in a
paragraph of its own after Product analytics.

#### Scenario: A visit sets nothing on the device
- **WHEN** a visitor opens a topic page and plays a Podcast Episode
- **THEN** no cookie is set and no storage entry is written for the counts

#### Scenario: The same visitor counts once across days
- **WHEN** a visitor on the same address and browser opens one topic page on two different days
- **THEN** the Topic's viewers rise by one in all

### Requirement: The sweep copies the counts into columns and keeps them through a restart

Every scheduled sweep SHALL, under a job lease of its own, copy the estimate of every Topic and Podcast Episode whose
counter changed into `topics.viewer_count` and `episodes.listener_count`, never lowering either, and save each changed
counter's bytes in `viewer_counters`. A Topic or Podcast Episode whose copy fails SHALL be copied by the next sweep.
After a Redis restart, and on the first sweep after the release, the sweep SHALL rebuild Redis before it copies
anything: it SHALL merge every saved counter back into its key, so every count the last sweep saved is kept, and add
every signed-in person Postgres records as a Topic's owner, active follower, or opener of its findings, or as a Podcast
Episode's listener. The views and listens added after the last sweep and before the restart were never
saved, so a restart loses up to one sweep's worth of new viewers and listeners. The homepage feed and the trending sort
SHALL read the columns alone.

#### Scenario: A saved count survives a Redis restart
- **WHEN** Redis restarts empty, a new visitor opens a topic page, and the next sweep runs
- **THEN** the Topic's viewers are its saved count plus the new visitor, and its column never shows less

#### Scenario: A restart loses the views since the last sweep
- **WHEN** a visitor opens a topic page after a sweep, and Redis restarts before the next sweep
- **THEN** that view is lost, and the Topic's shown viewers stay at the saved count

#### Scenario: The rebuild seeds the signed-in people Postgres records
- **GIVEN** a Topic whose owner, one follower, and one user who opened a finding are recorded in Postgres
- **WHEN** the first sweep after the release runs on a Redis with no restore marker
- **THEN** the Topic's viewers are three, and a second rebuild leaves them at three

#### Scenario: Two sweeps never copy at once
- **WHEN** a second sweep starts while the first still holds the lease
- **THEN** the second copies nothing

### Requirement: The counts endpoint returns a topic's or a Podcast Episode's counts

`GET /api/counts/topics/:id` SHALL return the Topic's `viewerCount` and `subscriberCount`, and
`GET /api/counts/episodes/:id` the Podcast Episode's `listenerCount`. A count SHALL be the larger of the live estimate
and the saved column, so a page never shows a count that dropped. A Topic that the caller may not view, or a Podcast
Episode of one, SHALL respond with 404, checked like the Topic itself.

#### Scenario: A stranger reads no private counts
- **WHEN** someone who may not view a private Topic requests its counts
- **THEN** the route responds with 404

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

### Requirement: A changed count flashes once

A count SHALL render through the shared `FlashingCount` component as its label, a colon, and its number, with tabular
numbers so its width holds. When a count changes after its first value, its number SHALL flash once in the highlight
color. With `prefers-reduced-motion`, the number SHALL change without a flash. The component SHALL have stories for a
count, a count in the thousands with its separator, a change, and a change under reduced motion, each passing the
component browser's accessibility checks, and SHALL be listed in the Nightshift inventory.

#### Scenario: The first value does not flash
- **WHEN** the topic page's counts arrive for the first time
- **THEN** the numbers show without a flash

#### Scenario: Reduced motion changes the number without a flash
- **WHEN** a count changes for someone who prefers reduced motion
- **THEN** the new number shows with no animation

### Requirement: A topic counts its owner as a viewer

Every Topic SHALL count its owner among its viewers, so no Topic page shows zero viewers. Creating a Topic SHALL add the
owner to its counter, and the sweep's rebuild SHALL add the owner of every Topic that exists.

#### Scenario: A new topic shows one viewer
- **WHEN** a user creates a Topic and nobody else opens it
- **THEN** the Topic's counts read one viewer

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
