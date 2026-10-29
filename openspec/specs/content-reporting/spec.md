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
