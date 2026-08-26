# team-chat Specification

## Purpose
TBD - created by archiving change add-teams. Update Purpose after archive.
## Requirements
### Requirement: A room exists exactly where a Team does

Every team holding a Topic — the owning team and every team it is shared into — SHALL have its own shared, persistent Coffee talk room on it, addressed by team: the routes are `/topics/:id/rooms/:teamId` for the transcript and posts and `/topics/:id/rooms/:teamId/events` for the stream. A Topic no team holds SHALL have no room, and creating one for it SHALL be rejected at the API. A public team Topic still has its rooms, because exposure comes from who can post, not who can read: a follower who is not a member of the addressed team SHALL receive 404 from the room's read, stream, and post routes alike. Both rules are enforced at the API, not by hiding controls.

The topic page SHALL show the rooms of the holding teams the viewer belongs to — `TopicResponse.roomTeams` names them — with a switcher when there is more than one. This capability adds no permission logic of its own: the teams capability's helper resolves who is in each room — members of the addressed holding team, and nobody through any other grant — and every room route consumes that answer.

Where a viewer is on none of the holding teams, the panel SHALL offer the way in instead of the conversation: the line "Join this team to start the conversation" over the same Join Team control the team page shows, with no transcript, no composer, and no stream opened. The refused read is what puts the panel in that shape, so the offer can never accompany a message. The team page SHALL offer it in place of its own room, and a Topic page SHALL offer it beside the viewer's private chat with Carl, which stays available and stays the panel they arrive on. Only a public owning team SHALL be offered this way, since naming a private team to an outsider is the leak the byline rule already forbids, and a Topic no team owns SHALL offer nothing.

#### Scenario: A follower is not in the room

- **WHEN** a follower of a public team Topic requests the room transcript, stream, or posts a message
- **THEN** every route answers 404

#### Scenario: No holding team, no room

- **WHEN** a room read or post targets a Topic no team holds
- **THEN** the API rejects it, whatever the user's relationship to the Topic

#### Scenario: Detachment closes that team's room

- **WHEN** a Topic is detached from one of its holding teams
- **THEN** that team's room stops answering while every other holding team's room stays open, and reattachment finds the transcript preserved

#### Scenario: An outsider is offered the way in, not the conversation

- **WHEN** someone on none of a Topic's holding teams opens the team chat, on the team page or beside their private chat on the Topic page
- **THEN** the panel shows "Join this team to start the conversation" over a Join Team button, the transcript read answers 404, no stream is opened, and no message is rendered

#### Scenario: A private owning team is never offered

- **WHEN** an outsider views a Topic whose owning team is private
- **THEN** no room is offered and the team is not named, leaving only the private chat with Carl

#### Scenario: A member of two holding teams switches rooms

- **WHEN** the viewer belongs to two teams that hold the Topic
- **THEN** the topic page names both rooms in `roomTeams`, the panel offers a switcher, and each room keeps its own transcript

### Requirement: Carl answers only when addressed

Carl reads every message and SHALL respond only to an @carl mention, the room-wide @all, or a reply to one of his own messages. He SHALL never answer a message aimed at one other person, so the bill tracks intent.

An unaddressed message defaults to @all: the composer prefixes it, every member is notified, and Carl answers. The composer's chip SHALL always name who the next message goes to — @all by default, the member whose reply the viewer is answering while that exchange is the newest message, or whoever the viewer picked from the chip's own picker — and the placeholder SHALL follow that target in the shape of "@all, penny for your thoughts…".

A reply is a real mechanism: a message MAY reference a prior message, and replying to one of Carl's messages continues the exchange without a fresh mention. A reply reaching past the message directly above it SHALL render a clipped quote of what it answers, and activating the quote scrolls to the original. The transcript Carl reads includes the same reply references, so a pronoun in a reply binds to its quoted message instead of to the newest lines.

#### Scenario: A mention wakes him

