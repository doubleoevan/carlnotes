# Spec Delta

## Purpose

A Topic, a Podcast Episode, and a Finding each have one thread of Comments that signed-in users write and anyone who
can open the page reads. A Comment takes replies and reactions, and a Topic's editors share chosen Comments with Carl
and Vienna. Customer copy calls a Comment a hot take.

## ADDED Requirements

### Requirement: A social target has one comment thread

A Comment SHALL name exactly one social target: a Topic, a Podcast Episode, a Finding, or a post. A Comment SHALL
never hang on another Comment as its target. A user SHALL be able to write any number of Comments on one social
target. A thread SHALL never show on a Team's page.

#### Scenario: One user writes twice

- **WHEN** a user posts two Comments on the same Topic
- **THEN** the thread holds both as separate entries

#### Scenario: A thread on a Comment is rejected

- **WHEN** a request reads or posts a thread whose social target is a Comment
- **THEN** it is rejected as a validation error

#### Scenario: A Team page has no thread

- **WHEN** a member opens a Team's page
- **THEN** it shows the Team's chat room and no comment thread

### Requirement: A reply joins a top-level Comment, one level deep

A Comment SHALL be able to name a parent Comment on the same social target, which makes it a reply. A parent on
another social target SHALL be rejected as not found, as a missing parent is. A reply's parent SHALL always be a
top-level Comment: a reply to a reply SHALL be stored under that reply's parent. A thread SHALL show one reply level.
Deleting a top-level Comment SHALL delete its replies.

#### Scenario: A reply shows under its Comment

- **WHEN** a user presses Reply on a Comment and posts
- **THEN** the reply shows under that Comment, indented one level

#### Scenario: A reply to a reply stays at one level

- **WHEN** a user replies to a reply
- **THEN** the new reply is stored under the first reply's top-level Comment and shows at the same level

#### Scenario: A parent on another social target is rejected

- **WHEN** a post on a Topic's thread names a parent Comment that hangs on a Finding
- **THEN** it is rejected as not found, as a missing parent is, and nothing is stored

#### Scenario: Deleting a Comment deletes its replies

- **WHEN** an author deletes a top-level Comment that has three replies
- **THEN** the Comment and the three replies are gone for everyone

### Requirement: A Comment is plain text of up to 2,000 characters

A Comment's body SHALL be plain text of 1 to 2,000 characters and SHALL keep its line breaks. A Comment SHALL show as
soon as it is posted, with no approval step and no confirmation dialog.

#### Scenario: A Comment posts at once

- **WHEN** a signed-in user posts a Comment on a public Topic
- **THEN** it is the first entry in the thread on the next read

#### Scenario: A super long Comment scrolls

- **WHEN** a thread shows a Comment over 1,000 characters
- **THEN** its body scrolls inside a bounded box with the highlighted scrollbar, and a shorter Comment shows in full

#### Scenario: A body past the limit is rejected

- **WHEN** a post holds 2,001 characters
- **THEN** it is rejected as a validation error and nothing is stored

### Requirement: A Comment stores the users it mentions

Each `@username` in a posted Comment that names an existing user SHALL be stored as a mention holding that user and
the name as written. A read SHALL return the mentions, and the thread SHALL link each one to that user's profile. A
name that matches no user SHALL stay plain text.

#### Scenario: A mention links to the user

- **WHEN** a Comment holds `@roastfan` and a user has that username
- **THEN** the thread shows `@roastfan` as a link to that user's profile

#### Scenario: A renamed user keeps the link

- **WHEN** a mentioned user changes their username after the Comment was posted
- **THEN** the Comment still shows the name as written, linking to the same user's profile

#### Scenario: An unknown name is plain text

- **WHEN** a Comment holds `@nobodyhere` and no user has that username
- **THEN** it shows as text with no link

### Requirement: Mention suggestions return usernames only

The mention suggestions SHALL be offered to a signed-in user only and SHALL return at most eight users by username
prefix, each as its id, username, and avatar. They SHALL leave out a user in a block with the caller in either
direction.

#### Scenario: A prefix suggests usernames

- **WHEN** a signed-in user types `@roa` in the composer
- **THEN** up to eight usernames starting with `roa` are suggested, with no email address or other account detail

#### Scenario: A visitor gets no suggestions

- **WHEN** a request with no session asks for suggestions
- **THEN** it is rejected

### Requirement: A Comment on a Podcast Episode may name a chapter

