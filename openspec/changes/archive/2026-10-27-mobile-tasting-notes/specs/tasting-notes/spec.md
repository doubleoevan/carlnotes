# Spec Delta

## MODIFIED Requirements

### Requirement: A note is a named note on a page with a visibility and a versioned body

The system SHALL persist notes in a `notes` table where each row belongs to exactly one page — a Topic or a Team —
and has a `name`, a `visibility` (`private`, `team`, or `public`), an owner user reference recording its creator, the
sanitized HTML body (`html`), an integer `version` that starts at 1, who edited the body last, when the body last
changed, and created and updated timestamps. A page MAY hold any number of notes in any visibility. The stored HTML
SHALL be the canonical server body, and every save that changes it SHALL raise the version by one. An unsaved mobile
draft SHALL remain a device-local working copy tied to its original server version, never a second accepted body.

#### Scenario: Several notes share a page and a visibility

- **WHEN** two team notes and three private notes are created on one page
- **THEN** every row is kept, each with its own name, visibility, and owner

#### Scenario: A save raises the version

- **WHEN** a save changes a note's body
- **THEN** the stored HTML is the sanitized body sent, the version is one higher than before, and the last editor and
  the body's edit time are the saver and the time of the save

#### Scenario: A device draft is not a server save

- **WHEN** mobile stores an offline edit
- **THEN** the accepted server body and version remain unchanged until a version-checked save succeeds

### Requirement: A note opens in a dialog as an editor or a reader

Clicking a note's row on the web SHALL open it in a dialog. The default page load SHALL render only the table: no note
bodies, no editor code, and no request for a note's body. Opening a note SHALL fetch its stored HTML and its version.
Anyone without edit access SHALL get the body rendered read-only by the editor package's display component, loaded
in the browser only on web. A user with edit access SHALL get the editor, loaded in the browser only on web, open on
the stored body and editable straight away. There SHALL be no separate edit state and no edit toggle. The web dialog
header SHALL show an expand and collapse control on a wide screen only, a phone always opening the dialog expanded,
and a rename pencil beside the title for editors. Mobile SHALL open Topic and Team notes in a native screen with the same
reader/editor choice and permission gates. Each route SHALL verify membership in its owning page. Closing either note
view SHALL send any pending save at once.

#### Scenario: Default page load is table-only

- **WHEN** a topic or team page loads with its Tasting Notes section expanded
- **THEN** the note table renders with no editor code fetched and no note body requested

#### Scenario: Opening a note loads the editor on the stored body

- **WHEN** a user with edit access opens a note from the table
- **THEN** the note's HTML and version are fetched, the editor loads dynamically with that HTML as its content, and it
  takes edits with no mode to switch into

#### Scenario: A read-only open renders the stored body

- **WHEN** a visitor or a user without edit access opens a public note
- **THEN** the dialog or native screen renders the stored HTML through the display component, with no toolbar and no composer

#### Scenario: The dialog expands and collapses

- **WHEN** a user opens a note on a wide web screen
- **THEN** the dialog opens at its medium size with a control that expands it to fill the screen and collapses it back,
  while a phone browser opens the dialog expanded and offers no such control

#### Scenario: Closing sends the pending save

- **WHEN** a user closes the note view while a save is waiting for the debounce
- **THEN** the save is sent at once, before the editor unmounts

#### Scenario: Mobile opens a Topic note natively

- **WHEN** a signed-in user selects a visible note on a Topic screen
- **THEN** the native note screen loads fresh permissions, body, and version without opening a browser
- **AND** a read failure shows retry, while a missing or inaccessible note reveals no stored body

#### Scenario: Mobile opens a Team note natively

- **WHEN** a signed-in user selects a visible note on a Team screen
- **THEN** the shared native note screen verifies Team membership and fresh note permissions before rendering
- **AND** closing returns to that Team's table without opening a browser

## ADDED Requirements

### Requirement: Mobile note creation and management follow web permissions

Mobile SHALL offer note creation in a sheet with a name and only the returned creatable visibilities. Visibility descriptions and action copy SHALL match web. Editors SHALL rename, creators SHALL change visibility, and creators or admins SHALL delete after confirmation. Permission fields from the opened note SHALL govern controls; the server remains authoritative.

#### Scenario: Both creation actions open the same sheet

- **WHEN** a user presses Add Note or the linked Topic or Team name in the empty invitation
- **THEN** the same creation sheet opens with the permitted private, team, and public choices
- **AND** successful creation opens the native editor and refreshes the shared table

#### Scenario: A team editor does not own the note

- **WHEN** an editor opens another member's team note
- **THEN** rename and body editing are available, but visibility and deletion are absent unless separately granted

#### Scenario: An admin has deletion access alone

- **WHEN** an admin opens a note without edit access
- **THEN** the note and comments remain read-only, with confirmed deletion available and no visibility control

#### Scenario: A rejected management action preserves the view

- **WHEN** creation, rename, visibility change, or deletion fails
- **THEN** the entered values or prior confirmed state remain recoverable and the view explains the failure
- **AND** cancelling deletion changes nothing

### Requirement: Native note formatting matches web

The native editor SHALL offer exactly web's formatting controls, labels, order, and active/blocked states, with matching Nightshift button variants and icons. Reader and editor SHALL use the same note typography and colors in both themes. Note headings SHALL keep the body font; recap headings SHALL keep the display font.

#### Scenario: Every supported format survives a round trip

- **WHEN** a note contains bold, italic, underline, strikethrough, inline code, headings 1–3, bullets, numbers, checklists, quotes, code blocks, and links
- **THEN** web and native readers preserve those formats after a native save and reload
- **AND** tapping an editable checklist checkbox toggles and saves its checked state

#### Scenario: Toolbar controls follow the selection

- **WHEN** the selection changes to bold text or a code block
- **THEN** controls show the same selected and blocked states as web and expose their state accessibly

#### Scenario: Pasting stays within the supported formats

- **WHEN** rich text with images, nested lists, or tables is pasted
- **THEN** supported formatting survives, images are dropped, and unsupported structures follow the web editor's normalization
- **AND** no image, alignment, mention, or slash-menu control appears

#### Scenario: Link editing preserves the selection

- **WHEN** a user adds, edits, removes, or opens a link through the toolbar
- **THEN** the action uses the intended selection and the web's supported URL rules
- **AND** selection across paragraphs blocks link application as on web

### Requirement: Native notes remain usable above the keyboard

The native formatting toolbar SHALL remain above the software keyboard while editing. Long notes SHALL scroll with the caret visible, without covering the toolbar or comment composer. Controls SHALL preserve selection, support system text scaling, and meet the app's iOS and Android touch-target requirements.

#### Scenario: Editing the bottom of a long note

- **WHEN** a user types, selects text, and changes formatting near the bottom of a long note on iOS or Android
- **THEN** the caret and toolbar remain reachable above the keyboard and edits reach the selected text

#### Scenario: Large text and keyboard dismissal

- **WHEN** a user enlarges system text, opens comments, dismisses the keyboard, and resumes editing
- **THEN** controls remain labeled and unclipped, scrolling works, and the note text and selection are preserved
