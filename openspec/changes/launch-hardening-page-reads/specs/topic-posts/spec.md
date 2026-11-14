## MODIFIED Requirements

### Requirement: The Topic page shows its Topic Posts below its comment thread

The Topic page and the mobile Topic screen SHALL show a collapsible section titled "Open Mic" right below the Topic's
comment thread, holding the Topic's published Topic Posts as cards, newest first, six a page, under the count of all of
them. The server SHALL page the section on the web: the server's HTML SHALL hold its first page of six, and its page
buttons SHALL be links that show without JavaScript, so a reader without JavaScript still reaches every card. An author
SHALL see their own drafts first, each marked Draft. A user who may publish SHALL see the button that starts a draft.
The button and the cards SHALL sit inside one card, as the comment thread's do, and the page buttons SHALL sit under
that card, as the scan history's do. The section SHALL be absent for a reader who may not publish if it has no card.

#### Scenario: A visitor sees the section on a public Topic

- **WHEN** a visitor opens a public Topic that has two Topic Posts
- **THEN** the section shows both cards below the comment thread, newest first, and no button

#### Scenario: An empty section is absent for a follower

- **WHEN** a follower opens a Topic with no Topic Post
- **THEN** the page shows no Open Mic section

#### Scenario: An author sees their draft

- **WHEN** an author with one draft opens the Topic
- **THEN** the section shows the draft's card first, marked Draft, and nobody else's read holds it

#### Scenario: The page buttons sit under the card

- **WHEN** a visitor opens a Topic with seven Topic Posts
- **THEN** six cards show inside the section's card, and the page buttons sit under it

#### Scenario: A reader without JavaScript reaches the seventh post

- **WHEN** a browser without JavaScript opens a public Topic with seven Topic Posts
- **THEN** the HTML holds six cards, a count of seven, and a link to the section's second page, which holds the seventh
  card

## ADDED Requirements

### Requirement: The Topic Post page arrives in one page read

`GET /api/topic-posts/:id/page` SHALL return the Topic Post page's head with the page: the post with its body, its
discussion, and the first page of its comment thread. A visitor's read of a public Topic's post SHALL be served from
that post's 30-second copy, one copy a post, as the page-reads capability states. `GET /api/topic-posts/:id` SHALL stay
as it is.

#### Scenario: A Topic Post render is one request

- **WHEN** the server renders a public Topic's Topic Post page
- **THEN** its loader sends the page read alone, where it sent the head and the post as two, and the HTML holds the body
  and the first page of the thread

#### Scenario: The post row is read once

- **WHEN** a visitor's cold page read loads a Topic Post
- **THEN** the post's row with its body is read once, and the head, the body, and the body's images all come from it

#### Scenario: An edit reaches the next visitor

- **WHEN** an author saves an edit of a published Topic Post, or an edit that takes an image out of its body
- **THEN** the post's copy is cleared, and the next visitor's page read holds the edited body

#### Scenario: A draft is never copied

- **WHEN** an author reads the page read of their own draft
- **THEN** it is read from the database for the author alone, and no copy of it is stored

### Requirement: A list of Topic Posts pages on the server if the request asks

A read of a Topic's, a person's, or a team's Topic Posts that asks for pages SHALL get the first page of six cards and
the count of all of them, and each later page SHALL be requested from the server. A read that does not ask SHALL get the
whole list as before, so a released app, an MCP tool, and a stored MCP view show what they showed. The web SHALL ask. No
list read SHALL hold a post's body.

#### Scenario: A Topic's page read holds one page of posts

- **GIVEN** a Topic with 30 published Topic Posts
- **WHEN** the web reads the Topic's page
- **THEN** the payload holds six Topic Post cards and a count of 30, and the section's title counts 30

#### Scenario: A profile's Featured Posts keeps its whole count

- **WHEN** the web reads the profile of a person with fourteen published Topic Posts
- **THEN** Featured Posts holds the first six cards, pinned ones first, reads "14 posts", and requests each later page
  from the server

#### Scenario: A released app still gets every post

- **WHEN** a read that does not ask for pages lists a Topic's Topic Posts
- **THEN** it holds every card, and none holds a body

### Requirement: A Topic Post's counts read and view count read no body

The Topic Post counts read and the Topic Post view count SHALL check access through a read of the post's access columns
alone, and SHALL NOT select the post's body.

#### Scenario: A long post's view reads no body

- **WHEN** a visitor's view of a Topic Post with a 500 KiB body is counted, and its counts are read
- **THEN** neither request selects the body, and a post the caller may not read still counts no view and returns no
  counts
