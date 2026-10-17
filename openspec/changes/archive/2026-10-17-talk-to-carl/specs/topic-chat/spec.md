## MODIFIED Requirements

### Requirement: Chat access reuses the Topic view rule for signed-in users
A signed-in user SHALL be permitted to chat about a Topic exactly when they are permitted to view it, resolved through
the existing authorization gate, with no second access rule introduced for chat. A signed-out visitor SHALL NOT be able
to send a turn: the api SHALL reject an anonymous turn outright, so no anonymous request ever spends against a model.

The transcription and speech routes SHALL ask the same gate for the page they name, so a user may talk to Carl exactly
where they may chat. The spoken events route SHALL ask the page's access alone, with no spend check. An anonymous
request to any of the voice routes SHALL be rejected outright.

#### Scenario: A subscriber chats about an invite Topic
- **WHEN** a signed-in user with an active subscription to an invite Topic sends a chat turn
- **THEN** the turn is allowed

#### Scenario: A stranger is rejected on a private Topic
- **WHEN** a user who cannot view a private Topic sends a chat turn about it
- **THEN** the turn is rejected

#### Scenario: An anonymous turn is rejected by the api
- **WHEN** a signed-out caller posts a chat turn directly to the api
- **THEN** it is rejected as needing sign-up and no retrieval or generation runs

#### Scenario: A stranger's recording is rejected
- **WHEN** a signed-in user who may not view a private Topic posts a recording for it
- **THEN** the route rejects it as the chat turn would, and no model is called

### Requirement: Each turn is metered against the account's monthly spend budget
A turn's estimated cost SHALL be checked against the user's remaining monthly spend budget before generation, drawing
from the same per-account pool manual-scan overage draws from. A turn that would exceed the remaining budget SHALL be
rejected with an upgrade prompt and SHALL NOT be billed. Every private chat SHALL count that rejection as a
`chat_budget_reached` event: a Topic's chat, a Team's chat, and the new-topic chat. A completed turn's cost SHALL be
recorded beside its token total, using the same best-effort token-cost tally a scan's review uses.

A transcription and each spoken part of a reply SHALL be recorded as their own chat spend rows, with no text, so they
draw from the same pool and count toward it. A spent budget SHALL reject a recording and a spoken part with the same
upgrade prompt, before any model is called.

#### Scenario: A turn within budget proceeds and records its cost
- **WHEN** a user with remaining monthly budget sends a chat turn
- **THEN** the reply is generated, and the turn's estimated cost and its token total are recorded against that user

#### Scenario: A turn over budget is blocked, not billed
- **WHEN** a user's remaining monthly budget cannot cover an estimated turn
- **THEN** the turn is rejected with an upgrade prompt, no generation runs, no cost is recorded, and one
  `chat_budget_reached` event is counted for that user

#### Scenario: Every private chat counts a budget rejection
- **WHEN** a user whose monthly budget is spent sends a turn in a Team's chat or in the new-topic chat
- **THEN** the turn is rejected as a Topic chat turn would be, and one `chat_budget_reached` event is counted for that
  user

#### Scenario: Chat spend and scan spend share one pool
- **WHEN** a user's chat spend and scan spend together reach their effective monthly budget
- **THEN** both further chat turns and further manual Scans are blocked

#### Scenario: Voice spend counts as chat spend
- **WHEN** a user sends a spoken question and Carl's reply is spoken in two spoken parts
- **THEN** three chat spend rows are written beside the turn's own row, and the monthly spend sum includes them

### Requirement: Every signed-in conversation persists server-side
A signed-in reader's conversation with a Topic SHALL be kept server-side on every plan, surviving reloads, sign-outs,
and devices, and SHALL be resolved through the authorization gate rather than a plan comparison at any call site. A page
load SHALL replay the whole stored conversation in reading order, and the panel SHALL virtualize a long list so
scrolling the full history never mounts every exchange at once. Plans SHALL differentiate on budgets, scans, and topics
— the cost drivers — not on chat memory.

A stored turn SHALL keep whether its question was spoken, and the replay SHALL carry it, so a reload and another device
still read the turn as spoken. The replay SHALL read only the rows with question and answer text, so a voice spend row
never becomes an exchange.

#### Scenario: A conversation survives across visits
- **WHEN** any signed-in user returns to a Topic page they have chatted about
- **THEN** the prior turns are shown from the server's record, on any device

#### Scenario: A page load replays the whole conversation
- **WHEN** a conversation has grown long
- **THEN** the page load carries every stored turn in reading order, and the panel scrolls the full history through a
  virtualized list

#### Scenario: Persistence is asked of the gate
- **WHEN** the system decides whether to store a turn's text
- **THEN** it asks the authorization gate for the persistence capability and performs no plan or tier comparison of its
  own

#### Scenario: A spoken turn replays spoken
- **WHEN** a conversation with one spoken turn reloads
- **THEN** the replay carries that turn as spoken and the others as not, and no message shows a mic icon

### Requirement: A signed-out chat post is rejected before its body is read

A post to a topic chat, a team chat, or the new-topic chat by a request with no session SHALL get a 401 with "sign up
required" before its body is read, and a post to a chat room by such a request SHALL get a 404, as a missing chat room
is, before its body is read, so an anonymous request never holds a chat body's attachments in memory. A signed-in post
SHALL then pass the route's own body limit and its authorization.

A post to the transcription route by a request with no session SHALL get the same 401 before its body is read, so an
anonymous request never holds a recording in memory.

#### Scenario: An anonymous post with large attachments

- **WHEN** a signed-out caller posts a chat turn with two megabytes of attachments
- **THEN** it gets a 401 at once, and its body is never read

#### Scenario: An anonymous chat room post

- **WHEN** a signed-out caller posts a chat room message with two megabytes of attachments
- **THEN** it gets a 404 at once, as a missing chat room is, and its body is never read

#### Scenario: An anonymous recording
- **WHEN** a request with no session posts a recording
- **THEN** it gets a 401 before the body is read
