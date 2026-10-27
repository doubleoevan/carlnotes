# Spec Delta

## MODIFIED Requirements

### Requirement: Reading a note clears its counts

Opening a note SHALL record that the user has read it, taking both of that note's counts to zero.
A note SHALL record who edited it last, and an unread edit SHALL require that the last editor was
somebody else, so a writer is never badged for their own work. A note the user has never read and did
not write SHALL count as unread, with no backfill making old notes read as read. A successful open on web or mobile
SHALL clear its local counts and submit the same server read record. The other client SHALL reflect that read on its
next successful badge refresh. A failed open SHALL NOT mark the note read. A failed read acknowledgement SHALL NOT
permanently suppress counts or claim they cleared on other clients.

#### Scenario: Opening a note clears it

- **WHEN** a user opens a note showing unread edits and comments
- **THEN** both of that note's counts go to zero and its badges stop showing

#### Scenario: The last editor is not badged for their own edit

- **WHEN** a user edits a note without having opened it in this session
- **THEN** that note reports no unread edit to that user, whatever their read time says

#### Scenario: A never-read note counts

- **WHEN** a user who has never opened a note, and did not write it, can see it
- **THEN** that note reports one unread edit

#### Scenario: Mobile reading clears web counts

- **WHEN** a user opens a note on mobile and the server accepts the read record
- **THEN** the note row and Topic rollup clear locally, and the same account's web badges clear on their next successful refresh
- **AND** reading on web clears mobile counts through the reciprocal refresh path

#### Scenario: An acknowledgement fails

- **WHEN** the note opens but its read acknowledgement fails
- **THEN** tentative suppression is removed or retried while that note remains open, and no durable false read is recorded

## ADDED Requirements

### Requirement: Native note counts match web presentation

Mobile SHALL show separate unread edit/comment information on note rows and the combined count on rendered Topic titles and the Tasting Notes section. Count copy, outline treatment, and abbreviation SHALL match web. Accessible text and a press or long-press explanation SHALL expose the same details that web supplies by hover. Native Team pages SHALL use the same note counts and controls.

#### Scenario: A Topic has edits and comments waiting

- **WHEN** one Topic note has one unread edit and another has two unread comments
- **THEN** the Topic and section show three, and each note row identifies its own waiting changes

#### Scenario: A count exceeds nine

- **WHEN** more than nine changes are waiting
- **THEN** the compact badge reads "9+" and its accessible explanation retains the actual count

### Requirement: Badge refresh belongs to the active account

Both clients SHALL refresh note badges for the current account and clear old-account badge state on session exit or replacement. Mobile SHALL refresh on foregrounding, reconnection, and the active polling interval. Failed refreshes SHALL retain the last confirmed counts. Late responses from an earlier account SHALL never populate the current account's badges.

#### Scenario: A user changes accounts during a poll

- **WHEN** account A's badge response arrives after account B signs in
- **THEN** no count, note name, or Topic name from A appears for B

#### Scenario: A refresh fails

- **WHEN** mobile loses connectivity or a badge request fails
- **THEN** known counts remain until a successful refresh confirms different values

#### Scenario: New changes arrive after a read

- **WHEN** another user edits or comments after the read record was accepted
- **THEN** the next refresh can show those changes and an old local suppression does not hide them indefinitely
