## Purpose

Tasting Notes is a page's container of notes: individual rich-text notes with checklists and comments, each with its own visibility — private, team, or public — listed in a sortable table on topic pages and individual team pages, so readers keep their own thinking, shared team notes, and public annotations next to what Carl found.

## ADDED Requirements

### Requirement: A note is a named note on a page with a visibility

The system SHALL persist notes in a `notes` table where each row belongs to exactly one page — a Topic or a Team — and has a `name`, a `visibility` (`private`, `team`, or `public`), an owner user reference recording its creator, the Yjs document bytes (the ydoc), the rendered HTML (`html`), and created and updated timestamps. A page MAY hold any number of notes in any visibility. The ydoc SHALL be the source of truth for note content and comment threads; the `html` column SHALL be regenerated from the ydoc on save, never edited independently.

#### Scenario: Several notes share a page and a visibility

- **WHEN** two team notes and three private notes are created on one page
- **THEN** every row is kept, each with its own name, visibility, and owner

#### Scenario: The HTML tracks the ydoc

- **WHEN** a note's content is saved
- **THEN** the stored HTML is regenerated from the ydoc so a later static read reflects the saved content

### Requirement: The Tasting Notes section renders on topic pages and individual team pages only

The Tasting Notes section SHALL render on topic pages and on individual team pages, and nowhere else. The section header SHALL read "Tasting Notes" on a topic page and "Team notes" on an individual team page, and the section SHALL be expanded by default on every load. On the topic page the section SHALL sit at the bottom of the right column, below the topic settings.

#### Scenario: The section appears expanded on a topic page

- **WHEN** a user opens a topic page
- **THEN** the section renders expanded without any interaction, headed "Tasting Notes"

#### Scenario: The section appears expanded on a team page

- **WHEN** a user opens an individual team page
- **THEN** the section renders expanded without any interaction, headed "Team notes"

#### Scenario: No Tasting Notes section elsewhere

- **WHEN** a user opens a page that is neither a topic page nor an individual team page
- **THEN** no Tasting Notes section renders

### Requirement: The Tasting Notes section lists its notes as a sortable table

The Tasting Notes section SHALL list the visible notes as a table with sortable Name, Visibility, and Updated columns, alongside an "Add Note" call-to-action button for users who may create at least one visibility and for visitors, whose button leads to the sign-up. The table's footer row SHALL count the listed notes, split them by visibility, and date the freshest update. The Visibility column SHALL render an icon per visibility whose tooltip reads exactly: "Only you can see this note." for private, "Only your team can see this note." for team, and "Everyone can see this note." for public.

#### Scenario: The table sorts on its columns

- **WHEN** a user activates the Name, Visibility, or Updated header
- **THEN** the rows re-order by that column, and activating it again reverses the order

#### Scenario: Visibility icons use the exact tooltip copy

- **WHEN** a user hovers a note's visibility icon
- **THEN** the tooltip reads exactly "Only you can see this note.", "Only your team can see this note.", or "Everyone can see this note." for private, team, and public respectively

#### Scenario: The footer counts the notes

- **WHEN** the table lists two private notes and one public note
- **THEN** the footer row reads three notes, split as two private and one public, with the freshest update's age

#### Scenario: A visitor is invited to sign up

- **WHEN** a visitor (not signed in) views the Tasting Notes section
- **THEN** an "Add Note" button renders, and an empty section also renders the invitation card, both leading to the sign-up

#### Scenario: A signed-in user with no creatable visibility gets no call to action

- **WHEN** a signed-in user who may create no visibility views an empty Tasting Notes section
- **THEN** no "Add Note" button and no invitation card render, and the section reads "No notes on this topic yet." on a topic page or "No notes on this team yet." on a team page

### Requirement: The list holds only the notes the visibilities allow

The listed notes SHALL be: the user's own private notes, team notes when the user is a member of a team holding the page (the team itself for a team page; an owning or holding team for a topic), and public notes for everyone including visitors. Another user's private note SHALL never appear or be readable, except to an admin, who lists every note on the page so the ones they moderate are reachable.

#### Scenario: A member sees own private, team, and public notes

- **WHEN** a member of a team holding the page loads the Tasting Notes section
- **THEN** the table lists their own private notes, the page's team notes, and its public notes, and no one else's private notes

#### Scenario: A visitor sees public notes only

- **WHEN** a visitor loads the Tasting Notes section on a page with private, team, and public notes
- **THEN** only the public notes list

### Requirement: Creating a note takes a name and a visibility the creator may use

The "Add Note" flow SHALL take a name and a visibility, offering only the visibilities the creator may use: private for signed-in users who may see the page, team for members of a holding team, and public for the page owner and holding-team members. The visibility options SHALL have the same verbatim tooltips as the visibility icons. The flow's submit button SHALL read "Add note". The server SHALL refuse a create in a visibility the creator may not use.

#### Scenario: A non-member cannot create a team or public note

- **WHEN** a signed-in user who is not the page owner and not a member of any holding team creates a note
- **THEN** only the private visibility is offered, and a direct request for a team or public note is refused

#### Scenario: A member creates a team note

- **WHEN** a member of a holding team creates a note in the team visibility
- **THEN** the note is created with them as its owner

### Requirement: Visibility permissions govern each note

A private note SHALL be visible and editable by its owner only. A team note SHALL be visible and editable by every member of a team holding the page. A public note SHALL be visible to everyone and editable by the page owner and members of a holding team; all other signed-in users and all visitors SHALL get read-only static HTML and SHALL NOT be able to comment in v1. Renaming follows edit access; changing a note's visibility SHALL be its owner's alone, and a visibility change SHALL be limited to visibilities the owner may create in. Deleting a note SHALL be its owner's or an admin's. An admin SHALL read and delete every note whatever its visibility, including on a page they could not otherwise open, so that no note is beyond moderation; an admin SHALL NOT thereby gain edit access or the owner's visibility change. All permission checks SHALL be enforced server-side; client-side state is presentation only. Deleting a note SHALL remove it with its threads and comments.

