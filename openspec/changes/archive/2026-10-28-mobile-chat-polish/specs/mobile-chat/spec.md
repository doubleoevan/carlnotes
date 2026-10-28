## ADDED Requirements

### Requirement: Waiting for Carl uses the shared thinking lines

Mobile SHALL show the web's random “Carl is …” lines inside Carl's waiting bubble. One line SHALL remain stable while that bubble is mounted. A subtle shimmer SHALL run through native animation, stop when inactive or unmounted, and remain static with Reduce Motion enabled. Text SHALL wrap and scale without clipping or duplicate accessibility announcements.

#### Scenario: Carl begins answering
- **WHEN** a reply is pending before its first answer text
- **THEN** the bubble shows a line drawn from the same phrases and selection rules as web
- **AND** rerenders do not replace the line
- **AND** the waiting bubble leaves when the answer arrives or the request stops

#### Scenario: Motion is unwanted or invisible
- **WHEN** Reduce Motion is enabled or the app becomes inactive
- **THEN** no shimmer animation runs
- **AND** the line remains readable if the bubble is still visible

## MODIFIED Requirements

### Requirement: Rooms support mentions and replies

Typing an eligible @ mention SHALL offer Carl and the room's members using the web's matching rules. Selecting a suggestion SHALL insert the mention without losing surrounding text. Mobile SHALL support replying to a message, showing its quoted context, selecting the web's reply targets, and clearing a reply target through the selector without an extra × control.

#### Scenario: A mention is selected in the middle of text
- **WHEN** the person chooses a member suggestion
- **THEN** the selected mention replaces only the active mention query
- **AND** the remaining composer text is preserved

#### Scenario: A message is a reply
- **WHEN** a person selects Reply on a room message
- **THEN** the composer shows the selected target and can cancel it
- **AND** the posted message retains the parent reference and readable quoted context

#### Scenario: A person returns to everyone
- **WHEN** the person chooses “Replying to @all” after selecting a message to reply to
- **THEN** the message reply is cleared and the draft body is preserved
- **AND** sending addresses everyone without a parent-message reference

#### Scenario: The reply target disappears
- **WHEN** a selected parent message is deleted or the person switches rooms
- **THEN** a stale reply selection cannot be sent to the new room

### Requirement: Room deletion and clearing preserve permissions

Mobile SHALL permit people to delete their own room messages and preserve the web's existing leader/admin moderation controls. Individual-message deletion and clearing the room SHALL require confirmation. Local state SHALL change only after the server accepts the operation; rejected actions SHALL leave history intact.

#### Scenario: A person deletes their own message
- **WHEN** the person chooses Delete on a message they are allowed to delete
- **THEN** a confirmation explains that the message and its attachments will be removed for everyone in the chat
- **AND** only confirming calls the existing delete API and accepted deletion refreshes the room

#### Scenario: Deletion is cancelled
- **WHEN** the person cancels or dismisses the confirmation
- **THEN** no deletion request is sent and the message remains

#### Scenario: An ordinary member views someone else's message
- **WHEN** the member lacks the web's moderation permission
- **THEN** controls for deleting that message or clearing the room are unavailable

#### Scenario: A moderator clears a room
- **WHEN** an authorized leader or administrator confirms clearing
- **THEN** the room clears only after server acceptance
- **AND** a rejected clear preserves the visible history