A Comment on a Podcast Episode SHALL be able to name one of that Podcast Episode's chapters by its position, and the
thread SHALL show that chapter's tag on the Comment. A Comment on any other social target SHALL name no chapter. A
chapter position SHALL have a maximum.

#### Scenario: A Comment names a chapter

- **WHEN** a user posts a Comment on a Podcast Episode and picks its third chapter
- **THEN** the Comment shows the third chapter's tag, and pressing the tag plays from that chapter

#### Scenario: A chapter on a Topic's thread is rejected

- **WHEN** a post on a Topic's thread names a chapter
- **THEN** it is rejected as a validation error

#### Scenario: A chapter position past the maximum is rejected

- **WHEN** a post names a chapter position past the maximum
- **THEN** it is rejected as a validation error and nothing is stored

### Requirement: A Comment is editable for 15 minutes

A Comment's body SHALL be editable by its author for 15 minutes from its creation, and an edit SHALL NOT extend that
time. An edit after it SHALL be rejected with a conflict. An edit SHALL need `social:post`, as a post does, and SHALL
store the mentions of the new body. A read SHALL tell the client whether the caller wrote the Comment and whether it
is still editable.

#### Scenario: Edit stays visible past the edit time

- **WHEN** the author's Comment is past its edit time
- **THEN** its Edit shows disabled, with a tooltip on the web and a dialog on tap in the mobile app that gives the limit

#### Scenario: An edit inside the time is saved

- **WHEN** an author changes their Comment ten minutes after posting it
- **THEN** the thread shows the new body

#### Scenario: An edit after the time is rejected

- **WHEN** an author sends an edit 16 minutes after posting
- **THEN** it is rejected with a conflict and the body is unchanged

#### Scenario: A moderator sees no Edit

- **WHEN** a Topic's owner reads another person's Comment
- **THEN** the Comment offers Delete and no Edit, enabled or disabled

### Requirement: Posting needs an account and reading follows the social target

Only a signed-in user who may open the social target SHALL post a Comment or a reply on it. Anyone who may open the
social target, a visitor included, SHALL read its thread.

#### Scenario: A visitor reads a public thread

- **WHEN** a visitor opens a public Topic
- **THEN** the thread shows, and pressing its button or Reply opens sign-up

#### Scenario: A thread on an invite Topic is readable by its invited users only

- **WHEN** a user without access asks for an invite Topic's thread
- **THEN** the request is rejected in the same words as for a Topic that does not exist

#### Scenario: A Finding rated thumbs down has no thread

- **WHEN** a link or a Podcast Episode chapter opens a Finding rated thumbs down
- **THEN** its details show no thread, and asking for the thread is rejected as for a Finding that does not exist

### Requirement: The author, the Topic's owner, and an admin delete a Comment

A Comment SHALL be deletable by its author, by the owner of the Topic its social target belongs to, and by an admin,
on a Finding rated thumbs down too. Nobody else SHALL delete it, and no automated process SHALL delete one for its
content. A Comment SHALL be deleted with its social target, with its author's account, and with a Podcast Episode that
is removed. Reply, Edit, and Delete SHALL be buttons under the row's body, and Delete SHALL ask for confirmation first.

#### Scenario: A delete waits for confirmation

- **WHEN** a user presses Delete on a Comment and cancels the confirmation
- **THEN** the Comment stays

#### Scenario: A Topic's owner deletes a Comment on a Podcast Episode

- **WHEN** a Topic's owner deletes another person's Comment on one of the Topic's Podcast Episodes
- **THEN** the Comment, its mentions, and its reactions are gone for everyone

#### Scenario: Another user cannot delete it

- **WHEN** a user who is neither the author, the Topic's owner, nor an admin sends the delete
- **THEN** it is rejected and the Comment stays

#### Scenario: A Comment on a Finding rated thumbs down can be deleted

- **WHEN** the author, the Topic's owner, or an admin deletes a Comment on a Finding rated thumbs down
- **THEN** the Comment is gone

### Requirement: A Comment with no author is Carl's

A Comment that names no author SHALL show under Carl's name with no profile link. Nothing in this capability writes
one.

#### Scenario: A Comment with no author shows as Carl's

- **WHEN** a thread holds a Comment that names no author
- **THEN** it shows Carl's name and no profile link, and offers no report of an author

### Requirement: A thread reads newest first in pages of 20, with replies oldest first

A thread SHALL be read as its top-level Comments, newest first, in pages of exactly 20 with a cursor for the next
page. Each top-level Comment SHALL include its reply count and its first three replies, oldest first. The remaining
replies SHALL be read in pages, oldest first. Each Comment and reply SHALL include its reaction summary, its parent,
and whether it is shared with Carl.

