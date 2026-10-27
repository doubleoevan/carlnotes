# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
