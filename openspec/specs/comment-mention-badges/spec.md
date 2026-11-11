# comment-mention-badges Specification

## Purpose
A person mentioned in a Comment learns of it from a badge that counts their unseen Comment Mentions, and one list leads
them from the header to the page to the Comment. A mention stays unseen until they have scrolled to its Comment.

## Requirements

### Requirement: A Comment Mention is unseen until its Comment is scrolled to

A Comment Mention SHALL hold the time its mentioned user saw it, or none. It SHALL become seen once its Comment has
scrolled into view in an open thread for that user, on any device, and it SHALL then leave every badge and the list at
once. Reading a list, a badge, or an MCP result SHALL NOT mark it seen.

#### Scenario: Scrolling to the Comment clears it

- **WHEN** a mentioned user opens the thread and the mentioning Comment scrolls into view
- **THEN** the mention is seen, and the header, title, and section badges each count one fewer

#### Scenario: Opening the list clears nothing

- **WHEN** a mentioned user opens the mentions list and closes it
- **THEN** every mention in it stays unseen

### Requirement: Unseen mentions count on the header, the page title, and the Comments section

A signed-in user's unseen Comment Mentions SHALL count in three places: the header's badge on every page, the title
badge of each page that holds a mentioning Comment, and the badge on that page's Hot takes section. The header's and
the title's badges SHALL be the summed badges those places already have, with a line for mentions in their tooltip. A
Topic's page SHALL count the mentions in its own thread and in its Findings' threads.

#### Scenario: One mention leads from the header to the thread

- **WHEN** a Comment on a Topic's Finding mentions a user
- **THEN** the header badge, that Topic page's title badge, and that Finding's Hot takes section badge each count it

#### Scenario: Another page's title is unchanged

- **WHEN** a user's only unseen mention is on a Podcast Episode's thread
- **THEN** the Podcast Episode page's title badge counts one and its Topic page's title badge counts none

### Requirement: A mention the person should not read never badges

A Comment Mention SHALL never badge, list, or count if its Comment is the mentioned user's own, if its author is under
an admin block or in a block with the mentioned user in either direction, if its Finding is rated thumbs down, or if
the mentioned user may not open its page. Deleting a Comment, by its author, a Topic's owner, or an admin, SHALL delete
its mentions.

#### Scenario: A blocked author's mention is silent

- **WHEN** a person the user blocked mentions the user in a Comment
- **THEN** no badge counts it and the list does not hold it

#### Scenario: A deleted Comment clears its mention

- **WHEN** an admin deletes a Comment that mentions a user who has not seen it
- **THEN** the user's badges each count one fewer on their next read

#### Scenario: A private page's mention is silent

- **WHEN** a Comment on a private Topic mentions a user who may not open that Topic
- **THEN** no badge counts it and no first line of it reaches that user

### Requirement: An edit never badges a person twice

An edit of a Comment SHALL keep the seen time of each user its new body still mentions, SHALL add an unseen mention for
each user it newly mentions, and SHALL delete the mention of each user it no longer names.

#### Scenario: An edit keeps a seen mention seen

- **WHEN** an author edits a Comment whose mention the mentioned user has seen, and keeps the mention
- **THEN** the mentioned user's badges do not rise

### Requirement: Opening a badge lists the unseen mentions

Pressing a badge that counts a Comment Mention SHALL open one list of the user's unseen mentions, newest first, each
row with the author's username, the Comment's first line as plain text cut to 140 characters, and the name of the page
it sits on. The list SHALL offer Mark all seen, which marks every unseen mention seen. On the web the header's list
SHALL open from a Mentions row in the user menu.

#### Scenario: The list names the author, the line, and the page

- **WHEN** a user with two unseen mentions opens a badge
- **THEN** the list shows both, newest first, each with its author's username, its first line, and its page's name

#### Scenario: Mark all seen clears every badge

- **WHEN** a user presses Mark all seen
- **THEN** the list is empty and no badge counts a mention

### Requirement: Choosing a mention opens its Comment

Choosing a row SHALL go to the Comment's page, open the Hot takes section, open the reply thread if the Comment is a
reply, scroll to the Comment, and highlight it briefly. With `prefers-reduced-motion` the Comment SHALL be marked
without an animation. A Comment older than the thread's first page SHALL still be shown and scrolled to.

#### Scenario: A reply is reached

- **WHEN** a user chooses a mention whose Comment is a reply on a Finding
- **THEN** the Topic's page opens that Finding, its Hot takes section, and the reply thread, and scrolls to the
  highlighted reply

#### Scenario: An old Comment is reached

- **WHEN** a user chooses a mention whose Comment is older than the thread's newest 20
- **THEN** the thread shows that Comment and scrolls to it

### Requirement: A link to a Comment opens it on its page

A url that names a Comment on its social target's page SHALL open that page as choosing a mention does: section open,
reply thread open, the Comment scrolled to and highlighted. A link to a Comment the reader may not read, or one that is
gone, SHALL open the page with its thread as usual and no error.

#### Scenario: A news row opens the Comment

- **WHEN** a user presses a Comment's row in the news
- **THEN** the Comment's page opens with that Comment scrolled to and highlighted

#### Scenario: A deleted Comment's link opens the page

- **WHEN** a reader follows a link to a Comment that was deleted
- **THEN** the page opens with its thread and shows no error

### Requirement: The count is one cached read and is never polled

The unseen mentions SHALL come from one read per signed-in user, cached on the server per user. The client SHALL read
it as a page or a screen loads and after the user's own Comment write, and SHALL never read it on a timer. A Comment
write that mentions the user, a Comment's delete, a seen mark, a block change, a Topic's visibility change, and a
removal from a team SHALL clear that user's cached entry.

#### Scenario: A Topic that turns private stops badging

- **GIVEN** a user with an unseen mention on a public Topic they do not follow
- **WHEN** the Topic's owner makes it private
- **THEN** the user's next page load counts no mention from it

#### Scenario: A page load refreshes the badges

- **WHEN** a user is mentioned while reading a page and then opens another page
- **THEN** the badges count the new mention after the second page loads, and no read ran in between

#### Scenario: A second page load is served from the cache

- **WHEN** a user opens two pages with no mention written, seen, or deleted in between
- **THEN** the second read runs no query

### Requirement: One badge and one list serve the web and the mobile app

The mention badge and the mentions list SHALL each be one shared component that the web and the mobile app render
through a platform adapter. On the web the list SHALL open in a popover. In the mobile app it SHALL open in the tap
sheet, and the header's badge SHALL sit on the menu icon, since the mobile header shows no avatar.

#### Scenario: The mobile list is the tap sheet

- **WHEN** a user taps a mention badge in the mobile app
- **THEN** the mentions list opens in a sheet, and choosing a row opens the Comment's screen

### Requirement: Badge opens and seen mentions are reported by id

The app SHALL send `social_mention_badge_open` with the place, header, title, or section, and the server SHALL send
`social_mention_seen` with the Comment's id and its Topic's id for each mention marked seen. No event SHALL hold a
username or any text.

#### Scenario: A seen mention is counted

- **WHEN** a mention is marked seen by scrolling
- **THEN** one `social_mention_seen` event is sent with the Comment's id and its Topic's id