#### Scenario: Older Comments are paged

- **WHEN** a thread holds 45 top-level Comments
- **THEN** the first read returns the newest 20 and a cursor, and two more reads return the remaining 25

#### Scenario: A Comment comes with its first replies

- **WHEN** a Comment has five replies
- **THEN** the thread read returns it with a reply count of 5 and its three oldest replies

#### Scenario: More replies are paged

- **WHEN** a user asks for the rest of that Comment's replies
- **THEN** the read returns the two newer replies, oldest first

#### Scenario: A reply does not count as a page entry

- **WHEN** a thread holds 20 top-level Comments and 60 replies
- **THEN** the first read returns all 20 top-level Comments and no cursor

### Requirement: A thread shows five Comments at first

A thread SHALL show its five newest top-level Comments at first. The toggle under the card SHALL say how many loaded
Comments are hidden, show them when pressed, and read the next page ahead. With every Comment shown it SHALL offer
show less, which returns to the first five.

#### Scenario: A long thread starts short

- **WHEN** a thread with seven top-level Comments opens
- **THEN** five show with + 2 more under the card, a press shows all seven, and show less returns to five

### Requirement: A Topic's and a Podcast Episode's first page renders on the server

The server render of a public Topic's page and of a public Podcast Episode's page SHALL include the first page of
its thread in the html. A Finding's thread SHALL load as the Finding's details open.

#### Scenario: A public Topic's html holds its newest Comments

- **WHEN** a request with no session asks for a public Topic's page that has Comments
- **THEN** the html holds the newest Comments' text and their authors' usernames

#### Scenario: A new Comment reaches a visitor inside the page's edge time

- **WHEN** a user posts a Comment on a public Topic
- **THEN** a visitor's page shows it once the edge's shared copy of the page is replaced, with no purge sent

#### Scenario: A Finding's thread loads with its details

- **WHEN** a user opens a Finding's details
- **THEN** the thread's first page is fetched and shown under the Hot takes heading

### Requirement: A Topic's editor shares a Comment with Carl and Vienna

A Comment SHALL hold the time it was shared with Carl, or none, and a read SHALL derive whether it is shared from
that time. Only a user who may edit the Comment's Topic, by `topic:edit`, SHALL share or unshare it. Any Comment, a
reply included, SHALL be shareable, except that a Comment on a Finding rated thumbs down SHALL NOT be newly shared. An
editor SHALL still be able to unshare one. Unsharing SHALL clear the time. Sharing a Comment again SHALL be a new
share.

#### Scenario: An editor shares a follower's Comment

- **WHEN** a Topic's owner presses the share toggle on a follower's Comment with a shared comment slot free
- **THEN** the Comment is shared, and the next read of the thread says so to everyone

#### Scenario: A team member of the owning Team shares

- **WHEN** a member of the Team that owns the Topic presses the share toggle
- **THEN** the Comment is shared

#### Scenario: A follower cannot share

- **WHEN** a user who may not edit the Topic sends the share request for their own Comment
- **THEN** it is rejected and the Comment stays unshared

#### Scenario: Unsharing clears the share

- **WHEN** an editor presses the toggle on a shared Comment
- **THEN** the Comment is no longer shared and a shared comment slot it held is free

#### Scenario: A Comment on a Finding rated thumbs down can be unshared

- **WHEN** an editor unshares a shared Comment on a Finding rated thumbs down
- **THEN** the Comment is no longer shared

#### Scenario: A Comment on a Finding rated thumbs down cannot be newly shared

- **WHEN** an editor shares an unshared Comment on a Finding rated thumbs down
- **THEN** it is rejected and the Comment stays unshared

### Requirement: A Topic has 3 or 5 shared comment slots for the next Podcast Episode

A Topic SHALL have 5 shared comment slots if its owner gets full Podcast Episodes and 3 otherwise. A shared Comment
SHALL hold a shared comment slot until a Podcast Episode's script reads it, except while it is left out. A share with no
free shared comment slot SHALL be rejected with a conflict and SHALL change nothing. A thread read SHALL include the
used and total shared comment slot counts only for a user who may edit the Topic.

#### Scenario: A free plan's Topic has 3 shared comment slots

- **WHEN** an owner on the free plan shares three Comments and then a fourth
- **THEN** the first three are shared and the fourth is rejected with a conflict

#### Scenario: A paid plan's Topic has 5 shared comment slots

