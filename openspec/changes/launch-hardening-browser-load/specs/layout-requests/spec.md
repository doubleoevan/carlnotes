## Purpose

What a layout fetches at load and on a timer, for a user and for a visitor: the session read, one badges read, the
rooms read, and the Feed only where a reader of it mounts.

## ADDED Requirements

### Requirement: A signed-in layout sends three requests at load

On a cold full page load a signed-in layout SHALL send three requests of its own: the session read, the badges read,
and the rooms read. It SHALL send no Feed read and no mention count, pending invites, note badges, or unseen Comment
Mentions read of its own. A page's own reads and its view POST are not the layout's.

#### Scenario: A signed-in page with no Feed reader

- **WHEN** a signed-in user who is not an admin opens `/privacy` on a full page load
- **THEN** the browser sends `GET /api/auth/get-session`, `GET /api/badges`, and `GET /api/rooms`, each once, and no
  other request to the api

#### Scenario: An admin's layout sends the same three

- **WHEN** an admin opens the same page
- **THEN** the same three requests are sent, and the open report count arrives in the badges read

#### Scenario: A page with a reader adds its own Feed read

- **WHEN** a signed-in user opens `/topics` on a full page load
- **THEN** the layout sends its three requests, and the Topics page sends one Feed read as the page's own

### Requirement: A visitor's layout sends the session read alone

A visitor's layout SHALL send the session read and nothing else: no Feed read, no badges read, and no rooms read. The
badges read and its poll SHALL start only with a session.

#### Scenario: A visitor opens a public page

- **WHEN** a visitor opens `/privacy`, the home, a topic page, or a Topic Post's page on a full page load
- **THEN** the layout sends `GET /api/auth/get-session` and no other request, and no `GET /api/topic-feed` is sent

#### Scenario: A visitor is never polled

- **WHEN** a visitor leaves a page open for five minutes
- **THEN** the layout sends no request on a timer

### Requirement: The Feed loads only where a reader mounts and once the session is known

On the web the Feed read SHALL run only while a reader of the Feed's data is mounted and the session is known. The
readers are the Topics page, the tags row on the Topics and search pages, and the Edit topic dialog. The session is
known at once if the page request brought no session cookie. Every other consumer of the Feed state SHALL read its
filters, its handlers, and its reload, and SHALL start no Feed read.

#### Scenario: A signed-in load reads the Feed once

- **WHEN** a signed-in user opens `/topics` on a full page load
- **THEN** one Feed read is sent, after the session read returns, and none is sent before it

#### Scenario: A page with no reader reads no Feed

- **WHEN** a visitor or a user opens the home, a topic page, a podcast episode page, or a profile
- **THEN** no Feed read is sent

#### Scenario: A visitor's Topics page is seeded by its loader

- **WHEN** a visitor opens the server-rendered Topics page
- **THEN** the page shows the Feed its loader read, and the browser sends no Feed read

#### Scenario: Opening the Edit topic dialog reads the Feed

- **WHEN** a user on a topic page opens the Edit topic dialog
- **THEN** one Feed read is sent for the dialog's tags and limits, and no Feed read is sent after the dialog closes

### Requirement: A link or a button that leads to a reader prefetches the Feed on intent

A link to the Topics page and a New Topic button SHALL start the Feed read on hover, focus, or touch start, once the
session is known. A reader that mounts within a few seconds SHALL use that read and send no second one.

#### Scenario: A hover then a click sends one read

- **WHEN** a user moves the pointer onto the header's Topics link and then clicks it
- **THEN** one Feed read is sent, started by the hover, and the Topics page shows it

#### Scenario: A touch start begins the read

- **WHEN** a user on a phone touches the New Topic button
- **THEN** the Feed read starts at the touch start, before the dialog opens

#### Scenario: A hover with no click reads once

- **WHEN** a user moves the pointer onto the Topics link several times within a few seconds and never clicks
- **THEN** one Feed read is sent

### Requirement: One badges read returns every count

`GET /api/badges` SHALL return the signed-in user's chat mention count, pending topic invites, note badges, and unseen
Comment Mentions, and for an admin the open report count, each in the shape its own route returns. The chat mention
count and the unseen Comment Mentions SHALL come through the caches their own routes read. A request with no session
SHALL be rejected with 401.

#### Scenario: Each part matches its own route

- **WHEN** a user reads the badges read and then each route it gathers
- **THEN** each part of the badges read equals that route's response

