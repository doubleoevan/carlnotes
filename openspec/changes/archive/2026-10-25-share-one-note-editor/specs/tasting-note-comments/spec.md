## ADDED Requirements

### Requirement: A note has one plain-text comment thread

Each note SHALL have one comment thread, kept as `note_comments` rows that name the note, the author, a plain-text
body of at most `NOTE_COMMENT_MAX_CHARS` characters, and the time written. The thread SHALL list oldest first. Nothing
SHALL anchor a comment to a passage of the note, resolve a thread, react to a comment, or mention a user. Deleting a
note SHALL delete its comments, and closing an author's account SHALL leave their comments with no author.

#### Scenario: A comment is stored on the note

- **WHEN** a user with edit access posts a comment
- **THEN** a row names the note, the user, the trimmed text, and the time, and the thread shows it last

#### Scenario: A note's deletion takes its comments

- **WHEN** a note with comments is deleted
- **THEN** no comment row for it remains

### Requirement: The comment thread shows beside the note on a wide screen and over it on a phone

The note dialog SHALL show the thread as a margin column beside the note on a wide screen, open by default, and as a
sheet that slides up over the note on a phone, closed until it is asked for. A control in the dialog header SHALL
toggle it, reading "Show comments" while it is closed and "Hide comments" while it is open. Each comment SHALL show its
author's avatar and username, when it was written, and its text, with a delete control for its author alone. A
composer SHALL show for anyone with edit access and for nobody else; a reader without edit access SHALL still see the
thread. The thread SHALL load once when the dialog opens. A post SHALL append the comment the api returns to the
thread's end, and a delete SHALL remove the comment from the thread in place, with no second load of the thread.

#### Scenario: A wide screen opens the thread beside the note

- **WHEN** a user opens a note on a wide screen
- **THEN** the thread renders as a column beside the note without any interaction

#### Scenario: A phone opens the thread on demand

- **WHEN** a user opens a note on a phone
- **THEN** the thread stays closed until they activate the header control, and then it covers the note

#### Scenario: The header control toggles the thread

- **WHEN** a user activates the dialog header's comments control
- **THEN** the thread opens or closes, and the control reads "Show comments" while closed and "Hide comments" while
  open

#### Scenario: A reader sees the thread without a composer

- **WHEN** a visitor or a user without edit access opens a public note
- **THEN** the thread's comments render and no composer renders

### Requirement: Comment routes enforce permissions and validate bodies

The comment list SHALL take view access, a post SHALL take edit access through the same check as writing the body,
and a delete SHALL be the comment's author's alone. Every rejection SHALL be a 404, as on the other note routes. A
post SHALL validate its body with the zod payload from the shared contracts, attached with the validator the other api
routes use, before any query; a body that fails validation SHALL respond 400 and store nothing.

#### Scenario: A comment from a user without edit access is rejected

- **WHEN** someone without edit access on the note posts a comment
- **THEN** the server answers 404 and no comment is stored

#### Scenario: A team member comments on the team note

- **WHEN** a member of a team holding the page posts a comment on the team note
- **THEN** the comment is accepted and stored

#### Scenario: Only the author deletes a comment

- **WHEN** a user who did not write a comment tries to delete it
- **THEN** the server answers 404 and the comment stays, while the author's own delete removes it

#### Scenario: A body of the wrong shape is a 400

- **WHEN** a post arrives with a body that is not an object, an empty text, or a text past the limit
- **THEN** the route responds 400 before any query, and nothing is stored

## REMOVED Requirements

### Requirement: Comment threads anchor to note content

**Reason**: Comments anchored to a passage lived in the Yjs document's threads map, which is gone with the document.
**Migration**: A note has one plain-text thread; existing threads are deleted with their notes.

### Requirement: A threads panel lists the note's comments

**Reason**: There are no threads to list, no floating card, and no floating composer.
**Migration**: The requirement returns as "The comment thread shows beside the note on a wide screen and over it on a
phone", keeping the column, the sheet, and the header control.

### Requirement: A comment's "@" menu offers the page's team members

**Reason**: The menu was BlockNote's suggestion menu inside its comment editor. A plain-text composer has none, and
`mentionableUsernames` leaves the notes payload.
**Migration**: None; a mention inserted plain text and stored nothing.

### Requirement: Comment permissions are enforced server-side

**Reason**: Resolving, unresolving, editing, and reactions are gone with the threads, and the remaining rules return
without them.
**Migration**: The requirement returns as "Comment routes enforce permissions and validate bodies".

### Requirement: Comments mirror to SQL and broadcast over SSE

**Reason**: SQL is the only copy of a comment, and there is no stream.
**Migration**: The thread table is dropped and `note_comments` names its note directly.

### Requirement: Comment bodies validate at the route

**Reason**: The thread, edit, and reaction payloads are gone with their routes.
**Migration**: The one remaining payload is validated under "Comment routes enforce permissions and validate bodies".