- **WHEN** a member posts a message mentioning @carl
- **THEN** Carl completes once, into the room

#### Scenario: A reply continues without a mention

- **WHEN** a member replies to one of Carl's messages with no mention in the text
- **THEN** Carl answers it as a continuation

#### Scenario: Everything else is read in silence

- **WHEN** members mention each other or reply to one another directly
- **THEN** Carl posts nothing

### Requirement: One mention parser, two outcomes

Typing @ in the composer SHALL open an autocomplete listing Carl pinned first and then the room's current team members by username — never the viewer, never a departed member. @all is a reserved username addressing the whole room: every member gets a mention notification and Carl answers. One parser SHALL produce every mention span; the outcomes differ only by target. A member mention writes a notification row and nothing else — no completion, no cost, no ledger row. A reply to a member's message writes the same row for its author. The rows surface as a mention badge: a highlight-color count on the topic name's top-right corner in the topic tables — the owner's Profile and Activity tables and a team page's topic table — whose tooltip says how many chats wait and lists who mentioned or replied to the member with each message's opening, and whose link opens the topic with the newest mention's room preselected and the panel still closed. The badge repeats on the topic page's title, where its click opens that room in place, and on the closed panel's Coffee Talk pill with the same tooltip. Opening the room's panel — from its pill, the title badge, or a row in the menu, never by following a table link — stamps the member's rows seen, which clears every badge for that room at once; loading the transcript alone does not. A Carl mention starts a billed completion. The parser SHALL not fire inside longer tokens — an email address is not a mention.

The panel's own menu rows and the total beside its "…" SHALL badge from that same source rather
than from the room list the panel fetched, so opening a room clears its row at once instead of at
the next poll, and the total is counted the same way on every panel that draws the title bar.

Every badge in the app SHALL read from one source instead of from the payload of the page it sits
on, so a topic link, a team link, the teams index title, the header menu's Teams row, the phone's
hamburger, each room's row in the panel's menu, and the Coffee Talk pill never disagree. That source
SHALL refresh by polling a count of the viewer's unseen mention rows, and SHALL re-read the room
list only when that count changes, since the count is one indexed query and the list is several.
The poll interval SHALL keep a badge no more than a minute stale.

Streaming SHALL NOT be used for badges. The room stream is per room and runs only while that room
is open, so it says nothing about the rooms the viewer is not reading, which is exactly what a badge
is for. A panel closed to its pill SHALL hold no stream open at all, so the chat riding on every
page costs no idle connection.

#### Scenario: A badge appears without the page that shows it fetching anything

- **WHEN** a mention arrives in a room the viewer is not reading, and their panel is closed
- **THEN** no stream is open for that room, the next count poll notices the change within a minute, the room list is re-read once, and every badge for that room appears together

#### Scenario: A member mention notifies and costs nothing

- **WHEN** a message mentions a team member
- **THEN** a mention row is written for that member, their topic tables badge the topic, and no completion, cost, or ledger row exists

#### Scenario: Reading the room clears the badge

- **WHEN** the mentioned member opens that room's chat
- **THEN** their unseen mention rows are stamped seen and the badge leaves their topic tables

#### Scenario: An email address is not a mention

- **WHEN** a message contains carl@example.com
- **THEN** no mention is parsed and Carl stays silent

#### Scenario: The autocomplete knows the members

- **WHEN** a member types @ in the composer
- **THEN** the list shows Carl first, then current team members only

### Requirement: The mentioner pays, checked before the completion, refused in private

A Carl completion SHALL be billed to the person who mentioned him — never the Topic creator and never the Team, which holds no wallet. The mentioner's budget SHALL be checked before the completion starts, not after it returns. When the budget is empty, Carl's refusal SHALL be delivered privately to the mentioner and never posted to the room.

Each completion SHALL write exactly one ledger row through the existing chat spend ledger, naming the mentioner, the Topic, the room message it answered, tokens, and cost, so the monthly budget, the spend meter, and any later per-team spend view all read one table.

