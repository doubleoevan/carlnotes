## ADDED Requirements

### Requirement: A reply names a chat message in the same room

A reply SHALL name a chat message in the room it is posted to: a message of the same team, on the same Topic, or in the
team's own room if the room has no Topic. The post route SHALL answer a `replyToChatMessageId` outside the room the way
it answers a missing chat room, a 404, and store no message, so a reply can never quote, notify, or wake Carl through a
message from another room. Carl's transcript SHALL read the replied-to rows filtered by team as well as by Topic, so a
quoted line in his context always comes from the room he is answering in.

#### Scenario: A reply to a message in another room is rejected

- **WHEN** a member posts a message whose `replyToChatMessageId` names a chat message from another team's room on the
  same Topic, or from another Topic
- **THEN** the post responds 404 like a missing chat room, no message is stored, no notification row is written, and
  no chat turn starts

#### Scenario: A reply within the room posts

- **WHEN** a member replies to a chat message of the same team and Topic
- **THEN** the message posts with its reply reference

#### Scenario: Carl's quoted lines stay in the room

- **WHEN** a room turn's transcript is assembled and a message in its window replies to an id outside the room
- **THEN** the replied-to read returns only rows of the room's team and Topic, and that line carries no quote

### Requirement: The room stream parses its cursor and ends with a failed catch-up

The room stream SHALL parse the `after` query to a safe positive integer, and SHALL read it as zero if it is missing,
not a number, negative, or not an integer, so a malformed cursor replays from the start instead of comparing message
ids against `NaN`. If the catch-up read from the cursor throws, the stream SHALL clear its heartbeat and end, so no
timer keeps writing pings into a stream whose catch-up failed.

#### Scenario: A malformed cursor reads as zero

- **WHEN** a member opens the stream with `after=abc` or `after=-5`
- **THEN** the catch-up starts from zero and sends the room's messages

#### Scenario: A failed catch-up ends the stream and its heartbeat

- **WHEN** the catch-up read from the cursor throws
- **THEN** the heartbeat is cleared and the stream ends, with no ping written afterward

### Requirement: A shared file's key is pending before its upload

Storing a room attachment SHALL record the object's key as pending, with the upload grace period, before uploading the
bytes, and SHALL clear the pending row in the transaction that inserts the attachment row, as the topic attachment and
private chat attachment uploads do. A crash between the upload and the insert then leaves a pending key for the sweep
instead of an orphaned object.

#### Scenario: The key is pending before the bytes are stored

- **WHEN** a member shares a file and its upload begins
- **THEN** the key is recorded as pending before anything is written to object storage

#### Scenario: The row's transaction clears the key

- **WHEN** the attachment row is inserted
- **THEN** the pending row is cleared in the same transaction

#### Scenario: A crash between the upload and the insert leaves no orphan

- **WHEN** the api dies after storing the bytes and before inserting the row
- **THEN** the key is pending, and the sweep deletes the object after the grace period
