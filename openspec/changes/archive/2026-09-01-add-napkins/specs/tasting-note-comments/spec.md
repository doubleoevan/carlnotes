## Purpose

Note comments let everyone with edit access on a note discuss its content in anchored threads, stored in the ydoc, mirrored to SQL for future counts and notifications, and delivered live over the note's SSE channel.

## ADDED Requirements

### Requirement: Comment threads anchor to note content

Users SHALL be able to start comment threads anchored to content in a note and reply within them while the note's dialog is open live. The ydoc's threads map SHALL be the source of truth for threads and comments. Pressing text with a comment mark SHALL select that thread on the press, so one tap reaches it on a touch screen.

#### Scenario: A thread is created on selected content

- **WHEN** a user with edit access selects content in a live note and adds a comment
- **THEN** a thread anchored to that content is stored in the ydoc and visible to others with access

#### Scenario: Pressing commented text selects its thread

- **WHEN** a user presses text with a comment mark
- **THEN** that thread is selected on the press, so one tap reaches it on a touch screen

### Requirement: A threads panel lists the note's comments

The note dialog SHALL offer a comment threads panel listing the note's threads: a margin sidebar beside the note on a wide screen, open by default, and a sheet sliding up over the note on a phone, closed until it is asked for. A control in the dialog header SHALL toggle it, reading "Show comments" while it is closed and "Hide comments" while it is open. The floating thread card SHALL show only while the panel is closed, and the floating composer SHALL stay available in both states.

#### Scenario: A wide screen opens the panel beside the note

- **WHEN** a user with edit access opens a note on a wide screen
- **THEN** the threads panel renders as a sidebar in the margin beside the note without any interaction

#### Scenario: A phone opens the panel on demand

- **WHEN** a user with edit access opens a note on a phone
- **THEN** the threads panel stays closed until they activate the header control, and then it slides up over the note

#### Scenario: The header control toggles the panel

- **WHEN** a user activates the dialog header's comments control
- **THEN** the panel opens or closes, and the control reads "Show comments" while the panel is closed and "Hide comments" while it is open

#### Scenario: The floating card yields to an open panel

- **WHEN** the threads panel is open
- **THEN** no floating thread card renders over the note, while the floating composer stays available

### Requirement: A comment's "@" menu offers the page's team members

Typing "@" in a comment box SHALL offer usernames to mention: the active members of every team holding the page, minus the commenter, deduped and in alphabetical order. A visitor SHALL be offered nobody, and so SHALL a topic that no team holds. The list SHALL arrive on the page's notes payload as `mentionableUsernames` instead of being fetched per keystroke. Picking a name SHALL insert it as plain text, with no mention entity stored and no notification sent in v1.

#### Scenario: The menu lists the holding teams' members

- **WHEN** a member of a team holding the page types "@" in a comment box
- **THEN** the menu offers the active members of every holding team, without the commenter, deduped and in alphabetical order

#### Scenario: A page no team holds offers nobody

- **WHEN** a user types "@" in a comment on a topic that no team holds
- **THEN** the menu offers nobody

#### Scenario: A pick inserts plain text

- **WHEN** a user picks a name from the "@" menu
- **THEN** the username is inserted as plain text, with no mention entity stored and no notification sent

### Requirement: Comment permissions are enforced server-side

Thread and comment create, read, update, delete, resolve and unresolve, and emoji reaction add and remove SHALL go through server routes that enforce permissions authoritatively — any client-side comment gating is presentation only. Anyone with edit access to the note SHALL be able to comment; there SHALL be no comment-only role in v1; readers without edit access (including visitors on public notes) SHALL NOT be able to comment.

#### Scenario: A comment from a user without edit access is refused

- **WHEN** someone without edit access on the note calls a comment route directly
- **THEN** the server refuses it and no thread or comment is stored

#### Scenario: A team member comments on the team note

- **WHEN** a member of a team holding the page comments on the team note
- **THEN** the comment is accepted and stored

#### Scenario: A reaction is added and removed

- **WHEN** a user with edit access reacts to a comment with an emoji and later removes that reaction
- **THEN** the reaction is stored against their user and that emoji, a repeat add changes nothing, and the removal clears only their own

### Requirement: Comments mirror to SQL and broadcast over SSE

Comment writes SHALL be applied to the ydoc threads map, mirrored into `note_comment_threads` and `note_comments` tables (for future counts and notifications), and broadcast to connected clients over the note's existing SSE channel — no separate comment stream.

#### Scenario: A new comment reaches a connected collaborator

- **WHEN** a user adds a comment while a collaborator holds the note's SSE connection open
- **THEN** the collaborator sees the comment without reloading

#### Scenario: The SQL mirror tracks the thread

- **WHEN** a thread gains a comment or is resolved
- **THEN** the mirrored rows reflect the thread's comments and state

### Requirement: Comment authors resolve from the users table

Comment authorship SHALL resolve display identity (username and avatar) from the existing `users` table.

#### Scenario: A comment shows its author

- **WHEN** a comment renders for any user with access
- **THEN** it shows the author's username and avatar resolved from the users table