#### Scenario: The budget gate runs first

- **WHEN** a mentioner's monthly budget is spent
- **THEN** no completion starts, no ledger row is written, and the refusal reaches only the mentioner

#### Scenario: One completion, one ledger row

- **WHEN** Carl completes in the room
- **THEN** exactly one ledger row exists for it, attributed to the mentioner and referencing the room message

### Requirement: Messages render phone-shaped, through one component, in a wider panel

Every message SHALL render with the author's avatar beside the bubble and their display name above it, in both the solo Coffee talk and the team room, never collapsed on consecutive messages from the same author — one component serves both rooms with no participant-count branching, and no bubble's author is ever inferred from position. Carl's avatar SHALL be the raccoon, the same art as the social avatar, bundled under the application source and imported by the component so the bundler hashes and caches it — never fetched per message or read from object storage. His display name is Carl.

The Coffee talk panel SHALL keep its docked width, with the expand toggle as the large-view control and the message column limited so a line of text stays in a comfortable reading range. A substantially wider docked panel was tried and rejected for covering too much of the page.

#### Scenario: Consecutive messages keep their author

- **WHEN** one member posts three messages in a row in either room
- **THEN** each shows the avatar and display name

#### Scenario: Carl's face is bundled

- **WHEN** Carl's messages render
- **THEN** his raccoon avatar loads as a hashed bundled asset with no per-message fetch

#### Scenario: Wide screens read comfortably

- **WHEN** the panel opens at a large viewport
- **THEN** the panel keeps its docked width with the expand toggle available, the message column stays limited, and small viewports render as before

### Requirement: Transport is a Postgres log, an SSE cursor, and LISTEN/NOTIFY fan-out

The room SHALL be a Postgres message log whose ids are ordered, streamed to members over SSE with a cursor on the message id, fanned out across instances with LISTEN/NOTIFY on a dedicated non-pooled connection. No websocket service and no edge state product. A reconnect SHALL resume from the cursor instead of replaying the room. Message text SHALL be encrypted at the application layer like the solo transcript.

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

### Requirement: Shared files belong to the room

A member MAY attach one file to a message — an image, a PDF, or text. The file belongs to the room: every member can download it, Carl reads it and may quote it for everyone, and each member may hold at most twenty shared files per room. Deletion belongs to the uploader and to any leader of the Team; deleting removes the file from Carl's future turns while his past answers stand. Downloads and deletion SHALL be gated by room membership at the API, never by the Topic's visibility. A member's privately kept chat material SHALL never enter a room turn, since the answer posts to everyone.

#### Scenario: A shared file reaches everyone and only them

- **WHEN** a member shares a file with a message
- **THEN** every member can download it and Carl can cite it, a non-member's download answers 404, and a plain member who neither uploaded it nor leads the Team cannot delete it

### Requirement: The context window is budgeted

A completion SHALL include the last thirty turns plus the Topic's retrieved Findings. Older turns SHALL roll into a running summary per room instead of growing the window forever, and individual message length SHALL be limited, because every participant's words are paid for by whoever mentions Carl next.

#### Scenario: An old room does not grow the bill

- **WHEN** a room passes thirty turns
- **THEN** a completion includes the last thirty plus the running summary, not the whole transcript

### Requirement: Membership changes preserve the transcript

A member removed from the Team SHALL lose room access on the next request. Messages they authored SHALL remain in place, attributed by the name recorded when each was posted, because deleting them would silently rewrite a conversation other people took part in. Closing their account later clears the account reference and keeps the recorded name, so the transcript still reads whole.

#### Scenario: Removal does not rewrite history

- **WHEN** a member is removed after posting in the room
- **THEN** their next room request answers 404 and every message they wrote still shows with their name

### Requirement: The transcript never tunes anything

