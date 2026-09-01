# note-badges Specification

## Purpose
TBD - created by archiving change add-note-badges. Update Purpose after archive.
## Requirements
### Requirement: A note has two separate unread counts

Every note the user may see SHALL report an unread edit count and an unread comment count as two
separate numbers. The unread edit count SHALL be one for a note whose content changed since the user
last read it and zero otherwise, so a note counts once however many times or by however many people it
was edited. The unread comment count SHALL be the number of comments written on the note since the
user last read it, excluding the user's own comments and excluding deleted ones.

#### Scenario: A note edited by a teammate counts one edit

- **WHEN** another user edits a note the user has already read, however many times
- **THEN** that note reports one unread edit, not one per edit and not one per editor

#### Scenario: Comments count individually

- **WHEN** two teammates write three comments between them on a note the user has already read
- **THEN** that note reports three unread comments, separately from its edit count

#### Scenario: A user's own writing never counts

- **WHEN** a user edits a note and writes a comment on it
- **THEN** that note reports no unread edit and no unread comment to that user

#### Scenario: A deleted comment stops counting

- **WHEN** a comment written since the user last read the note is deleted
- **THEN** it no longer counts toward that note's unread comments

### Requirement: Reading a note clears its counts

Opening a note SHALL record that the user has read it, taking both of that note's counts to zero.
A note SHALL record who edited it last, and an unread edit SHALL require that the last editor was
somebody else, so a writer is never badged for their own work. A note the user has never read and did
not write SHALL count as unread, with no backfill making old notes read as read.

#### Scenario: Opening a note clears it

- **WHEN** a user opens a note showing unread edits and comments
- **THEN** both of that note's counts go to zero and its badges stop showing

#### Scenario: The last editor is not badged for their own edit

- **WHEN** a user edits a note without having opened it in this session
- **THEN** that note reports no unread edit to that user, whatever their read time says

#### Scenario: A never-read note counts

- **WHEN** a user who has never opened a note, and did not write it, can see it
- **THEN** that note reports one unread edit

### Requirement: Counts obey note visibility

A count SHALL include only notes the requesting user may see, resolved by the same rules that gate
reading a note. A visitor SHALL be given no counts at all.

#### Scenario: A private note badges only its owner

- **WHEN** a user other than the owner loads a page holding an unread private note
- **THEN** that note contributes nothing to any count they are shown

#### Scenario: A visitor gets nothing

- **WHEN** a signed-out visitor loads a page that shows badges for a signed-in user
- **THEN** no note badge renders

### Requirement: Counts roll up to a page and its every mention

A page's unread count SHALL be the sum of the unread edit and comment counts of every note on it
the user may see. That sum SHALL show on the topic title, on the team title, on the profile, and
beside a team in the teams menu and the teams index.

#### Scenario: A topic title sums its notes

- **WHEN** a topic holds one note with an unread edit and another with two unread comments
- **THEN** the topic title shows a badge of three

#### Scenario: The teams menu shows a team's own sum

- **WHEN** a team holds notes with unread edits or comments
- **THEN** that team's option in the teams menu shows the sum beside the team's name

### Requirement: An unread badge is outline where a mention badge is filled

The note badge SHALL render outlined and the chat mention badge SHALL render filled, both through one
shared count pill so they match in size and shape. Where both appear for one page they SHALL sit
next to each other without changing the layout of the option or title holding them.

#### Scenario: The two badges sit together

- **WHEN** a page has both unread notes and chat mentions waiting
- **THEN** an outline note badge and a filled mention badge render side by side, matched in size and shape

#### Scenario: A count over nine is shortened

- **WHEN** a badge's count is more than nine
- **THEN** it reads "9+", the same way the mention badge already does

### Requirement: A note badge's tooltip names what is waiting

Hovering an unread note badge SHALL list what is waiting in it: each note by name, the topic or team
holding that note, and whether the note was edited, took comments, or both. The list SHALL fold to a
remaining count past the same number of lines the mention badge's tooltip lists.

#### Scenario: The tooltip names the note and its page

- **WHEN** a user hovers a badge covering a note edited on one topic and commented on in one team
- **THEN** each line names that note, the topic or team holding it, and what changed in it

#### Scenario: A long list folds

- **WHEN** more notes are waiting than the tooltip lists
- **THEN** the remaining ones read as a count on a final line

