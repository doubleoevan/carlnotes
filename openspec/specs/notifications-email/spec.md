# notifications-email Specification

## Purpose
One email a day tells a person what others wrote on their Topics, Findings, and Podcast Episodes, who reacted or
replied to their Comments, and where they were mentioned, and it is never sent on a day with nothing to tell.

## Requirements

### Requirement: A person gets at most one notifications email a day, and none on a quiet day

The sweep SHALL send each person at most one notifications email per UTC day, after a fixed UTC hour. It SHALL send
one only if that person has something to read since their last notifications email, or in the last 24 hours for a
first one. A person with nothing to read SHALL get no email.

#### Scenario: Two reactions make one email

- **WHEN** two users react to a Finding on a person's Topic during one day
- **THEN** that person gets one notifications email that names both

#### Scenario: A quiet day sends nothing

- **WHEN** nobody reacts to, comments on, replies to, or mentions a person for a day
- **THEN** no notifications email is sent to them

#### Scenario: A second sweep the same day sends nothing

- **WHEN** the sweep runs again after sending a person's email that day
- **THEN** it sends them nothing more, and what happens later that day is in the next day's email

#### Scenario: A failed send is retried

- **WHEN** the mailer rejects a person's notifications email
- **THEN** the next sweep that day sends it, with nothing left out

### Requirement: The email covers reactions, comments, replies, and mentions

The email SHALL include the Reactions and Comments that other people wrote on the social targets of Topics the
person owns, the Reactions and replies on the person's own Comments, and the Comments that mention the person. Every
link in it SHALL open a CarlNotes page. Its copy SHALL say reaction, hot take, and reply.

#### Scenario: A reply reaches the Comment's author

- **WHEN** a user replies to a person's Comment on someone else's public Topic
- **THEN** that person's email quotes the reply with a link to the Topic's page

#### Scenario: A Reaction on a Comment reaches its author

- **WHEN** a user presses Love on a person's Comment
- **THEN** that person's email lists the Reaction with its type and their Comment, and quotes no new text

#### Scenario: A Comment on a Podcast Episode is included

- **WHEN** a follower comments on a Podcast Episode of a person's Topic
- **THEN** the person's email names the Podcast Episode and quotes the Comment, with a link to the Podcast Episode's
  page

#### Scenario: A mention on someone else's Topic is included

- **WHEN** a Comment on another person's public Topic mentions a user
- **THEN** that user's email quotes the Comment with a link to that Topic's page

### Requirement: The email leaves out what its recipient should not read

The email SHALL leave out the recipient's own Reactions and Comments, anything from an author in a block with the
recipient in either direction, anything from an author under an admin block, anything deleted before the send, and a
mention or a reply on a Topic the recipient may no longer open. It SHALL name a Finding only if the recipient may see
that Finding.

#### Scenario: A blocked author is left out

- **WHEN** a person the recipient blocked comments on the recipient's Topic
- **THEN** the email does not quote or count that Comment, and no email is sent if it was the day's only activity

#### Scenario: A deleted Comment is not mailed

- **WHEN** a Comment is deleted before that day's send
- **THEN** the email does not quote or count it

#### Scenario: A Finding the recipient may not see is not named

- **WHEN** a Comment that mentions the recipient hangs on a Finding the recipient may not see
- **THEN** the email does not name that Finding

### Requirement: Quoted text is escaped, shortened, and never a link

The email SHALL quote at most ten texts, each escaped, cut to 140 characters, and with every url in it written so
that a mail client does not turn it into a link. It SHALL count the remainder. A mention's quote SHALL hold no more
than the Comment's first line, cut and escaped the same way.

#### Scenario: A url in a Comment is not a link

- **WHEN** a quoted Comment holds a url
- **THEN** the email shows it as text that no mail client links

#### Scenario: Markup in a Comment shows as text

- **WHEN** a quoted Comment holds an html tag
- **THEN** the email shows the characters and renders no element from them

#### Scenario: A busy day is summarized

- **WHEN** a person's day holds 14 Comments
- **THEN** the email quotes ten and says four more are waiting

#### Scenario: A mention quotes the first line alone

- **WHEN** a Comment of three lines mentions a person
- **THEN** that person's email quotes the first line and none of the other two

### Requirement: The email is a template in Carl's voice

The email SHALL be a template in the emails package with fixed lines in Carl's voice. No model SHALL read the quoted
text or write any part of the email. The copy SHALL never tell the person what they missed or ask them to come back.

#### Scenario: An email is built with no model call

- **WHEN** the sweep builds a person's notifications email
- **THEN** no model call is made and no spend is recorded

### Requirement: A per-user switch and an unsubscribe link turn the email off

Each user SHALL have a notifications email switch, off by default, on the account page of both apps. The email SHALL
include an unsubscribe link and a one-click unsubscribe header, signed for that user, that turn the switch off. A
user whose switch is off SHALL get no notifications email.

#### Scenario: The email is off until the user turns it on

- **WHEN** a user who never changed the switch has a comment on their Topic
- **THEN** the account page shows the switch off and no notifications email is sent to them

#### Scenario: The switch stops the email

- **WHEN** a user turns the switch off and someone then comments on their Topic
- **THEN** no notifications email is sent to them

#### Scenario: The unsubscribe link turns the switch off

- **WHEN** a user follows the email's unsubscribe link
- **THEN** their switch is off and the account page shows it off, with their Topic emails unchanged

#### Scenario: A forged unsubscribe token changes nothing

- **WHEN** a request sends an unsubscribe token whose signature does not verify
- **THEN** no switch changes

### Requirement: The email covers Topic Posts

The email SHALL include the Reactions and Comments that other people wrote on the person's own Topic Posts, beside
those on the Topic Posts of Topics the person owns. Each such line SHALL name the Topic Post by its title and link to
its page. A line SHALL show once, even if the person both owns the Topic and wrote the Topic Post.

#### Scenario: A Comment on a member's post reaches the member

- **WHEN** a follower comments on a Topic Post that a team member published on someone else's Topic
- **THEN** the member's email names the Topic Post and quotes the Comment, with a link to the Topic Post's page

#### Scenario: An owner who wrote the post gets one line

- **WHEN** a follower comments on a Topic Post that the Topic's owner published
- **THEN** the owner's email holds that Comment once
