## RENAMED Requirements

- FROM: `### Requirement: The mentioner pays, checked before the completion, refused in private`
- TO: `### Requirement: The mentioner pays, checked before the completion, rejected in private`

## MODIFIED Requirements

### Requirement: One mention parser, two outcomes

Typing @ in the composer SHALL open an autocomplete listing Carl pinned first and then the room's current team members by username — never the user typing, never a departed member. @all is a reserved username addressing the whole room: every member gets a mention notification and Carl answers. One parser SHALL produce every mention span; the outcomes differ only by target. A member mention writes a notification row and nothing else — no completion, no cost, no chat turn row. A reply to a member's message writes the same row for its author. The rows show as a mention badge: a highlight-color count on the topic name's top-right corner in the topic tables — the owner's Profile and Activity tables and a team page's topic table — whose tooltip says how many chats wait and lists who mentioned or replied to the member with each message's opening, and whose link opens the topic with the newest mention's room preselected and the panel still closed. The badge repeats on the topic page's title, where its click opens that room in place, and on the closed panel's chat pill with the same tooltip. Opening the room's panel — from its pill, the title badge, or a row in the menu, never by following a table link — marks the member's rows seen, which clears every badge for that room at once; loading the transcript alone does not. A Carl mention starts a billed completion. The parser SHALL not fire inside longer tokens — an email address is not a mention.

The panel's own menu rows and the total beside its "…" SHALL badge from that same source rather
than from the room list the panel fetched, so opening a room clears its row at once instead of at
the next poll, and the total is counted the same way on every panel that draws the title bar.

Every badge in the app SHALL read from one source instead of from the payload of the page it sits
on, so a topic link, a team link, the teams index title, the header menu's Teams row, the phone's
hamburger, each room's row in the panel's menu, and the chat pill never disagree. That source
SHALL refresh by polling a count of the user's unseen mention rows, and SHALL re-read the room
list only when that count changes, since the count is one indexed query and the list is several.
The poll interval SHALL keep a badge no more than a minute stale.

Streaming SHALL NOT be used for badges. The room stream is per room and runs only while that room
is open, so it says nothing about the rooms the user is not reading, which is exactly what a badge
is for. A panel closed to its pill SHALL hold no stream open at all, so the chat riding on every
page costs no idle connection.

#### Scenario: A badge appears without the page that shows it fetching anything

- **WHEN** a mention arrives in a room the user is not reading, and their panel is closed
- **THEN** no stream is open for that room, the next count poll notices the change within a minute, the room list is re-read once, and every badge for that room appears together

#### Scenario: A member mention notifies and costs nothing

- **WHEN** a message mentions a team member
- **THEN** a mention row is written for that member, their topic tables badge the topic, and no completion, cost, or chat turn row exists

#### Scenario: Reading the room clears the badge

- **WHEN** the mentioned member opens that room's chat
- **THEN** their unseen mention rows are marked seen and the badge leaves their topic tables

#### Scenario: An email address is not a mention

- **WHEN** a message contains carl@example.com
- **THEN** no mention is parsed and Carl stays silent

#### Scenario: The autocomplete knows the members

- **WHEN** a member types @ in the composer
- **THEN** the list shows Carl first, then current team members only

### Requirement: The mentioner pays, checked before the completion, rejected in private

A Carl completion SHALL be billed to the person who mentioned him — never the Topic creator and never the Team, which holds no wallet. The mentioner's budget SHALL be checked before the completion starts, not after it returns. If the budget is empty, Carl's rejection SHALL be delivered privately to the mentioner and never posted to the room.

Each completion SHALL write exactly one chat turn row, the same spend row a private chat turn writes, naming the mentioner, the Topic, the room message it answered, tokens, and cost, so the monthly budget, the spend meter, and any later per-team spend view all read one table.

#### Scenario: The budget gate runs first

- **WHEN** a mentioner's monthly budget is spent
- **THEN** no completion starts, no chat turn row is written, and the rejection reaches only the mentioner

#### Scenario: One completion, one chat turn row

- **WHEN** Carl completes in the room
- **THEN** exactly one chat turn row exists for it, attributed to the mentioner and referencing the room message

### Requirement: The team page has the team's own room

Each Team SHALL have one room of its own on its team page, docked bottom-right for members, stored
as a room with no topic and reached at `/teams/:id/room` with the same transcript, stream, post,
mentions-seen, leader-only clear, and shared-file routes a topic's room has. Membership alone opens
it. Carl's turn in it SHALL read across every topic the team holds — each topic's name and prompt,
their findings labeled by topic, their sources, and their scan notes — through its own prompt
template, and the turn bills its poster with the team named on the chat turn row so team spend counts
it. Unseen mentions in it SHALL badge the team's name on the teams index, linking to the team page
with the panel still closed, and repeat on the team page's title, whose click opens the room in
place, and on the panel's pill. Opening the room — from its pill or the title badge — is what
clears every badge for it at once; an index link never opens it.

#### Scenario: Carl answers from the whole topic set

- **WHEN** a member addresses Carl in the team's own room
- **THEN** his reply is written from every held topic's material with findings labeled by topic, and the turn's chat turn row names the team

#### Scenario: The badge leads to the team page

- **WHEN** a member is mentioned in the team's own room and visits their teams index
- **THEN** the team's name shows the mention badge, its link opens the team page with the panel closed and the badge on the title and the pill, and opening the room from its pill or the title badge clears every badge for it

#### Scenario: An outsider has no team room

- **WHEN** anyone who is not an active member calls the team room's routes
- **THEN** every one of them answers 404
