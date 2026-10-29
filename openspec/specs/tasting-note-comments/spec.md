# tasting-note-comments Specification

## Purpose
TBD - created by archiving change add-napkins. Update Purpose after archive.

## Requirements

### Requirement: Comment authors resolve from the users table

Comment authorship SHALL resolve display identity (username and avatar) from the existing `users` table.

#### Scenario: A comment shows its author

- **WHEN** a comment renders for any user with access
- **THEN** it shows the author's username and avatar resolved from the users table

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

The web note dialog SHALL show the thread as a margin column beside the note on a wide screen, open by default, and
as a sheet that slides up over the note in a phone browser, closed until it is asked for. A control in the web dialog
header SHALL toggle it, reading "Show comments" while it is closed and "Hide comments" while it is open. The native
Topic or Team note screen SHALL show its complete thread below the note without requiring that toggle. Each comment SHALL
show its author's avatar and username, when it was written, and its text, with a delete control for its author alone.
A composer SHALL show for anyone with edit access and for nobody else; a reader without edit access SHALL still see
the thread. The thread SHALL load once when the note opens. A post SHALL append the comment the api returns to the
thread's end, and a delete SHALL remove the comment from the thread in place, with no second load of the thread.

#### Scenario: A wide screen opens the thread beside the note

- **WHEN** a user opens a note on a wide web screen
- **THEN** the thread renders as a column beside the note without any interaction

#### Scenario: A phone opens the thread on demand

- **WHEN** a user opens a note in a phone browser
- **THEN** the thread stays closed until they activate the header control, and then it covers the note

#### Scenario: The header control toggles the thread

- **WHEN** a user activates the web dialog header's comments control
- **THEN** the thread opens or closes, and the control reads "Show comments" while closed and "Hide comments" while open

#### Scenario: A reader sees the thread without a composer

- **WHEN** a visitor or a user without edit access opens a public note
- **THEN** the thread's comments render and no composer renders

#### Scenario: Native comments follow the note

- **WHEN** a user opens a Topic or Team note on iOS or Android
- **THEN** the complete oldest-first thread appears below the body, with the web's author, timestamp, and plain-text formatting
- **AND** a closed account uses the web's fallback identity and offers no author-only delete control

### Requirement: Comment routes enforce permissions and validate bodies

The comment list SHALL take view access, a post SHALL take edit access through the same check as writing the body,
and a delete SHALL be the comment's author's or an admin's. Every rejection SHALL be a 404, as on the other note
routes. A post SHALL validate its body with the zod payload from the shared contracts, attached with the validator the
other api routes use, before any query; a body that fails validation SHALL respond 400 and store nothing. A list
SHALL leave out the comments of people the reader has blocked and the comments the reader has reported.

#### Scenario: A comment from a user without edit access is rejected

- **WHEN** someone without edit access on the note posts a comment
- **THEN** the server answers 404 and no comment is stored

#### Scenario: A team member comments on the team note

- **WHEN** a member of a team holding the page posts a comment on the team note
- **THEN** the comment is accepted and stored

#### Scenario: Only the author deletes a comment

- **WHEN** a user who did not write a comment and is not an admin tries to delete it
- **THEN** the server answers 404 and the comment stays, while the author's own delete removes it, and an admin's
  delete removes it when resolving a report

#### Scenario: A body of the wrong shape is a 400

- **WHEN** a post arrives with a body that is not an object, an empty text, or a text past the limit
- **THEN** the route responds 400 before any query, and nothing is stored

#### Scenario: A blocked person's comment is left out of the list

- **WHEN** a reader who blocked a comment's author loads the thread
- **THEN** the list omits that comment, and the author's own load still includes it

### Requirement: Comment failures preserve context and text

A failed thread load SHALL show a retry state instead of claiming the thread is empty. Posting SHALL prevent duplicate submission while pending and clear the composer only after acceptance. A rejected post SHALL retain its text. A failed deletion SHALL retain the comment. None of these actions SHALL close the note or discard unsaved body text.

#### Scenario: A thread request fails

- **WHEN** loading comments fails
- **THEN** the note stays open with a retry control and no false empty-thread message

#### Scenario: A comment post fails

- **WHEN** an editor submits a comment and the request fails
- **THEN** the text remains available for retry, with no phantom comment or automatic duplicate submission

#### Scenario: A comment is deleted

- **WHEN** the comment's author deletes it successfully
- **THEN** it disappears in place and the note remains open
- **AND** failure leaves the existing row intact