#### Scenario: Another user cannot read someone's private note

- **WHEN** a request for a private note arrives from any user other than its owner
- **THEN** the server refuses it

#### Scenario: A non-member cannot edit a public note

- **WHEN** a signed-in user who is neither the page owner nor a member of a holding team attempts to write a public note
- **THEN** the server refuses the write and the client shows read-only static HTML without comment affordances

#### Scenario: Only the owner changes visibility or deletes

- **WHEN** a team member who does not own a team note attempts to change its visibility or delete it
- **THEN** the server refuses, while their content edits remain accepted

#### Scenario: An admin reads and deletes any note

- **WHEN** an admin opens a page holding another user's private note, including a page their own membership would not open
- **THEN** the note lists, reads, and deletes for them, while its visibility stays the owner's to change

### Requirement: A note opens in a dialog with two rendering states

Clicking a note's row SHALL open it in a dialog. The default page load SHALL render only the table — no note bodies, no editor code, and no live connection. Anyone without edit access SHALL get the stored HTML in the dialog with no editor code and no live connection. For users with edit access the dialog SHALL open live: the editor and Yjs load dynamically, the ydoc loads, the live connection opens with comments active, and the editor is editable straight away. There SHALL be no separate edit state and no edit toggle. The dialog header SHALL show an expand and collapse control on a wide screen only, a phone always opening the dialog expanded, and a rename pencil beside the title. Closing the dialog SHALL end the connection.

#### Scenario: Default page load is table-only

- **WHEN** a topic or team page loads with its Tasting Notes section expanded
- **THEN** the note table renders with no editor code fetched and no live connection opened

#### Scenario: Opening a note goes live for an editor

- **WHEN** a user with edit access opens a note from the table
- **THEN** the editor loads dynamically, the ydoc is fetched, a live connection opens with comments active, and the editor takes edits with no mode to switch into

#### Scenario: A read-only open stays static

- **WHEN** a visitor or a user without edit access opens a public note
- **THEN** the dialog shows the stored HTML with no editor code and no live connection

#### Scenario: The dialog expands and collapses

- **WHEN** a user opens a note on a wide screen
- **THEN** the dialog opens at its medium size with a control that expands it to fill the screen and collapses it back, while a phone opens the dialog expanded and offers no such control

#### Scenario: Closing the dialog disconnects

- **WHEN** a user closes the note dialog
- **THEN** the live connection ends

### Requirement: The editor offers rich text, checklists, and a slash menu

The note editor SHALL support rich text with checklist blocks and a slash menu. It SHALL be built from BlockNote's MPL-licensed core packages only (`@blocknote/core`, `@blocknote/react`, and one BlockNote UI package); no `@blocknote/xl-*` package SHALL ever be added as a dependency.

The editor's formatting toolbar SHALL lead with the control that adds a comment, then a divider, then the block-type select and the text controls, then dedicated bulleted-list, numbered-list, and check-list buttons. Each list button SHALL turn the caret's block into its list type, turn it back into a paragraph when the block already is that type, and SHALL render lit while the caret sits in a block of its kind.

#### Scenario: The toolbar leads with the comment control

- **WHEN** a user with edit access opens a note
- **THEN** the formatting toolbar reads: add a comment, a divider, the block-type select and the text controls, then the bulleted-list, numbered-list, and check-list buttons

#### Scenario: A list button toggles the caret's block

- **WHEN** a user activates the check-list button with the caret in a paragraph, and activates it again with the caret in the resulting check-list item
- **THEN** the block becomes a check-list item and then a paragraph again, and the button renders lit only while the caret sits in a check-list item

#### Scenario: A checklist survives the round trip

- **WHEN** a user adds a checklist block and checks an item, and the note is later rendered statically
- **THEN** the stored HTML shows the checklist with the item checked

#### Scenario: No GPL BlockNote package is depended on

- **WHEN** the dependency manifest is inspected
- **THEN** no `@blocknote/xl-*` package appears

### Requirement: Deleting a page deletes its notes

Deleting a page SHALL cascade to all of its notes — every visibility, including other users' private notes — and to their mirrored threads and comments.

#### Scenario: Topic deletion removes all its notes

- **WHEN** a topic with private, team, and public notes is deleted
- **THEN** no note, thread, or comment row for that topic remains

### Requirement: Note copy follows the product voice

The section header SHALL read "Tasting Notes" on a topic page and "Team notes" on an individual team page; an empty section SHALL invite writing with "Write a note on \<page\>." where \<page\> is the page's name; an empty note SHALL show the placeholder "TODO: a note about \<page\>."; toasts raised by note actions MAY have Carl personality in the body per the Persona and Voice guidance, while the visibility tooltip copy above stays verbatim as specified.

#### Scenario: An empty section invites writing

- **WHEN** a user who may create notes opens a page whose Tasting Notes section has no visible notes
- **THEN** the section shows a card reading "Write a note on \<page\>." with the page's name substituted, which opens the create flow

#### Scenario: An empty note names its page

- **WHEN** a user with edit access opens a note with no content
- **THEN** the editor's placeholder reads "TODO: a note about \<page\>." with the page's name substituted

#### Scenario: Verbatim copy is not rewritten for voice

- **WHEN** any visibility tooltip renders
- **THEN** its text matches the specified copy exactly
