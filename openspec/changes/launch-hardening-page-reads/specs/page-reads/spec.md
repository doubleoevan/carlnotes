## Purpose

Each page of the site arrives in one api read that holds its head and its first screen. This capability states what that
read holds, how the server render passes it to the browser, what of it visitors share, and what it may cost.

## ADDED Requirements

### Requirement: Each page arrives in one page read with its head and its first screen

The api SHALL serve one page read for each page: `GET /api/profiles/:userId/page`, `GET /api/topics/:id/page`, `GET
/api/topics/:id/episodes/:season/:episodeNumber/page`, `GET /api/topic-posts/:id/page`, `GET
/api/dashboards/:dashboardKind/:subjectId/page`, and `GET /api/teams/:id/page`. Each SHALL return the page's head with
everything its first screen shows. `GET /api/home` SHALL stay the home's one read.

#### Scenario: A page read holds the head and the page

- **WHEN** a client reads a public Topic Post's page read
- **THEN** one response holds the page's head and the post with its body, its discussion, and the first page of its
  comment thread

#### Scenario: The head is the one the head route returned

- **WHEN** a page read returns its head
- **THEN** the head holds the title, the canonical url, the card tags, and the structured data that the page's own
  capability states for that reader

#### Scenario: A head costs no query of its own

- **WHEN** a public topic's page read loads
- **THEN** its head is built from the rows the page already loads, and no statement runs for the head alone

### Requirement: What sits past the first screen stays a read of its own

A page read SHALL NOT hold a comment thread past its first page, a later page of a list, a chart selection other than
the default, a team's notes, or the day's opener. Each SHALL stay a read of its own, started if the reader reaches it.
The counts that a page refreshes on a timer, the layout's reads, and the page's view count SHALL stay their own requests
too.

#### Scenario: A later page of comments is its own read

- **WHEN** a reader opens the second page of a Topic Post's comment thread
- **THEN** the page sends the comments read for that page, and the page read is not sent again

#### Scenario: The opener never holds a page read

- **WHEN** a signed-in user's home loads while the day's opener waits on its model call
- **THEN** the home's read returns without the opener, and the opener arrives from its own read

### Requirement: The server render sends one page read and hydration fetches nothing again

A server-rendered page's loader SHALL send its page read as its one api request, and the payload SHALL reach the browser
in the HTML. Hydration SHALL start from that payload and SHALL fetch nothing that the server already read: no head, no
page data, and no default selection.

#### Scenario: A render sends one request

- **WHEN** the server renders a public topic page
- **THEN** its loader sends one api request, where it sent the head and the page as two

#### Scenario: Hydration reads nothing again

- **WHEN** a visitor's browser hydrates a server-rendered Dashboard page
- **THEN** it sends no request for the default selection that the server read, and the charts draw from the payload

#### Scenario: A navigation inside the app sends the same read

- **WHEN** a visitor follows a link inside the app to a profile
- **THEN** the browser sends that profile's page read as the page's one data request

### Requirement: A part folded into a page read returns null on its own failure

A part of a page read that has a read of its own elsewhere, the first page of a profile's news or of a signed-in home's
news, SHALL be null if its own read fails. The page read SHALL still succeed with the rest, so a failed part never marks
a render as degraded.

#### Scenario: A failed news read leaves the profile whole

- **WHEN** a profile's page read loads and its news read throws
- **THEN** the response is a 200 that holds the profile and a null news page, and the render responds 200 and never a
  503

### Requirement: A visitor's page read is served from one copy per page

A page read with no session SHALL be served from one copy per page in the Redis store's read-through cache: for 60
seconds a profile, a team page, the home, and a Dashboard page, and for 30 seconds a topic page, a podcast episode page,
and a Topic Post page. The copy SHALL hold the head with the page, so a warm read sends no query. While Redis is
unreachable each read SHALL build its own.

#### Scenario: A warm read costs no query

- **WHEN** two visitors' renders read one public topic's page read inside 30 seconds
- **THEN** the second read sends no query, the head's included

#### Scenario: A profile is built once a minute

- **WHEN** a thousand visitors open one profile inside a minute across two replicas
- **THEN** the profile is built only by the reads that found no copy, never once per visitor

#### Scenario: Redis down builds each read

- **WHEN** Redis is unreachable and a visitor reads a page read
- **THEN** the read is built from the database and returned, and nothing is stored

### Requirement: A Topic's visitor copies are cleared together