- **WHEN** an owner on Plus shares five Comments across the Topic, two of its Findings, and one Podcast Episode
- **THEN** all five are shared and the count reads 5 of 5

#### Scenario: Two shares at once do not pass the limit

- **WHEN** two editors each share a different Comment with one shared comment slot free
- **THEN** one share succeeds and the other is rejected with a conflict

#### Scenario: The shared comment slots free up once the script reads

- **WHEN** a Podcast Episode's script reads a Topic's three shared Comments
- **THEN** the count reads 0 of 3, and the three Comments stay shared

#### Scenario: A follower reads no shared comment slot count

- **WHEN** a follower reads the thread
- **THEN** the response holds no shared comment slot count

### Requirement: A shared Comment is left out while its Finding is rated down or its author is blocked

A shared Comment SHALL be left out while its Finding is rated thumbs down, while its author is under an admin block,
or while its author is in a block with the Topic's owner. While left out it SHALL hold no shared comment slot, and it
SHALL stay out of Carl's scoring context, the podcast script, the Topic's shared Comments list, and a Scan's link queue.
It SHALL stay shared, and it SHALL return to each of them once none of those holds.

#### Scenario: A rating of thumbs down frees the shared comment slot

- **WHEN** a Finding that holds a waiting shared Comment is rated thumbs down
- **THEN** the used shared comment slot count is one lower, and the Comment is out of the scoring context, the podcast
  script, the shared Comments list, and the link queue

#### Scenario: A blocked author's shared Comment is left out

- **WHEN** a shared Comment's author comes under an admin block, or into a block with the Topic's owner
- **THEN** the Comment holds no shared comment slot and is out of the scoring context, the podcast script, the shared
  Comments list, and the link queue

#### Scenario: A left-out Comment returns

- **WHEN** the rating changes or the block is cleared
- **THEN** the Comment holds a shared comment slot again and returns to the scoring context, the podcast script, the
  shared Comments list, and the link queue

### Requirement: An editor's own Comment starts shared

A Comment or a reply posted by a user who may edit the Topic SHALL be shared if a shared comment slot is free, unless
the composer's share switch is off. The switch SHALL show only to a user who may share, and SHALL start on, or on an
edit from the Comment's share. A post with no share choice SHALL share a top-level Comment and not a reply. A Comment by
anyone else SHALL start unshared, whatever its post asks.

#### Scenario: The owner's Comment starts shared

- **WHEN** a Topic's owner posts a top-level Comment with a shared comment slot free
- **THEN** the Comment is shared and the used shared comment slot count is one higher

#### Scenario: The owner turns the share off

- **WHEN** a Topic's owner turns off the composer's share switch and posts a top-level Comment with a shared comment
  slot free
- **THEN** the Comment is not shared and the shared comment slot count is unchanged

#### Scenario: A follower never sees the switch

- **WHEN** a user who may not share opens the composer
- **THEN** the composer shows no share switch, and a post that asks to share is posted unshared

#### Scenario: The owner's reply starts shared

- **WHEN** a Topic's owner posts a reply through the composer with a shared comment slot free and the switch on
- **THEN** the reply is shared and the used shared comment slot count is one higher

#### Scenario: The switch with no shared comment slot free

- **WHEN** an editor opens the composer with no shared comment slot free
- **THEN** the switch is off and disabled and says the next podcast episode is full, unless the edited Comment already
  holds a shared comment slot

#### Scenario: An edit takes a share back

- **WHEN** an editor turns off the switch while editing a waiting shared Comment and saves
- **THEN** the words are saved, the Comment is not shared, and the used shared comment slot count is one lower

#### Scenario: An aired Comment stays shared on an edit

- **WHEN** an editor edits a Comment that has aired
- **THEN** the switch is on and disabled, and the Comment stays shared

#### Scenario: A reply with no share choice starts unshared

- **WHEN** a Topic's owner posts a reply from an AI app, which sends no share choice
- **THEN** the reply is not shared and the shared comment slot count is unchanged

#### Scenario: The owner's Comment at the limit starts unshared

- **WHEN** a Topic's owner posts a top-level Comment with no shared comment slot free
- **THEN** the Comment is posted unshared

### Requirement: An author who may not edit the Topic takes a waiting share back by editing

An edit by an author who may not edit the Topic SHALL clear a waiting share and the Comment's queued links until an
editor shares the Comment again. An editor's edit SHALL keep the share. An aired Comment SHALL stay aired.

#### Scenario: An author's edit clears a waiting share

- **WHEN** a follower edits their own Comment while it waits shared
- **THEN** the Comment is not shared, the used shared comment slot count is one lower, and its queued links are gone