The room transcript SHALL NOT feed scoring, reranking, or the Topic's context embedding that the relevance gate compares unscored Resources against. If a conversation should change how Carl scores a Topic, it does so only through an approved revision to the Topic's context document — that is the tuning path, and the room is not it.

#### Scenario: Talk does not move rank

- **WHEN** a room discusses Findings at any length
- **THEN** scores, feed order, retrieval, and the context embedding are exactly what they would be had the room stayed silent

### Requirement: One options menu switches the conversation and clears it

The Coffee Talk title bar SHALL hold one "…" options menu shared by the room panel and the private chat panel, and it renders only when it has a row to offer. Every room the viewer may open is a row in it, and on a Topic page their own private chat is one too, leading the list. Picking any row SHALL switch to that conversation and open it instead of collapsing to the pill, so switching back is picking the row for wherever they were. The menu's Clear chat row SHALL be the only way to clear a chat: on the private chat it clears the viewer's own conversation as before, and on the room it clears the whole team's conversation — the messages, their mention rows, the running summary, and the shared files with their stored objects. The room's Clear chat row SHALL be offered to a leader alone, and only while something exists to clear; the API SHALL reject anyone else's room clear like a missing room.

#### Scenario: A member switches to their private chat

- **WHEN** a member of a holding team opens the options menu on the room panel and picks Private chat
- **THEN** the panel becomes their own private conversation on the Topic, open, and the same menu still lists that team's room to switch back to

#### Scenario: A leader clears the room

- **WHEN** a leader picks Clear chat on the room panel and confirms the dialog that warns the whole team's conversation goes
- **THEN** the room's messages, mention rows, running summary, and shared files are deleted for every member, the transcript empties, and a toast reports the clear

#### Scenario: A member cannot clear the room

- **WHEN** a member without the leader role opens the room's options menu, or sends the room clear request directly
- **THEN** the menu offers no Clear chat row and the API answers 404

### Requirement: One panel rides every page and names every room

There SHALL be exactly one Coffee Talk panel, mounted in the app shell instead of on a page, so the
room it holds, its open state, and its size survive navigation. Its "…" menu SHALL list every room
the viewer may open — one per team they are on, one per topic those teams hold — each reading
"*name* chat" behind the avatar of the team the room belongs to, whose tooltip names that team, its
own mention badge, and a check on the room being read. The avatar SHALL be what tells apart two
rooms of one topic held by two of the viewer's teams, in place of naming the team in text. Picking a row switches to it and opens it.

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
already arrives newest first. A viewer on no team SHALL be offered the way to start a topic instead
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

### Requirement: The team page has the team's own room

Each Team SHALL have one room of its own on its team page, docked bottom-right for members, stored
as a room with no topic and reached at `/teams/:id/room` with the same transcript, stream, post,
mentions-seen, leader-only clear, and shared-file routes a topic's room has. Membership alone opens
it. Carl's turn in it SHALL read across every topic the team holds — each topic's name and prompt,
their findings labeled by topic, their sources, and their scan notes — through its own prompt
template, and the turn bills its poster with the team named on the ledger row so team spend counts
it. Unseen mentions in it SHALL badge the team's name on the teams index, linking to the team page
with the panel still closed, and repeat on the team page's title, whose click opens the room in
place, and on the panel's pill. Opening the room — from its pill or the title badge — is what
clears every badge for it at once; an index link never opens it.

#### Scenario: Carl answers from the whole topic set

- **WHEN** a member addresses Carl in the team's own room
- **THEN** his reply is written from every held topic's material with findings labeled by topic, and the turn's ledger row names the team

#### Scenario: The badge leads to the team page

- **WHEN** a member is mentioned in the team's own room and visits their teams index
- **THEN** the team's name shows the mention badge, its link opens the team page with the panel closed and the badge on the title and the pill, and opening the room from its pill or the title badge clears every badge for it

#### Scenario: An outsider has no team room

- **WHEN** anyone who is not an active member calls the team room's routes
- **THEN** every one of them answers 404

