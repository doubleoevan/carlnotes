# tasting-note-sync Specification

## Purpose
TBD - created by archiving change add-napkins. Update Purpose after archive.

## Requirements

### Requirement: A note read returns its body and version

The note read endpoint SHALL return the note's stored HTML and its integer version together, behind view access, and
SHALL answer as missing (404) to anyone who may not see the note.

#### Scenario: An open gets the body and version

- **WHEN** a user with view access reads a note
- **THEN** the response holds the stored HTML and the version the next save must name

#### Scenario: No view access reads nothing

- **WHEN** someone without view access reads a note
- **THEN** the endpoint answers 404

### Requirement: A save writes the sanitized body only at the version it opened at

A save SHALL take the note's HTML and the version the editor opened at, behind edit access, answering 404 to anyone
without it and answering a visitor before the body is read. The api SHALL sanitize the HTML and then write it, with
the version raised by one, the saver as last editor, and the body's edit time set, only if the stored version still
equals the one sent, in one conditional write with no lock. If the stored version differs it SHALL answer a conflict
(409) naming the stored version and the username of who saved last. A sanitized body equal to the stored one SHALL
write nothing and answer the stored version. The HTML SHALL be bounded by `NOTE_HTML_MAX_CHARS` in the shared
contracts, the route SHALL have a body limit of its own, and a larger body SHALL get a 4xx, never a 500.

#### Scenario: A save at the current version writes and raises it

- **WHEN** a user with edit access saves a body naming the stored version
- **THEN** the sanitized body is stored, the version is one higher, the last editor and edit time are set, and the
  response names the new version

#### Scenario: A save at a stale version is a conflict

- **WHEN** a user with edit access saves a body naming a version lower than the stored one
- **THEN** nothing is written and the response is a 409 naming the stored version and who saved last

#### Scenario: A write without edit access is rejected

- **WHEN** someone without edit access saves a body
- **THEN** the server answers 404 and the stored body is unchanged

#### Scenario: An oversized body is rejected

- **WHEN** a save's HTML is longer than the limit
- **THEN** the server answers 413 or 400 and stores nothing

#### Scenario: An unchanged body writes nothing

- **WHEN** a save's sanitized body equals the stored one at the stored version
- **THEN** no row changes, the version stays, and the response names the stored version

### Requirement: The editor saves on a debounce and flushes on close

The editor SHALL send a save one second after typing stops, merging the keystrokes in between into one save, with at
most one save on its way and at most one waiting behind it. It SHALL send no save whose HTML equals the last saved
body, or the body on its way to the server. Closing the dialog or native screen SHALL send a pending save at once.
A failed save SHALL leave the body not saved and retry on the next change. A conflict SHALL stop every further save
until the person reloads. The schedule SHALL live in `packages/core` with no DOM dependency, behind a hook, so both
editors use it. Mobile SHALL also flush when the app leaves the foreground and retry durable pending bodies after
reconnection. Background execution SHALL NOT be required for draft durability.

#### Scenario: Keystrokes merge into one save

- **WHEN** a user types ten characters within a second
- **THEN** one save goes out, a second after the last keystroke, with all ten

#### Scenario: A change during a save queues one more

- **WHEN** a user types while a save is on its way
- **THEN** one more save goes out after the first returns, and the status reads saved only once nothing is pending

#### Scenario: A failed save retries on the next change

- **WHEN** a save fails with a network error
- **THEN** the status reads not saved, a toast says so, and the next change schedules a save of the latest body

#### Scenario: Closing sends the pending save

- **WHEN** the dialog or native screen closes while a save waits for the debounce
- **THEN** the save is sent at once

#### Scenario: Backgrounding flushes without another edit

- **WHEN** the app leaves the foreground before the debounce expires
- **THEN** it attempts the waiting save immediately and keeps a durable draft until acceptance
- **AND** repeated inactive/background events do not duplicate the same save

### Requirement: A saved body is sanitized to the editor's tag set

The api SHALL sanitize every saved body with an allowlist of exactly the tags the editor writes: `p`, `br`, `b`, `i`,
`u`, `s`, `code`, `a`, `h1` through `h6`, `ul`, `ol`, `li`, `blockquote`, and `codeblock`; the attributes `href` on
`a` with the `http`, `https`, and `mailto` schemes, `data-type` on `ul` only when it is exactly `checkbox`, and
`checked` on `li`. Everything else SHALL be dropped: `img`, `mention`, `script` and `style` with their contents, `style`
attributes, event handler attributes, `target` and `rel`, and unknown tags with the text inside them kept. An empty
document, which the editor writes as `<br>` alone, SHALL be stored as an empty string. The sanitizer SHALL run before
every write and nowhere else.

#### Scenario: Every editor tag survives

- **WHEN** a body holding headings, every inline mark, a link, bulleted, numbered, and checked and unchecked checkbox
  lists, a block quote, a code block, and an empty line is saved