One clear by Topic SHALL delete the visitor copies of the Topic's page, of each of its podcast episode pages and Topic
Post pages, of its owner's profile, and of each team page that holds the Topic. Every write that drops a Topic's page
copy SHALL go through it. The copies' keys and that clear SHALL live in the database package, because the pipeline
clears them and a package never imports an app.

#### Scenario: A Topic made private leaves every copy

- **WHEN** an owner makes a public Topic private
- **THEN** the next visitor read of its page, of its podcast episode pages, and of its Topic Post pages is answered from
  the database as a Topic the visitor may not open, and its owner's profile and its teams' pages are built fresh without
  it

#### Scenario: A Topic edit reaches the owner's profile

- **WHEN** an owner renames a public Topic and a visitor then opens the owner's profile
- **THEN** the profile is built fresh and shows the new name, with no wait for the copy's 60 seconds

### Requirement: The pipeline's writes clear the pages that show them

The clear by Topic SHALL run, beside the Topic's own edits, at a podcast episode's publish and removal, a film's ready
swap and a re-render's swap, an image render, a Topic Post's publish, edit, and delete, a body image taken down by an
admin, a Topic Post's summary, and a Topic Post Discussion's publish or failure. Each clear in the pipeline SHALL run
inside the activity that makes the write, so no workflow changes for it.

#### Scenario: A film's swap shows at once

- **WHEN** a film becomes ready, or a re-render swaps its files
- **THEN** the next visitor read of the podcast episode's page and of its Topic's page is built fresh and holds the film

#### Scenario: A new podcast episode reaches the visitor's topic page

- **WHEN** a Topic's podcast episode publishes
- **THEN** the next visitor read of the topic page holds it, with no wait for the copy's 30 seconds

#### Scenario: A body image taken down leaves the visitor's page

- **WHEN** an admin removes a reported body image from a Topic Post
- **THEN** the next visitor read of that Topic Post's page is built fresh, without the image

#### Scenario: A discussion's publish reaches the visitor's page

- **WHEN** a Topic Post Discussion publishes or fails
- **THEN** the next visitor read of the Topic Post's page is built fresh and holds the discussion's new state

### Requirement: A profile's and a team's own writes clear their own copy

A username change, an avatar change, and a profile pin change SHALL clear that profile's visitor copy. A team's edit,
its avatar change, and a membership change SHALL clear that team page's copy, and a membership change SHALL clear the
member's profile copy too, because a profile lists the person's teams.

#### Scenario: A new username shows to the next visitor

- **WHEN** a person changes their username and a visitor then opens their profile
- **THEN** the profile is built fresh and shows the new name

#### Scenario: A new member shows on both pages

- **WHEN** a leader admits a member whose membership is shown to a public team
- **THEN** the next visitor read of the team's page lists the member, and the next visitor read of the member's profile
  lists the team

### Requirement: Counts ride a copy's lifetime

A follow, a reaction, a Scan's kept and seen counts, and a Visitors count SHALL clear no copy. A visitor's page MAY show
each of them up to the copy's lifetime late.

#### Scenario: A follower count lags a minute at most

- **WHEN** a user follows a Topic and a visitor opens its owner's profile inside the copy's lifetime
- **THEN** the profile MAY show the earlier follower count, and shows the new one once the copy ends

### Requirement: A signed-in reader gets the shared payload and a part of their own

A signed-in reader of a public subject who is not its owner, an editor, or an admin SHALL get the visitor's shared
payload and a `viewer` part that is read for them and never cached: their reactions, bookmarks, ratings, listens, user
blocks, and permissions. The shared payload SHALL be the same for every reader, and nothing of one reader's state SHALL
enter it. What a reader's user block hides SHALL be taken out of the shared payload on that reader's page.

#### Scenario: Two readers share one payload

- **WHEN** two signed-in users who hold no role on a public Topic read one of its Topic Posts inside the copy's lifetime
- **THEN** both get the same shared payload from one build, and each `viewer` part holds that reader's own reaction
  alone

#### Scenario: A blocked author leaves the reader's page

- **WHEN** a reader in a user block with a Comment's author reads a page whose shared payload holds that Comment
- **THEN** the reader's page shows no Comment by that author, and every other reader's page still shows it

#### Scenario: A reader's part is never stored

- **WHEN** a signed-in reader's page read returns
- **THEN** the `viewer` part was read from the database for that request, and no copy holds it

