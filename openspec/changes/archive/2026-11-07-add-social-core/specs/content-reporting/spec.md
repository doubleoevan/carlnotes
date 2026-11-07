# Spec Delta

## ADDED Requirements

### Requirement: A Finding, a Podcast Episode, and a Comment are reportable

A Finding, a Podcast Episode, and a Comment, top-level or a reply, SHALL each show a Report issue action to a
signed-in user who can read it. A report of one SHALL be stored and mailed as every report is. A Reaction SHALL NOT
be reportable, since it holds no words. A reported Comment SHALL stay in its reporter's reads, on both apps, with its
flag filled on the row from the moment the report is sent.

#### Scenario: A Comment is reported from its row

- **WHEN** a signed-in user reports a Comment on a public Topic
- **THEN** the report is stored with the Comment's text and author, and the email reaches the moderation address

#### Scenario: A reported Comment stays with its reporter

- **WHEN** a signed-in user reports a Comment
- **THEN** the Comment stays in the thread they reported it from, its flag fills at once, and the flag is still filled
  after a reload, whichever way an admin resolved the report

#### Scenario: A Finding is reported

- **WHEN** a signed-in user reports a Finding on a Topic they can open
- **THEN** the report is stored with the Finding's title, and the Finding stays in the reporter's feed

#### Scenario: A reaction row offers no Report issue

- **WHEN** a user opens a reaction row
- **THEN** no Report issue action is offered on it

#### Scenario: A subject the user cannot read is rejected

- **WHEN** a report names a Comment on a Topic the sender may not open
- **THEN** it is rejected in the same words as for a subject that does not exist

### Requirement: An admin removes a reported Comment

Remove in the Reports view SHALL delete a reported Comment for everyone, through the delete its Topic's owner uses,
and SHALL close the report as removed. A report of a Finding or a Podcast Episode SHALL offer Clear and Block and no
Remove.

#### Scenario: An admin removes a reported Comment

- **WHEN** an admin chooses Remove on a reported Comment
- **THEN** the Comment is deleted for everyone and the report closes as removed

### Requirement: The Reports view blocks a reported subject's author

The Reports view SHALL offer Block on a report whose subject has an author. Block SHALL set an admin block on that
author, SHALL delete the subject if its kind is removable, and SHALL close the report as blocked, recording who chose
it and when. Like Remove and Clear, it SHALL act only on a POST from a signed-in admin, and opening the report's link
SHALL change nothing.

#### Scenario: Block closes the report and hides the author

- **WHEN** an admin chooses Block on a reported Comment
- **THEN** the Comment is deleted, its author is under an admin block, and the report closes as blocked

#### Scenario: Opening the link changes nothing

- **WHEN** a mail scanner or an admin opens the report's link from the email
- **THEN** no content is deleted, no user is blocked, and the report stays open

### Requirement: The Reports view confirms each resolution

Remove, Block, and Clear SHALL each open a confirmation saying what that resolution does, and SHALL send nothing until
the admin confirms it. Clear SHALL close the report as cleared and leave the content in place.

#### Scenario: Cancelling a confirmation changes nothing

- **WHEN** an admin chooses Block on a report and then cancels the confirmation
- **THEN** no content is deleted, no user is blocked, and the report stays open

### Requirement: The report option shows the user's own report

The Report issue option on a page menu, the share menu, a Finding, and a Comment SHALL show a filled primary flag if
the signed-in user holds a report of that subject, however an admin resolved it. Only the user who sent a report SHALL
be able to read that state.

#### Scenario: The flag fills after a report

- **WHEN** a signed-in user sends a report of a Topic, team, profile, Podcast Episode, or Finding
- **THEN** the subject's Report issue flag shows filled in primary, and still does after a reload

#### Scenario: A visitor reads no report state

- **WHEN** a request without a session asks whether a subject was reported
- **THEN** the api responds 401

### Requirement: A user removes their own report

Pressing a filled flag SHALL remove the user's report, empty the flag, and confirm the removal, with no dialog. A
removed open report SHALL leave the admin queue. A removed resolved report SHALL keep its resolution.

#### Scenario: Pressing a filled flag removes the report

- **WHEN** a signed-in user presses the filled flag of a subject they reported while the report is open
- **THEN** a toast on web and an alert on mobile confirm the removal, the report leaves the admin queue, and the flag
  empties and still reads empty after a reload

### Requirement: Changed text reopens a cleared report

A repeat report of a cleared subject SHALL reopen that report with the new text and mail it again if the text differs
from what the admin cleared, and SHALL otherwise send nothing to the admins. Clearing SHALL drop the text and keep a
keyed hash of it. A report cleared before the hash existed SHALL stay closed. A report resolved as removed or blocked
SHALL stay closed.

#### Scenario: Changed text reopens a cleared report

- **WHEN** an admin cleared a user's report, the subject's text changed, and the user reports it again
- **THEN** the report is open again with the new text and the reason just sent, and the email reaches the moderation
  address

#### Scenario: Unchanged text stays cleared

- **WHEN** an admin cleared a user's report and the user reports the same text again, with or without removing the
  report first
- **THEN** no report opens, no email is sent, and the flag fills

### Requirement: The Reports view scrolls long text in its row

The Reports view SHALL limit a report's text and reason to a fixed height, and SHALL scroll longer text inside its cell.

#### Scenario: A long Topic prompt scrolls

- **WHEN** a reported subject's text is taller than the limit
- **THEN** the row stays at the limited height and the text scrolls inside its cell

### Requirement: The admin console filters to the blocked users

The admin console's Blocks card SHALL count the users under an admin block. The card SHALL be a toggle: pressing it
SHALL highlight the card and limit the Users table to those users, where an admin clears a block, and pressing it again
SHALL remove the highlight and the filter.

#### Scenario: The Blocks card filters the Users table

- **WHEN** an admin presses the Blocks card
- **THEN** the card is highlighted and the Users table lists only the users under an admin block

#### Scenario: Pressing the Blocks card again clears the filter

- **WHEN** an admin presses the highlighted Blocks card
- **THEN** the highlight is gone and the Users table lists every user

### Requirement: An admin's badges count the open reports

The Admin menu item and the Admin page's title SHALL show the open report count, and the menu trigger's badge SHALL
include it in its total. Only an admin's session SHALL read the count.

#### Scenario: Two reports wait for an admin

- **WHEN** two reports are open and an admin has no other updates
- **THEN** the Admin menu item, the Admin page's title, and the menu trigger's badge each show 2

#### Scenario: A signed-in user who is not an admin

- **WHEN** a user who is not an admin signs in
- **THEN** the app does not read the open report count, and `GET /api/admin/reports/count` rejects the user with a 403

### Requirement: A report email never turns quoted text into a link

The report email and its reminder SHALL show the subject's text escaped and SHALL write every url in it so that a
mail client does not turn it into a link. The email's only links SHALL open the admin console and CarlNotes pages.

#### Scenario: A url in a reported Comment is not a link

- **WHEN** a reported Comment holds a url
- **THEN** the email shows the url as text that no mail client links
