## RENAMED Requirements
- FROM: `### Requirement: Transport is a Postgres log, an SSE cursor, and LISTEN/NOTIFY fan-out`
- TO: `### Requirement: Transport is a Postgres log, an SSE cursor, and Redis pub/sub fan-out`

## MODIFIED Requirements

### Requirement: Transport is a Postgres log, an SSE cursor, and Redis pub/sub fan-out

The room SHALL be a Postgres message log whose ids are ordered, streamed to members over SSE with a cursor on the message id, fanned out across instances over Redis pub/sub through the Redis store's subscriber connection. No websocket service, no edge state product, and no connection outside the connection pooler. A stored message SHALL be published whole, its ids with whatever a Topic Tool left in that chat turn, since a Redis message has no size limit a chat turn could reach, so a tool call's toasts and proposed edit are never dropped for size. The instance that stored a message SHALL deliver it to its own subscribers directly, before publishing, and SHALL skip the echo of its own publish by the instance id the payload names, so its delivery never depends on the publish or on its own subscriber connection being up. Other instances receive the publish. Nothing published while an instance was disconnected is replayed: a reconnect SHALL resume from the cursor instead of replaying the room, and each stream on an instance loads everything past its cursor when the next message arrives. A load SHALL also take a cursor for the page above the
one held, so a room longer than one page can be read backward. Reaching the top of the list SHALL load
that page, and prepending it SHALL leave the reader on the message they were reading. Message text SHALL be encrypted at the application layer like the solo transcript.

Messages record an author, and the author's username SHALL be included in the content sent to the model — the role field alone cannot tell Carl who asked what. Carl's turns SHALL take a per-room advisory lock around the transcript read and the summary roll only, released before the model call, so no pooled connection or lock is held for a completion's whole runtime. Two overlapping mentions may therefore both answer the pre-reply transcript — a weaker serialization the room accepts in exchange for freeing the pool.

#### Scenario: A reconnect misses nothing and replays nothing

- **WHEN** a member's stream drops and reconnects with its cursor
- **THEN** they receive exactly the messages after the cursor

#### Scenario: A message posted on one instance reaches a stream on another

- **WHEN** the api runs as two instances and a member posts through one while another member's stream is held by the other
- **THEN** the second member's stream receives the message, with the tool calls the chat turn left

#### Scenario: The storing instance delivers without the publish

- **WHEN** Redis is unreachable and a member posts a message
- **THEN** the message is stored and every stream on that instance receives it once, and streams on other instances catch up from their cursor when they next reconnect

#### Scenario: An instance skips its own echo

- **WHEN** a member posts through an instance whose subscriber connection is up
- **THEN** that instance's streams receive the message once, from the local delivery and not again from the publish it receives back

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

## ADDED Requirements

### Requirement: The mention count is served from a short-lived cache that opening a room clears

The unseen mention count route SHALL serve its count from the Redis store's read-through cache, keyed by the user, for ten seconds, since the badge polls every forty-five seconds and a poll reads a count at most ten seconds old. Saving a room's mentions as seen SHALL delete the user's cached count, so opening a room clears every badge at once. While Redis is unreachable the count SHALL be read from Postgres on every poll.

#### Scenario: Two tabs share one count

- **WHEN** a user's two tabs poll the mention count inside ten seconds
- **THEN** the count is read from Postgres once and both tabs receive it

#### Scenario: Opening a room clears the count at once

- **WHEN** a user opens a room holding their unseen mentions and their next poll runs within ten seconds
- **THEN** the poll returns the count without those mentions, since saving them as seen deleted the cached count

#### Scenario: A mention arrives while the count is cached

- **WHEN** a mention arrives nine seconds after a user's count was cached
- **THEN** their next poll, at most forty-five seconds later, includes it
