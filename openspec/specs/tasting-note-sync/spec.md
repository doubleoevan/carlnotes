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
body, or the body on its way to the server. Closing the dialog SHALL send a pending save at once. A failed save SHALL
leave the body not saved and retry on the next change. A conflict SHALL stop every further save until the person
reloads. The schedule SHALL live in `packages/core` with no DOM dependency, behind a hook, so the mobile editor uses
it unchanged.

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

- **WHEN** the dialog closes while a save waits for the debounce
- **THEN** the save is sent at once

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

