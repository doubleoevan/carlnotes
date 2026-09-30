## MODIFIED Requirements

### Requirement: Updates fan out to connected clients over SSE

The system SHALL fan out note changes to connected SSE subscribers through an in-process broker keyed by note id. The instance that merged an update SHALL deliver the update bytes to its own subscribers directly, and SHALL publish a poke naming itself and the note over Redis pub/sub, received on the Redis store's one subscriber connection per process, so every other instance tells its subscribers to resync while the instance that published skips the echo of its own poke. The poke includes no update bytes: a Yjs update can be far larger than any message worth publishing, and the resync the client already performs on reconnect is the delivery path. A client applying a broadcast update SHALL converge to the same document as the writer. The SSE stream SHALL require view access. A failed publish SHALL NOT fail the update, since the local subscribers already have the bytes and other instances resync on the next poke or when the stream's age limit closes it.

#### Scenario: A collaborator sees an edit without reloading

- **WHEN** one user posts an update while another holds an open SSE connection to the same note
- **THEN** the second client receives the change over SSE and its document converges with the writer's

#### Scenario: An update posted on one instance reaches subscribers on another

- **WHEN** the api runs as more than one instance and an update is posted on one of them
- **THEN** subscribers connected to other instances are told to resync and converge, and subscribers on the posting instance receive the bytes and never a second resync for their own instance's poke

#### Scenario: A publish that fails loses no edit

- **WHEN** Redis is unreachable while a user posts an update
- **THEN** the update is merged and stored, subscribers on that instance receive the bytes, and subscribers on other instances converge on their next resync
