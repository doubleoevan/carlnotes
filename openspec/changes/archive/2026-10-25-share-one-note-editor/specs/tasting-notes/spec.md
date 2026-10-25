## ADDED Requirements

### Requirement: A note is a named note on a page with a visibility and a versioned body

The system SHALL persist notes in a `notes` table where each row belongs to exactly one page — a Topic or a Team —
and has a `name`, a `visibility` (`private`, `team`, or `public`), an owner user reference recording its creator, the
sanitized HTML body (`html`), an integer `version` that starts at 1, who edited the body last, when the body last
changed, and created and updated timestamps. A page MAY hold any number of notes in any visibility. The stored HTML
SHALL be the only copy of a note's body, and every save that changes it SHALL raise the version by one.

#### Scenario: Several notes share a page and a visibility

- **WHEN** two team notes and three private notes are created on one page
- **THEN** every row is kept, each with its own name, visibility, and owner

#### Scenario: A save raises the version

- **WHEN** a save changes a note's body
- **THEN** the stored HTML is the sanitized body sent, the version is one higher than before, and the last editor and
  the body's edit time are the saver and the time of the save

### Requirement: A note opens in a dialog as an editor or a reader

Clicking a note's row SHALL open it in a dialog. The default page load SHALL render only the table: no note bodies, no
editor code, and no request for a note's body. Opening a note SHALL fetch its stored HTML and its version. Anyone
without edit access SHALL get the body rendered read-only by the editor package's display component, loaded in the
browser only. A user with edit access SHALL get the editor, loaded in the browser only, open on the stored body and
editable straight away. There SHALL be no separate edit state and no edit toggle. The dialog header SHALL show an
expand and collapse control on a wide screen only, a phone always opening the dialog expanded, and a rename pencil
beside the title. Closing the dialog SHALL send any pending save at once.

#### Scenario: Default page load is table-only

- **WHEN** a topic or team page loads with its Tasting Notes section expanded
- **THEN** the note table renders with no editor code fetched and no note body requested

#### Scenario: Opening a note loads the editor on the stored body

- **WHEN** a user with edit access opens a note from the table
- **THEN** the note's HTML and version are fetched, the editor loads dynamically with that HTML as its content, and it
  takes edits with no mode to switch into

#### Scenario: A read-only open renders the stored body

- **WHEN** a visitor or a user without edit access opens a public note
- **THEN** the dialog renders the stored HTML through the display component, with no toolbar and no composer

#### Scenario: The dialog expands and collapses

- **WHEN** a user opens a note on a wide screen
- **THEN** the dialog opens at its medium size with a control that expands it to fill the screen and collapses it back,
  while a phone opens the dialog expanded and offers no such control

#### Scenario: Closing sends the pending save

- **WHEN** a user closes the note dialog while a save is waiting for the debounce
- **THEN** the save is sent at once, before the editor unmounts

### Requirement: The editor offers rich text, lists, and a formatting toolbar

The note editor SHALL be the `react-native-enriched-html` editor, the component the mobile app renders natively,
loaded in the browser only. It SHALL offer bold, italic, underline, strikethrough, inline code, three heading levels,
bulleted, numbered, and check lists, block quotes, code blocks, and links, through a formatting toolbar built from the
Nightshift `Button` primitive as ghost icon buttons. Each control SHALL render lit with the menu option's selected fill
while its style is active in the selection and disabled while another active style blocks it, both read from the
editor's `onChangeState`. The
package's keyboard shortcuts and its `- ` and `1. ` text shortcuts SHALL stay on. There SHALL be no slash menu, no
image control, no mention menu, and no text alignment control. The toolbar SHALL render on the theme's colors in
light and dark.

#### Scenario: A toolbar control toggles and lights

- **WHEN** a user activates the check-list control with the caret in a paragraph, and activates it again with the
  caret in the resulting item
- **THEN** the paragraph becomes a check-list item and then a paragraph again, and the control renders lit only while
  the caret sits in a check-list item

#### Scenario: A blocked control is disabled

- **WHEN** the caret sits inside a code block
- **THEN** the bold, italic, underline, strikethrough, and inline code controls render disabled

#### Scenario: A checklist survives the round trip

- **WHEN** a user adds a check list and checks an item, the note saves, and the note is later opened read-only
- **THEN** the stored HTML shows the check list with the item checked

#### Scenario: The toolbar follows the theme

- **WHEN** the theme is toggled while a note is open
- **THEN** the toolbar, the editor's text and marks, and the display component all take the new theme's colors

### Requirement: A lost save keeps the words and offers a reload

If a save answers a conflict, the dialog SHALL keep what the person typed in the editor. It SHALL show a notice naming
who saved last, saying that person saved the note since it was opened, asking the person to copy anything they want
to keep, and offering a reload. Until the reload, no further save SHALL be sent and the status SHALL read not saved. The
reload SHALL fetch the stored body and version, replace the editor's content with that body, and clear the notice.

#### Scenario: A conflict keeps the words

- **WHEN** a save returns a conflict because somebody else saved first
- **THEN** the editor still holds the person's text, the notice names who saved last and offers a reload, the status
  reads not saved, and no further save goes out

