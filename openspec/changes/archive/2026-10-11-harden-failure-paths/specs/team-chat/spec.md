## MODIFIED Requirements

### Requirement: Transport is a Postgres log, an SSE cursor, and Redis pub/sub fan-out

The room SHALL be a Postgres message log whose ids are ordered, streamed to members over SSE with a cursor on the
message id, fanned out across instances over Redis pub/sub through the Redis store's subscriber connection. No websocket
service, no edge state product, and no connection outside the connection pooler. A stored message SHALL be published
whole, its ids with whatever a Topic Tool left in that chat turn, since a Redis message has no size limit a chat turn
could reach, so a tool call's toasts and proposed edit are never dropped for size. The instance that stored a message
SHALL deliver it to its own subscribers directly, before publishing, and SHALL skip the echo of its own publish by the
instance id the payload names, so its delivery never depends on the publish or on its own subscriber connection being
up. Other instances receive the publish. Nothing published while an instance was disconnected is replayed: a reconnect
SHALL resume from the cursor instead of replaying the room, and each stream on an instance loads everything past its
cursor when the next message arrives. Each time the instance's subscriber connection comes back after a drop, every open
stream on that instance SHALL load everything past its cursor once, through the Redis store's reconnect hook, so a
message published during the drop reaches the browser without waiting for the next message or the stream's own
reconnect. A load SHALL also take a cursor for the page above the one shown, so a room longer than one page can be read
backward. Reaching the top of the list SHALL load that page, and prepending it SHALL leave the reader on the message
they were reading. Message text SHALL be encrypted at the application layer like the solo transcript.

Messages record an author, and the author's username SHALL be included in the content sent to the model. The role
field alone cannot tell Carl who asked what. Carl's turns SHALL take a per-room advisory lock around the transcript read
and the summary roll only, released before the model call, so no pooled connection or lock stays open for a completion's
whole runtime. Two overlapping mentions may therefore both answer the pre-reply transcript, a weaker serialization
the room accepts in exchange for freeing the pool.

#### Scenario: A reconnect misses nothing and replays nothing

- **WHEN** a member's stream drops and reconnects with its cursor
- **THEN** they receive exactly the messages after the cursor

#### Scenario: A message posted on one instance reaches a stream on another

- **WHEN** the api runs as two instances and a member posts through one while another member's stream is open on the
  other
- **THEN** the second member's stream receives the message, with the tool calls the chat turn left

#### Scenario: The storing instance delivers without the publish

- **WHEN** Redis is unreachable and a member posts a message
- **THEN** the message is stored and every stream on that instance receives it once, and streams on other instances
  catch up from their cursor when they next reconnect

#### Scenario: An instance skips its own echo

- **WHEN** a member posts through an instance whose subscriber connection is up
- **THEN** that instance's streams receive the message once, from the local delivery and not again from the publish it
  receives back

#### Scenario: Concurrent mentions serialize their reads

- **WHEN** two members mention Carl at the same moment
- **THEN** each turn's transcript read and summary roll run one after the other under the room's lock, and both replies
  may answer the transcript as it stood before either reply posted

#### Scenario: Carl knows who asked

- **WHEN** two members ask different questions and the second mentions him
- **THEN** the content he receives names each message's author, and he answers the mentioner

#### Scenario: The top of a long room loads the page above it

- **WHEN** a reader scrolls to the top of a room holding more messages than one page
- **THEN** the page above is loaded and prepended, instead of the room ending there

#### Scenario: A prepend leaves the reader where they were

- **WHEN** an earlier page is prepended to the list
- **THEN** the reader stays on the message they were reading instead of being moved by the new rows

#### Scenario: A room with nothing above says so by stopping

- **WHEN** a reader reaches the top of a room whose first message is already loaded
- **THEN** no further page is requested

#### Scenario: A subscriber reconnect catches an open stream up once

- **WHEN** a message is stored on another instance while this instance's subscriber connection is down, and the
  connection comes back
- **THEN** every open stream on this instance receives that message exactly once, with no client reconnect