### Requirement: An owner, an editor, an admin, and a reader of a subject that is not public read the page fresh

The page's owner, an editor, an admin, and any reader of a subject that is not public SHALL get the whole page read from
the database, never from a copy, behind one session read, one access check, and one request memo. The person who made a
change SHALL see it on their next read.

#### Scenario: An owner's edit shows on the owner's next read

- **WHEN** a Topic's owner saves an edit and the page reads again
- **THEN** the page read is built from the database and shows the edit

#### Scenario: A private Topic's page is never copied

- **WHEN** a member reads the page read of a private Topic
- **THEN** it is read from the database, and no copy of it is stored

#### Scenario: One session read and one role read

- **WHEN** an editor of a team's Topic reads its page read
- **THEN** the request reads the session once and the reader's role on the Topic once

### Requirement: A view, a play, and a response a session shaped are never cached

A view count's `POST`, a podcast episode's audio and film routes, and any response that a session or a bearer token
shaped SHALL never be stored in a visitor copy or sent with a shared edge lifetime. A visitor copy SHALL be filled only
by a load with no user.

#### Scenario: A cached page still counts its view

- **WHEN** a visitor opens a public topic page whose page read is served from its copy
- **THEN** the page still sends its view request after it loads, and the Topic's views rise by one

#### Scenario: A play is counted at each start

- **WHEN** two listeners each start one podcast episode's audio inside a minute
- **THEN** both requests reach the audio route, and each counts its play

#### Scenario: A session-shaped read stores nothing

- **WHEN** a request with a session cookie or an `Authorization` header reads a page read
- **THEN** nothing it returns is stored in a visitor copy, and the response is sent with `Cache-Control: private,
  no-cache`

### Requirement: The released routes stay beside the page reads

Every route that a released contract snapshot names SHALL stay beside the page reads with its path, its request, and
every field it returns, and SHALL read through the same grouped loaders as the page reads. No field that an MCP tool
returns SHALL be removed or changed. The six page head routes, which no snapshot names, SHALL be removed once the web
reads the page reads.

#### Scenario: A released app reads its routes as before

- **WHEN** an app built against `contracts/0.1.0.json` reads `GET /api/profiles/:userId` and the profile's news
- **THEN** both respond as that snapshot describes, and the contract freeze check passes

#### Scenario: An MCP tool returns what it returned

- **WHEN** `read_profile`, `read_team`, or `read_topic_post` is called
- **THEN** its result holds every field it held before the page reads, read through the grouped loaders

#### Scenario: The head routes are gone

- **WHEN** the web's loaders read the page reads
- **THEN** no page head route is served, and no client function for one remains

#### Scenario: The next app build reads the page reads

- **WHEN** the mobile app's next build opens a profile, and a build released before it opens the same profile
- **THEN** the next build reads the profile's page read, and the earlier build reads the released routes and shows what
  it showed

### Requirement: Each page read has a query budget, a request budget, and a bound on its widest stage

A visitor's cold page read SHALL send at most its page's query budget, counted on a fixture that returns a row to every
branch of the read, and a warm one SHALL send none. Each page's server render SHALL send one api request. The statements
a page read has in progress at once SHALL stay under a bound that the same test holds, so one page read never takes most
of a replica's connection pool.

#### Scenario: The profile, the team page, and the home

- **WHEN** the budget test reads each cold as a visitor
- **THEN** the profile sends at most 25 statements, or 17 without its news, the team page 17, and the home 9

#### Scenario: The topic, the podcast episode, and the Topic Post pages

- **WHEN** the budget test reads each cold as a visitor
- **THEN** the topic page sends at most 18 statements, or 25 with related rows and a comment thread, the podcast episode
  page 14, or 20 with them, and the Topic Post page 5, or 8 with comments

#### Scenario: A Dashboard page

- **WHEN** the budget test reads a Dashboard's page read cold as a visitor
- **THEN** it sends at most 2 statements, or 4 if the Dashboard has no share image

#### Scenario: A signed-in home

- **WHEN** the budget test reads the home as a signed-in user
- **THEN** it sends at most 15 statements, or 23 with the first page of the user's news

#### Scenario: A new query or request fails the test

- **WHEN** a change adds a statement to a page read past its budget, or a second api request to a page's render
- **THEN** that page's budget test fails

#### Scenario: A wide stage fails the test

- **WHEN** a change starts more statements at once in a page read than its bound allows
- **THEN** that page's budget test fails
