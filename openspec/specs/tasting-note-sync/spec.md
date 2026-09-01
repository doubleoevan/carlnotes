# tasting-note-sync Specification

## Purpose
TBD - created by archiving change add-napkins. Update Purpose after archive.
## Requirements
### Requirement: A snapshot endpoint serves the ydoc with state-vector diff support

The system SHALL serve a note's document over a GET endpoint as a Yjs update. When the request includes the client's state vector, the response SHALL be the diff against it instead of the full document, so a reconnecting client transfers only what it is missing. The endpoint SHALL require view access to the note and SHALL answer as missing (404) when the requesting user or visitor may not see it.

#### Scenario: First load gets the full document

- **WHEN** a user with view access requests a note snapshot with no state vector
- **THEN** the response is a Yjs update encoding the full document

#### Scenario: Reconnect gets only the diff

- **WHEN** a client reconnects and requests the snapshot with its current state vector
- **THEN** the response encodes only the changes the client does not already have

#### Scenario: No view access reads nothing

- **WHEN** someone without view access requests a note snapshot
- **THEN** the endpoint answers 404

### Requirement: Updates POST as base64 and merge under an advisory lock

Clients SHALL send local Yjs updates as base64 over a POST endpoint requiring edit access. The server SHALL merge each update into the stored document under a Postgres advisory lock keyed per note so concurrent writers never lose each other's changes, persist the merged document immediately, and regenerate the HTML after a short debounce so static readers and crawlers see saved content without loading any editor code.

#### Scenario: Concurrent edits both survive

- **WHEN** two users with edit access post overlapping updates to the same note at the same time
- **THEN** both updates are merged into the stored document and neither is lost

#### Scenario: A write without edit access is refused

- **WHEN** someone without edit access posts an update
- **THEN** the server refuses it and the stored document is unchanged

#### Scenario: A save refreshes the stored HTML

- **WHEN** an update is persisted
- **THEN** the stored HTML is regenerated from the merged document

### Requirement: Updates fan out to connected clients over SSE

The system SHALL fan out note changes to connected SSE subscribers through an in-process broker keyed by note id, reusing the chat module's broker pattern (including its cross-instance notification path) instead of introducing new infrastructure. A client applying a broadcast update SHALL converge to the same document as the writer. The SSE stream SHALL require view access.

#### Scenario: A collaborator sees an edit without reloading

- **WHEN** one user posts an update while another holds an open SSE connection to the same note
- **THEN** the second client receives the change over SSE and its document converges with the writer's

#### Scenario: An update posted on one instance reaches subscribers on another

- **WHEN** the api runs as more than one instance and an update is posted on one of them
- **THEN** subscribers connected to other instances still receive the change

### Requirement: The SSE lifecycle is bounded by the live state

An SSE connection SHALL exist only while a note's dialog is open live, which is to say open for a user with edit access: connect on opening it, disconnect on closing it or on component unmount, and pause while the document is hidden. A read-only open SHALL hold no connection. On reconnect the client SHALL resync via its state vector. The stream SHALL include a keepalive heartbeat matching the chat module's, and reconnects after the chat-style stream max age SHALL lose no data.

#### Scenario: Static notes hold no connections

- **WHEN** a page renders the note table with no dialog open
- **THEN** no SSE connection is open for any note

#### Scenario: Hiding the tab pauses the stream

- **WHEN** the document becomes hidden while a note is live
- **THEN** the client drops the SSE connection, and on becoming visible again reconnects and resyncs via its state vector

#### Scenario: A stream expiring mid-edit loses nothing

- **WHEN** the server ends a stream at its max age while a user is editing
- **THEN** the client reconnects, resyncs via its state vector, and the document converges with no lost edits

### Requirement: A minimal custom Yjs provider bridges the editor to SSE

The system SHALL provide a minimal Yjs provider — applying updates received over SSE, sending local updates over POST, and exposing stubbed awareness — sufficient to satisfy the editor's collaboration option. There SHALL be no presence and no live cursors in v1.

#### Scenario: The editor collaborates through the provider

- **WHEN** the editor opens for a user with edit access
- **THEN** it operates through the custom provider with no websocket connection, and no presence indicators or remote cursors render