#### Scenario: Reload takes the server's version

- **WHEN** the person activates the reload in the notice
- **THEN** the editor shows the stored body, saving resumes against the stored version, and the notice closes

## MODIFIED Requirements

### Requirement: Visibility permissions govern each note

A private note SHALL be visible and editable by its owner only. A team note SHALL be visible and editable by every
member of a team holding the page. A public note SHALL be visible to everyone and editable by the page owner and
members of a holding team; all other signed-in users and all visitors SHALL get the body rendered read-only, SHALL see
its comment thread, and SHALL NOT be able to comment. Renaming follows edit access; changing a note's visibility SHALL
be its owner's alone, and a visibility change SHALL be limited to visibilities the owner may create in. Deleting a
note SHALL be its owner's or an admin's. An admin SHALL read and delete every note whatever its visibility, including
on a page they could not otherwise open, so that no note is beyond moderation; an admin SHALL NOT thereby gain edit
access or the owner's visibility change. All permission checks SHALL be enforced server-side; client-side state is
presentation only. Deleting a note SHALL remove it with its comments and read records.

#### Scenario: Another user cannot read someone's private note

- **WHEN** a request for a private note arrives from any user other than its owner
- **THEN** the server rejects it

#### Scenario: A non-member cannot edit a public note

- **WHEN** a signed-in user who is neither the page owner nor a member of a holding team attempts to write a public
  note
- **THEN** the server rejects the write and the client shows the body read-only with the thread and no composer

#### Scenario: Only the owner changes visibility or deletes

- **WHEN** a team member who does not own a team note attempts to change its visibility or delete it
- **THEN** the server rejects the change, while their content edits remain accepted

#### Scenario: An admin reads and deletes any note

- **WHEN** an admin opens a page holding another user's private note, including a page their own membership would not
  open
- **THEN** the note lists, reads, and deletes for them, while its visibility stays the owner's to change

### Requirement: Deleting a page deletes its notes

Deleting a page SHALL cascade to all of its notes — every visibility, including other users' private notes — and to
their comments and read records.

#### Scenario: Topic deletion removes all its notes

- **WHEN** a topic with private, team, and public notes is deleted
- **THEN** no note, comment, or read row for that topic remains

### Requirement: The note dialog says where the note stands

A note saves on its own a moment after typing stops, so the dialog SHALL say where it stands instead of offering a
control to save it. At the foot of the dialog, beside the delete, it SHALL show that the note is saving while a save is
waiting or on its way, that it is saved once the server holds the latest body, and that it is not saved when a save
failed or lost to a newer version. It SHALL NOT offer a Save button: the note saves itself, and a button would imply
that leaving without it loses work.

The status SHALL be the plain fact and nothing else. A failure already explains itself in a toast or in the conflict
notice, so the status SHALL NOT repeat the reason.

A reader without edit access SHALL see no status, since a note they cannot change is never saving. An editor who
may not delete SHALL still see it, so the two sit on that row independently.

#### Scenario: Typing shows the note saving and then saved
- **WHEN** an editor types into a note
- **THEN** the dialog shows it saving while the save waits or is on its way, and saved once the server has it

#### Scenario: A failed save says so and stays saying so
- **WHEN** a save fails
- **THEN** the dialog shows the note is not saved, the toast explains why, and the status stays until a save succeeds

#### Scenario: A note nobody has touched reads as saved
- **WHEN** an editor opens a note and types nothing
- **THEN** the dialog shows it saved, since everything in it is already on the server

#### Scenario: A read-only note shows no status
- **WHEN** a visitor or a user without edit access opens a public note
- **THEN** no save status shows, since nothing about it can change

#### Scenario: No Save button is offered
- **WHEN** an editor looks for a way to save
- **THEN** the dialog offers none, because the note is already saved and a button would say otherwise

#### Scenario: A conflict says the note is not saved
- **WHEN** a save answers a conflict
- **THEN** the dialog shows the note is not saved and the conflict notice explains why

## REMOVED Requirements

### Requirement: A note is a named note on a page with a visibility

**Reason**: The Yjs document is gone. The body is sanitized HTML beside an integer version, and nothing is regenerated
from anything.
**Migration**: One migration deletes every note, drops the `ydoc` column, and adds `version`. The requirement returns
as "A note is a named note on a page with a visibility and a versioned body".

### Requirement: A note opens in a dialog with two rendering states

**Reason**: There is no live connection to open or close. Both opens fetch the stored body and its version, and the
editor and the display component both load in the browser only.
**Migration**: The requirement returns as "A note opens in a dialog as an editor or a reader", with the pending save
sent on close in place of a disconnect.

### Requirement: The editor offers rich text, checklists, and a slash menu

**Reason**: BlockNote and its slash menu leave with Yjs. The shared editor has a toolbar the app builds, and no comment
control leads it because comments are no longer anchored.
**Migration**: The requirement returns as "The editor offers rich text, lists, and a formatting toolbar". The
dependency rule about `@blocknote/xl-*` is moot once no `@blocknote` package remains.