- **THEN** the stored HTML holds each of them, and loading it back into the editor writes the same content again

#### Scenario: Hostile markup is stripped

- **WHEN** a body holding a `script`, an `onclick` attribute, a `javascript:` link, a `style` attribute, an unknown tag,
  and a `mention` is saved
- **THEN** the stored HTML has none of them and keeps the readable text

#### Scenario: A pasted image is dropped

- **WHEN** a body holding an `img` is saved
- **THEN** the stored HTML has no `img`, and the editor strips the tag from the HTML it sends

#### Scenario: An empty note stores an empty body

- **WHEN** a save's body is the editor's empty document
- **THEN** the stored HTML is an empty string and the note's placeholder shows on the next open

### Requirement: Native drafts survive restarts for their account

Mobile SHALL persist each unsaved note body with its note id, account id, and original server version. Draft persistence SHALL not wait for the network debounce. A normal restart or application update SHALL preserve recoverable drafts. Another account SHALL never display or save them. Offline editing SHALL be limited to notes previously opened with edit access; creating notes and posting comments remain online actions.

#### Scenario: An offline edit survives termination

- **WHEN** a user edits a previously opened note offline, closes the app, and reopens it under the same account
- **THEN** the latest durably stored text is recoverable with its original version and an unsaved status
- **AND** it is not represented as a server-saved note

#### Scenario: Storage cannot keep a draft

- **WHEN** a device write fails
- **THEN** the current editor retains its text and explains that it could not keep the draft on the device
- **AND** the app does not claim the draft will survive closing

#### Scenario: An app update invalidates the feed cache

- **WHEN** the app's build identity changes
- **THEN** unsaved drafts remain recoverable independently of disposable feed snapshots

### Requirement: Reconnecting saves drafts at their original versions

When connectivity returns while the app is active, mobile SHALL retry pending drafts for the current account, including notes whose screen has closed. Each attempt SHALL use the existing version-checked save. A newer server version SHALL enter the normal conflict flow without rebasing or overwriting. Conflicted drafts SHALL survive restarts and receive no automatic retries until explicitly resolved.

#### Scenario: Reconnection saves an unchanged server version

- **WHEN** connectivity returns and the server still holds a draft's base version
- **THEN** the draft saves through the normal body endpoint and its accepted version becomes the new baseline

#### Scenario: Another client saved first

- **WHEN** a pending mobile draft names version 4 and the web has saved version 5
- **THEN** mobile keeps the draft, names who saved last in the conflict notice, offers Reload, and sends no overwrite

#### Scenario: A conflict exists on a closed note

- **WHEN** reconnect saving conflicts after the user has left that note
- **THEN** the draft remains recoverable when the note reopens and does not retry in the background

#### Scenario: Reload fails

- **WHEN** the user chooses Reload but fetching the current note fails
- **THEN** the draft and conflict remain intact for another attempt

### Requirement: Acknowledgement never discards newer typing

A successful save SHALL clear only the local revision it acknowledges. Text typed during an in-flight save, including text typed after a conflict, SHALL remain recoverable. Ordered storage writes and account retirement SHALL prevent late writes or responses from restoring cleared drafts. Confirmed reload SHALL replace the discarded draft only after the current server body arrives.

#### Scenario: Typing continues during a successful save

- **WHEN** revision A is saving and the user types revision B
- **THEN** acknowledgement of A preserves B and advances B's next save to the acknowledged version

#### Scenario: Typing continues during a conflicting save

- **WHEN** revision A conflicts while the editor already contains revision B
- **THEN** B remains in the editor and durable draft, and neither revision is automatically sent again

#### Scenario: The server accepted a save but the response was lost

- **WHEN** mobile retries its old base version after an uncertain save result
- **THEN** the existing version check decides the result and the client never assumes a newer version is safe to overwrite

### Requirement: Session exit retires note drafts

Successful sign out, account deletion, session revocation, and account replacement SHALL stop old-account saves and remove that account's drafts and note state. Failed sign out or deletion SHALL retain recoverable work. Confirmed note deletion SHALL remove its draft. A missing or revoked note SHALL stop retries and hide inaccessible content; a transient request failure SHALL not delete a draft.

#### Scenario: A delayed write completes after sign out

- **WHEN** storage or a save response is pending during successful session exit
- **THEN** it cannot recreate the old account's draft or send it using a new account's session

#### Scenario: Account deletion succeeds but sign out fails

- **WHEN** deletion succeeds and the subsequent sign-out request fails
- **THEN** drafts are already cleared and deleted-account content stays hidden

#### Scenario: Deletion fails

- **WHEN** a note or account deletion is rejected
- **THEN** the current account's recoverable draft stays intact

#### Scenario: Permissions changed while offline

- **WHEN** reconnect reports the note missing or no longer editable
- **THEN** automatic saving stops; inaccessible content is hidden, and a remaining read-only grant never authorizes a write
