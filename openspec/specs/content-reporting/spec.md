# content-reporting Specification

## Purpose
TBD - created by archiving change social-profiles-and-sharing. Update Purpose after archive.

## Requirements

### Requirement: The flag control is the whole moderation surface while no free-text content exists

The flag control is no longer the whole moderation surface. Chat room messages, notes, and note comments are
user-authored prose that other users read, so a report SHALL be stored, SHALL hide its subject from the reporter at
once, SHALL reach the admin by email with a link into the admin console, and SHALL be resolved in the admin console's
Reports view by removing the content or keeping it. No appeal path is built here. A removal tells the author nothing
beyond the content being gone.

#### Scenario: No moderation queue is introduced

- **WHEN** a report is submitted
- **THEN** it is stored as an open report, delivered as email, and listed in the admin console's Reports view, which
  is the one place a report is resolved, with no appeal flow

#### Scenario: A free-text field raises the bar

- **WHEN** a user-authored free-text field readable by other users ships
- **THEN** it is a reportable subject kind, its text is classified before it posts, and its author can be blocked, so
  the moderation surface holds without being revisited per field

### Requirement: Topics and profiles carry a flag control routed to the admin inbox, with a daily flag limit

A Topic a reader can open, a public profile, a Team a reader can open, a chat room message, a note, and a note
comment SHALL each show a report control where the reader sees them. A submitted report SHALL be stored with its
subject, the subject's author, the reporter, the reason if the reporter gave one, and the subject's text at the time
of the report, and SHALL be delivered over the existing Resend sender to the address `SUPPORT_EMAIL` names, including
enough to identify what was reported and who reported it. Only a signed-in reader may report, so every report names an account, and each
account SHALL be limited to a fixed number of reports over a rolling day. The count SHALL live in Redis through the
Redis store's fixed-window counter, keyed by the account, with the day starting at the account's first report, so
every api replica counts against one window and a deploy does not reset it. A report the mailer rejects SHALL keep its
stored row and give its slot back. While Redis is unreachable the counter counts in each replica's memory, so an
account is bounded at the limit per replica and a report inside the limit is still accepted.

Whether a subject may be reported SHALL be decided by the same visibility rule that decides whether it may be read: a
Topic by the Topic view rule, a Team by its membership or public state, a profile by the username existing, a chat room
message by the room's access rule, and a note or note comment by the note's view rule. Anything a reader can be shown,
a reader can report.

#### Scenario: Flagging a Topic reaches the moderation address

- **WHEN** a reader reports a Topic they can open
- **THEN** an email reaches the moderation address identifying that Topic, and the report is stored

#### Scenario: An invited reader may flag an invite Topic

- **WHEN** a reader who was invited to an invite Topic reports it
- **THEN** the report is accepted and reaches the moderation address

#### Scenario: The daily limit rejects further flags

- **WHEN** an account submits a report after reaching its daily limit
- **THEN** the report is rejected with an answer naming the limit, nothing is stored, and nothing is mailed

#### Scenario: The limit holds across replicas

- **WHEN** an account's reports are split across two api processes inside one day
- **THEN** the reports past the limit are rejected whichever process receives them

#### Scenario: A rejected send gives the slot back

- **WHEN** the mailer rejects a report
- **THEN** the report stays stored and open, and the account's count is one lower, so the failed send does not count
  toward the limit

#### Scenario: Flagging a profile reaches the moderation address

- **WHEN** a reader reports a public profile
- **THEN** an email reaches the moderation address identifying that profile

#### Scenario: A subject the reader could not have seen is refused

- **WHEN** a report names a Topic, Team, note, comment, or room message the sender cannot see, or a subject that does
  not exist
- **THEN** the report is rejected in the same words for every one of those cases, disclosing nothing about which it
  was

#### Scenario: Redis down bounds one replica

- **WHEN** Redis is unreachable and an account submits more reports than the daily limit to one replica
- **THEN** the reports past the limit are rejected, and the ones inside it are stored and mailed