#### Scenario: A user who is not an admin gets no report count

- **WHEN** a user who is not an admin reads the badges read
- **THEN** it holds no open report count, and no report query runs

#### Scenario: A visitor is rejected

- **WHEN** a request with no session reads the badges read
- **THEN** it is rejected with 401

### Requirement: One poll reads the badges

The web and the mobile app SHALL read the badges read once a session is known and then on one timer every 45
seconds, and SHALL run no other timer for a badge. The poll SHALL pause while the tab is hidden or the app is in the
background, and SHALL read at once on return. A user's own write SHALL still refresh its badge at once.

#### Scenario: A poll is one request

- **WHEN** 45 seconds pass in a visible signed-in tab
- **THEN** one `GET /api/badges` request is sent, and no request to the mention count, pending invites, note badges,
  or report count routes

#### Scenario: A hidden tab does not poll

- **WHEN** a signed-in tab is hidden for ten minutes and then shown
- **THEN** no badges request is sent while it is hidden, and one is sent as it shows

#### Scenario: A user's own write does not wait for the poll

- **WHEN** a user opens a note with unread changes, or accepts or declines a topic invite
- **THEN** that badge drops before the next poll

### Requirement: The rooms are read on the first count and on a changed one

The room list SHALL stay a read of its own. The layout SHALL read it once with the first chat mention count, and again
only if a later badges read's chat mention count differs from the one before.

#### Scenario: An unchanged count reads no rooms

- **WHEN** two badges polls in a row return the same chat mention count
- **THEN** no rooms read is sent between them

#### Scenario: A changed count reads the rooms once

- **WHEN** a badges poll returns a chat mention count that differs from the previous one
- **THEN** one rooms read is sent, and every room's badge updates together

### Requirement: The note badges and the pending invites are cached per user

The reads behind the note badges and the pending topic invites SHALL be cached on the server per user, as the unseen
Comment Mentions are. Every write that changes a user's note badges or pending invites SHALL clear that user's cached
entry, so no badge shows a count that a write already changed. While Redis is unreachable each read SHALL run its
queries.

#### Scenario: A second read runs no note or invite query

- **WHEN** a user's badges are read twice with no note or invite write in between
- **THEN** the second read runs no query for the note badges or the pending invites

#### Scenario: A teammate's edit shows at the next read

- **GIVEN** a user whose note badges are cached
- **WHEN** another user edits or comments on a note that user may see
- **THEN** the user's cached entry is cleared, and their next badges read counts the change

#### Scenario: A read on one device clears the other's badges

- **WHEN** a user opens an unread note in the mobile app while their web tab is open
- **THEN** the read record clears their cached note badges, and the web tab's next badges read shows the note read

#### Scenario: An invite write clears the cached invites

- **WHEN** a user is sent a topic invite, accepts or declines one, or its sender deletes it
- **THEN** the user's cached pending invites are cleared, and their next read holds the invites as they now stand

#### Scenario: Redis is unreachable

- **WHEN** a badges read arrives while Redis is unreachable
- **THEN** the note badges and the pending invites are read from Postgres, and the read succeeds

### Requirement: The badge routes a shipped build reads stay

`GET /api/note-badges`, `GET /api/rooms/mention-count`, `GET /api/rooms`, `GET /api/invites/topics/pending`,
`GET /api/comment-mentions/unseen`, and `GET /api/admin/reports/count` SHALL stay, each with the response its frozen
contract snapshot names. A mobile build released before the badges read SHALL keep its badges with no update.

#### Scenario: A shipped build polls its own routes

- **WHEN** a mobile build released before the badges read polls its badge routes
- **THEN** each route returns its released shape, and the build's badges count as before

#### Scenario: The contract freeze holds the six routes

- **WHEN** the contract freeze check runs
- **THEN** every snapshot that names one of the six routes can still read its response

### Requirement: Team statuses load only with a session

A profile page SHALL read the profile's team statuses only for a signed-in user. For a visitor it SHALL send no team
statuses request and SHALL treat the list as empty.

#### Scenario: A visitor's profile sends no team statuses read

- **WHEN** a visitor opens a profile
- **THEN** no `GET /api/profiles/:userId/team-statuses` request is sent, and the page gets no 401

#### Scenario: A user's profile reads them

- **WHEN** a signed-in user opens another person's profile
- **THEN** the team statuses are read once the session is known