#### Scenario: An editor shares the edited Comment again

- **WHEN** an editor presses the toggle on that Comment
- **THEN** the Comment is shared again, with one queued link per url in its new body

#### Scenario: An editor's edit keeps the share

- **WHEN** a user who may edit the Topic edits a waiting shared Comment and leaves the switch on
- **THEN** the Comment stays shared and the shared comment slot count is unchanged

#### Scenario: An aired Comment stays aired on its author's edit

- **WHEN** a follower edits their own Comment after a Podcast Episode read it
- **THEN** the Comment stays shared and aired

### Requirement: The share toggle shows a flame, then mugs, to everyone

A shared Comment SHALL show a lit flame to everyone, and two mugs facing each other with the tooltip "Shared with Carl
and Vienna" and no press once a Podcast Episode read it. For a user who may edit the Topic the flame SHALL be a toggle
on every Comment that has not aired, with the tooltip "Share with Carl and Vienna" on an unshared Comment and
"Don't share with Carl and Vienna" on a shared, waiting Comment, disabled on an unshared Comment with no shared comment
slot free.

#### Scenario: A follower sees the flame and cannot press it

- **WHEN** a follower reads a thread with a shared Comment
- **THEN** that Comment shows a lit flame with no button, and unshared Comments show no flame

#### Scenario: The toggles disable at the limit

- **WHEN** an editor opens a thread with every shared comment slot used
- **THEN** each unshared Comment's toggle is disabled and says the next podcast episode is full, and each shared
  Comment's toggle works

#### Scenario: A waiting Comment's toggle reads Don't share

- **WHEN** an editor points at the flame on a shared Comment that has not aired
- **THEN** it reads "Don't share with Carl and Vienna"

### Requirement: The Hot takes card shows an editor the shared comment slot count

The Hot takes card SHALL show "X of Y for Carl and Vienna" at its top right to an editor only.

#### Scenario: The count explains itself

- **WHEN** an editor points at the count on the web, or presses it in the mobile app
- **THEN** it reads "Carl and Vienna will tackle Hot takes in the podcast"

#### Scenario: An editor sees the count

- **WHEN** an owner with 2 of 5 shared comment slots used opens the Topic's page
- **THEN** the card's top right reads "2 of 5 for Carl and Vienna"

### Requirement: The thread's button reads Hot Take and its composer's title reads Add a hot take

The thread's composer button SHALL read "Hot Take" on every platform, the composer of a new Comment SHALL be titled
"Add a hot take", and a Comment's reply action SHALL read "Reply". The Topic's and the Podcast Episode's card SHALL
be titled "Hot takes 🔥", and a Finding's card SHALL be titled the same. The heading SHALL show how many
Comments the last seven days added, if any. The thread SHALL show no notice, warning, or guideline text.

#### Scenario: The heading counts the week

- **WHEN** a Topic's thread gained two Comments and one reply in the last seven days
- **THEN** its Hot takes heading shows "3 this week", and a thread with none in that time shows no count

#### Scenario: An empty thread shows its button

- **WHEN** a user opens a Topic whose thread has no Comments
- **THEN** the card shows the "Hot Take" button and no other line

### Requirement: A Finding's Comments count toward the trending sort

The trending sort SHALL rank a Finding by its views plus five for each Comment and reply the user may read.

#### Scenario: A Comment outweighs a few views

- **WHEN** one Finding has four views and another has no views and one Comment
- **THEN** the trending sort puts the Finding with the Comment first

### Requirement: One thread component serves the web and the mobile app

The thread and its composer SHALL each be one shared component that the web and the mobile app render through a
platform adapter. The composer SHALL be the same component the tasting note thread uses, and SHALL hold no reaction
types. On the web the composer SHALL open in a dialog, and on mobile in a bottom sheet. The card SHALL start open,
and collapsing it SHALL keep a posted Comment and a draft.

#### Scenario: The thread shows on a Topic, a Podcast Episode, and a Finding

- **WHEN** a user opens a Topic, one of its Podcast Episodes, and one of its Findings on the web and in the mobile app
- **THEN** each shows its own thread from the one component

#### Scenario: The mobile composer opens in a bottom sheet

- **WHEN** a user presses "Hot Take" or Reply in the mobile app
- **THEN** the composer opens in a bottom sheet above the keyboard

#### Scenario: Collapsing the card keeps a draft

- **WHEN** a user closes the Hot takes card and opens it again
- **THEN** the Comment they just posted still shows