#### Scenario: A room message is reported from its bubble

- **WHEN** a member of a chat room reports one of its messages
- **THEN** the report is stored with the message's text and author, and the email names the room and the author

#### Scenario: A note comment is reported from its thread

- **WHEN** a reader who can see a note reports one of its comments
- **THEN** the report is stored with the comment's text and author, and the email names the note and the author

### Requirement: A reported subject is hidden from its reporter at once

From the moment a report is accepted, the reporter SHALL no longer see its subject: a reported room message leaves the
reporter's transcript and live events, a reported note comment leaves the reporter's thread, and a reported note
leaves the reporter's note lists and opens as unavailable. The hiding SHALL apply on every later load and on both
apps. Other readers SHALL see the subject unchanged until an admin removes it.

#### Scenario: A reported message disappears for the reporter

- **WHEN** a member reports a room message and the room reloads or receives a live event for it
- **THEN** the message is absent for the reporter and present for every other member

#### Scenario: A reported note stays for others

- **WHEN** a reader reports a note on a topic page
- **THEN** the note is absent from the reporter's list, and the note's owner and other readers still see it

### Requirement: The report email identifies the content and links into the admin console

The report email SHALL be a template in the emails package and SHALL include the subject kind, the subject's text at
the time of the report, the subject's author, the reporter, the reason, and a link to the report in the admin console.
The link SHALL carry no token: the admin console's own session check authorizes it, so a forwarded email grants
nothing.

#### Scenario: The admin opens the report from the email

- **WHEN** a signed-in admin follows the email's link
- **THEN** the admin console opens on that report, with its text, author, reporter, reason, and actions

#### Scenario: A non-admin follows the link

- **WHEN** someone without the admin role follows the email's link
- **THEN** the console is rejected through the existing gate and nothing about the report is shown

### Requirement: The admin console lists open reports and resolves each one

The admin console SHALL show a Reports view listing open reports newest first, each with its subject kind, the
content's text, links to the content and to the author's and reporter's profiles, the reason, and its age, and SHALL
offer Remove, which deletes the content through the same path its author or a leader would use, and Keep, which
closes the report and unhides nothing. A resolved report SHALL record who resolved it, when, and how.

#### Scenario: An admin removes a reported message

- **WHEN** an admin chooses Remove on a reported room message
- **THEN** the message is deleted for everyone through the room's delete path, and the report closes as removed

#### Scenario: An admin keeps reported content

- **WHEN** an admin chooses Keep on a report
- **THEN** the report closes as kept, the content stays for everyone else, and it stays hidden for the reporter

#### Scenario: The removed content's report cannot be acted on twice

- **WHEN** a report's content was already deleted by its author before an admin resolves it
- **THEN** the report shows the content as already gone and closes on Keep or Remove without error

### Requirement: The admin header counts open reports, and mobile keeps the web hand-off

The admin console's header SHALL show the count of open reports on every signed-in admin load, and the mobile app
SHALL keep handing its Admin entry off to the web console rather than adding a native reports screen.

#### Scenario: The count shows the backlog

- **WHEN** an admin signs in with three reports open
- **THEN** the console header shows three, and resolving one lowers it to two on the next load

#### Scenario: Mobile opens the web console

- **WHEN** an admin chooses Admin in the mobile user menu
- **THEN** the web console opens in the browser, as it does today

### Requirement: An open report is answered within a day, and the sweep reminds the inbox

The operator named by `SUPPORT_EMAIL` SHALL own reports, with a response within one day of the report as the target.
The sweep SHALL send one reminder email for each report still open twelve hours after it was made, naming the report
and linking into the console, and SHALL never send a second reminder for the same report.

#### Scenario: A report left open gets one reminder

- **WHEN** a report is still open twelve hours after it was made
- **THEN** the next sweep mails one reminder for it, and later sweeps mail nothing for it

#### Scenario: A resolved report gets no reminder

- **WHEN** a report is resolved before twelve hours pass
- **THEN** no reminder is sent for it

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
