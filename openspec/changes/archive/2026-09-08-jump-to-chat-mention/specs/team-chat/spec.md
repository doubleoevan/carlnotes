## MODIFIED Requirements

### Requirement: One panel rides every page and names every room

There SHALL be exactly one Coffee Talk panel, mounted in the app shell instead of on a page, so the
room it holds, its open state, and its size survive navigation. Its "…" menu SHALL list every room
the viewer may open — one per team they are on, one per topic those teams hold — each reading
"*name* chat" behind the avatar of the team the room belongs to, whose tooltip names that team, its
own mention badge, and a check on the room being read. The avatar SHALL be what tells apart two
rooms of one topic held by two of the viewer's teams, in place of naming the team in text. Picking a row switches to it and opens it. Picking a row that carries a mention badge SHALL
additionally load the earliest mention in that room the reader has not seen, instead of
its latest message, loading earlier pages until that message is loaded. Where the room runs out of
pages first, the reader SHALL be told the chat message is no longer in the room. Either way the room's
mentions SHALL be marked seen, so a badge always discharges.

A page SHALL be able to name the teams it is about, and the menu SHALL mark those teams' rooms and
their topics' rooms in the highlight color. A team page names itself; someone else's profile names
the teams the viewer shares with that person, which the Team Up rows already answer, so the mark
never reveals a team the viewer is not on. The viewer's own profile names nothing, since every team
there is already theirs.

Opening the panel — and only opening it — SHALL pick the closest match to the page. A Team's page
SHALL open that Team's own room, or the way into it. A Topic's page SHALL open that Topic's room
where the viewer is on a holding team, and their private chat about it where they are on none, ahead
of anything waiting elsewhere, since the Topic is what they came to read. A page that names teams
without being one SHALL open the busiest of those. Only a page about no conversation SHALL fall
through to the busiest room anywhere, and that fallback SHALL never reach a private chat, since no
private chat is about such a page. Where it runs, a Team's own room SHALL lead a Topic's unless the
page named the other order: the teams index leads with a Team's and a profile with a Topic's.
Busiest means the most unseen mentions, and a tie SHALL keep the earlier room, since the room list
already arrives latest first. A viewer on no team SHALL be offered the way to start a topic instead
of an empty menu.

The menu SHALL list its rooms in alphabetical order, with the private chat row ahead of all of them,
so a name is found where its spelling says it will be. The title bar SHALL name the conversation on
screen in a tooltip over "Coffee Talk", behind the same avatar its menu row shows, since the bar
itself never says which one is open.

#### Scenario: The panel keeps its room across pages

- **WHEN** a viewer opens a room and then navigates to another page
- **THEN** the same room is still open at the same size, and the new page does not remount the panel

#### Scenario: A profile marks the teams the viewer shares with that person

- **WHEN** a viewer opens the menu on someone else's profile
- **THEN** the rooms of the teams they are both on, and those teams' topics' rooms, are marked, and no team the viewer is not on appears

#### Scenario: A marked room with a mention opens before a busier one elsewhere

- **WHEN** a viewer opens the panel on a profile where a shared team has one unseen mention and an unmarked room has two
- **THEN** the shared team's room opens, and the unmarked room keeps its badge

#### Scenario: A team page marks its own room and its topics

- **WHEN** a viewer opens the menu on a team page
- **THEN** that team's own room and every topic it holds are marked, and the panel opened on the team's own room

#### Scenario: A mention badge opens the room at the mention

- **WHEN** a reader opens a room from a menu row carrying a mention badge
- **THEN** the room loads the earliest mention they have not seen, not the latest message

#### Scenario: One jump serves several mentions

- **WHEN** a room holds more than one unseen mention for the reader
- **THEN** the jump loads the earliest of them, so reading forward passes the rest in order

#### Scenario: A mention whose chat message is gone still clears

- **WHEN** the jump reaches the room's first chat message without finding the one the mention named
- **THEN** the reader is told it is no longer in the room, and the badge is cleared anyway

### Requirement: Transport is a Postgres log, an SSE cursor, and LISTEN/NOTIFY fan-out

The room SHALL be a Postgres message log whose ids are ordered, streamed to members over SSE with a cursor on the message id, fanned out across instances with LISTEN/NOTIFY on a dedicated non-pooled connection. No websocket service and no edge state product. A reconnect SHALL resume from the cursor instead of replaying the room. A load SHALL also take a cursor for the page above the
one held, so a room longer than one page can be read backward. Reaching the top of the list SHALL load
that page, and prepending it SHALL leave the reader on the message they were reading. Message text SHALL be encrypted at the application layer like the solo transcript.

Messages record an author, and the author's username SHALL be included in the content sent to the model — the role field alone cannot tell Carl who asked what. Carl's turns SHALL take a per-room advisory lock around the transcript read and the summary roll only, released before the model call, so no pooled connection or lock is held for a completion's whole runtime. Two overlapping mentions may therefore both answer the pre-reply transcript — a weaker serialization the room accepts in exchange for freeing the pool.

#### Scenario: A reconnect misses nothing and replays nothing

- **WHEN** a member's stream drops and reconnects with its cursor
- **THEN** they receive exactly the messages after the cursor

#### Scenario: Concurrent mentions serialize their reads

- **WHEN** two members mention Carl at the same moment
- **THEN** each turn's transcript read and summary roll run one after the other under the room's lock, and both replies may answer the transcript as it stood before either reply posted

#### Scenario: Carl knows who asked

- **WHEN** two members ask different questions and the second mentions him
- **THEN** the content he receives names each message's author, and he answers the mentioner

#### Scenario: The top of a long room loads the page above it

- **WHEN** a reader scrolls to the top of a room holding more messages than one page
- **THEN** the page above is loaded and prepended, instead of the room ending there

#### Scenario: A prepend leaves the reader where they were

- **WHEN** an earlier page is prepended to the list
- **THEN** the reader stays on the message they were reading rather than being moved by the new rows

#### Scenario: A room with nothing above says so by stopping

- **WHEN** a reader reaches the top of a room whose first message is already loaded
- **THEN** no further page is requested
