## ADDED Requirements

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

Every scheduled sweep SHALL, under a claim of its own, copy the estimate of every Topic and Podcast Episode whose
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
- **WHEN** a second sweep starts while the first still holds the claim
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

The topic page SHALL end with a line reading "Viewers: N" and "Followers: N", with space between the two counts and no
separator, and the Podcast Episode page with a line reading "Listeners: N". Each label SHALL be fixed and muted and
followed by a colon, so a count of one reads "Viewers: 1", and each number SHALL be bold in the text color. Each line
SHALL hold one line of height in the server render and SHALL show its counts only after the page has mounted, so no
count is in the server-rendered HTML and nothing shifts as the line fills in. The page SHALL read its counts once after
hydration if the page is visible, then every 60 seconds while its tab is visible, and at once when the tab shows again.
It SHALL never send a second read while one is in flight.

#### Scenario: The server render includes no count
- **WHEN** a visitor's topic page is rendered on the server
- **THEN** its HTML holds the empty line and no viewer or follower count in it

#### Scenario: A count of one keeps its label
- **WHEN** a Topic has one viewer and the topic page's counts arrive
- **THEN** the line reads "Viewers: 1"

#### Scenario: A hidden tab stops reading
- **WHEN** the topic page's tab is hidden for five minutes
- **THEN** the page reads no counts until the tab shows again, then reads them at once

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
