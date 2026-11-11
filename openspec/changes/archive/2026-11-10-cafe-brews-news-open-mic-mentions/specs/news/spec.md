# Spec Delta

## Purpose

The news is the list of what happened on a person's Topics inside a window of time. It shows as Brews News at the top
of the signed-in home and of every profile page.

## ADDED Requirements

### Requirement: The news lists five kinds of News Event inside a window

The news SHALL list the News Events of one window: a Podcast Episode published, a Topic Post published, a Comment or a
reply posted, a reaction saved, and a Finding kept. A window SHALL be the last week, day, or hour, measured back from
the request, and a request that names none SHALL read the week. Each event SHALL be one row that links to its page or
its Finding.

#### Scenario: A day's window leaves out older events

- **WHEN** a user's Topic published a Podcast Episode three days ago and gained a Comment two hours ago
- **THEN** the day's news holds the Comment's row alone, and the week's news holds both rows

#### Scenario: A Finding's row links to the Finding

- **WHEN** a Scan keeps a new Finding on a Topic the user follows
- **THEN** the news holds one row for it that opens that Finding on its Topic's page

### Requirement: Reactions on one Comment are one row

Reactions on a Comment SHALL show as one row per Comment, with the count of the reactions saved in the window and the
time of the newest of them. A reaction on a Topic, a Finding, a Podcast Episode, or a Topic Post SHALL show as its own
row.

#### Scenario: Twelve reactions read as one row

- **WHEN** twelve users react to one of a user's Comments inside the window
- **THEN** that user's news holds one row reading "12 reactions on your hot take", dated by the newest reaction

#### Scenario: A reaction on a Finding is its own row

- **WHEN** two users react to a Finding on a user's Topic inside the window
- **THEN** the news holds two rows, each linking to that Finding

### Requirement: The news orders own things, then teams' things, then followed Topics

The news SHALL hold three groups in this order. The own group is the events on the Topics the person owns, on their
Topic Posts, and on their Comments. The team group is the events on the Topics their active Teams hold. The followed
group is the events on the Topics they subscribe to. An event SHALL show once, in the first group it fits.

#### Scenario: An older own event leads a newer followed one

- **WHEN** a user's own Topic gained a Comment yesterday and a Topic they follow gained a Finding an hour ago
- **THEN** the Comment's row comes before the Finding's row

#### Scenario: A team's Topic the person owns shows once

- **WHEN** a Topic the person owns is also held by one of their Teams
- **THEN** its events show in the own group and not again in the team group

### Requirement: A group reads newest first, with ties ordered by kind

Within a group the rows SHALL read newest first. Rows of the same time SHALL read in the order Podcast Episode, Topic
Post, Comment, reaction, Finding.

#### Scenario: A tie puts the Podcast Episode first

- **WHEN** a Podcast Episode and a Finding of one Topic hold the same time
- **THEN** the Podcast Episode's row comes first

### Requirement: A person's own news holds everything they may open

On the signed-in home and on their own profile page, a user's news SHALL hold every event of the three groups that the
user may open. A Finding the Topic's Feed leaves out for that user SHALL be left out with its Comments and reactions: a
Finding rated thumbs down, and an invite Topic's Finding from a Scan before the user's activation.

#### Scenario: A private Topic's events show to its owner

- **WHEN** a user's private Topic gains a Finding
- **THEN** the Finding's row is in that user's news on the home and on their own profile page

#### Scenario: A Finding rated thumbs down leaves the news

- **WHEN** a Finding inside the window is rated thumbs down
- **THEN** its row, and the rows of its Comments and reactions, are gone from the next read

### Requirement: Someone else's profile shows public events only

For anyone but the person, a visitor included, a profile's news SHALL hold only events on public Topics. It SHALL hold
the person's own group, and the team group only for public Teams where the person's membership is shown. It SHALL hold
nothing from the Topics the person follows.

#### Scenario: A visitor's first page is up to a minute old

- **WHEN** two visitors open the same profile's news for the week within a minute
- **THEN** the second is served the first one's page, and a signed-in reader's page is always read new

#### Scenario: A private Topic's event is absent

- **WHEN** a visitor opens the profile of a person whose private Topic gained a Comment
- **THEN** the news holds no row for that Comment

#### Scenario: A hidden membership's Team is absent

- **WHEN** a person hid their membership of a public Team and another user opens their profile
- **THEN** the news holds no event from that Team's Topics

#### Scenario: A followed Topic's event is absent

- **WHEN** a person follows a public Topic that gained a Finding, and another user opens their profile
- **THEN** the news holds no row for that Finding

### Requirement: A blocked person's events never show

The news SHALL leave out every Comment, reaction, and Topic Post by an author in a block with the reader in either
direction, and by an author under an admin block. A reaction row's count SHALL leave those reactions out.

#### Scenario: A blocked author's Comment is absent

- **WHEN** a person the reader blocked comments on a Topic the reader follows
- **THEN** the reader's news holds no row for that Comment

#### Scenario: A count leaves a blocked person's reaction out

- **WHEN** three users react to the reader's Comment and the reader blocked one of them
- **THEN** the row reads two reactions

### Requirement: Five rows show a page, with the search results' page buttons

The list SHALL show five rows a page, each numbered across the window's pages as a search result is, with the search
results' numbered page buttons under the card. A closed list SHALL hide the page buttons. A window that fits one page
SHALL show no page buttons. A window with no event SHALL show one empty line in Carl's voice and no page buttons.

#### Scenario: A long window is paged

- **WHEN** a week's news holds 32 rows
- **THEN** rows 1 to 5 show with the page buttons 1, 2, 3, a gap, and 7 under the card, and the second page shows
  rows 6 to 10

#### Scenario: A closed list hides its page buttons

- **WHEN** a reader closes a list whose week holds 32 rows
- **THEN** the card shows its heading alone, with no page buttons under it

#### Scenario: A quiet hour shows the empty line

- **WHEN** the hour's news holds no event
- **THEN** the list shows its empty line, the picker, and no page buttons

### Requirement: The heading opens and closes the list

The list's heading SHALL hold a caret and SHALL open and close the list, which starts open. A closed list SHALL show
its heading and its picker alone. Choosing a window in a closed list SHALL open it on that window.

#### Scenario: A closed list opens from the picker

- **WHEN** a user closes the list from its heading and then chooses Day
- **THEN** the list opens on the day's rows

### Requirement: A Podcast Episode's row and a narrated Finding's row hold a play button

A Podcast Episode's row SHALL read as its search result does: the episode's title, then a line with Podcast, how long
ago it was published, its listeners, its Topic's link, and the play button. It SHALL open no Topic note. A Finding's
row SHALL hold the chapter play button the Topic's Feed shows on that Finding, if a chapter of a
Podcast Episode the reader may listen to narrates it.

#### Scenario: A Podcast Episode's row reads as its search result

- **WHEN** the Topic Home espresso published the Podcast Episode Burrs, measured two hours ago, and three people listened
- **THEN** its row's title reads "Burrs, measured" and its line reads "Podcast · 2 hours ago · 3 listeners · Home espresso"

#### Scenario: A Podcast Episode's row plays the episode

- **WHEN** a user presses the play button on a Podcast Episode's row
- **THEN** the episode plays in the player, and no Topic note opens

#### Scenario: A narrated Finding's row plays its chapter

- **WHEN** a Finding in the news is narrated by a chapter of its Topic's latest Podcast Episode
- **THEN** its row holds that chapter's play button

### Requirement: A picker selects the week, the day, or the hour

The list's header SHALL hold a picker of Week, Day, and Hour, with Week selected at first. Choosing one SHALL load that
window's news in place and mark the choice as selected. The list SHALL show no notice, warning, or guideline text.

#### Scenario: A user narrows to the hour

- **WHEN** a user chooses Hour
- **THEN** the list loads the last hour's rows in place, and the picker marks Hour as selected

### Requirement: A row is the search results' row, with its image

A row of the news SHALL be drawn by the search results' row component: its line as the title, then a line with its
image and, on every row but a Podcast Episode's, its Topic's name and how long ago it happened. The image SHALL be the
Podcast Episode's own for a row about a Podcast Episode that has one, the post's own for a published Topic Post's row,
and the Topic's image for every other row. A row with no image SHALL show its kind's icon in the image's place.

#### Scenario: A Podcast Episode's row shows the episode's image

- **WHEN** a Podcast Episode with its own image is published on a Topic
- **THEN** its row shows that image, and a Finding's row on the same Topic shows the Topic's image

#### Scenario: A Topic with no image shows the kind's icon

- **WHEN** a Comment is posted on a Topic with no image yet
- **THEN** its row shows the Comment icon where the image would be

### Requirement: A row's title and image open the event, and the rest of the row opens its Topic's note

A row's title and its image SHALL open what the row is about: the Comment on its page, the Finding, the Podcast
Episode, or the Topic Post. On every row but a Podcast Episode's and a published Topic Post's, a click or a tap
anywhere else on the row SHALL open its Topic's note, the note the Topic page's header opens, loaded when it opens, in
a popover on the web and a sheet in the mobile app. Such a row SHALL hold a note button that opens the same note from
a keyboard and a screen reader.

#### Scenario: A row click opens the Topic's note

- **WHEN** a user clicks a row beside its title
- **THEN** its Topic's note opens over the list, and the page stays open

#### Scenario: The title opens the event

- **WHEN** a user clicks the title or the image of a Comment's row
- **THEN** the Comment's page opens at that Comment

### Requirement: A published Topic Post's row shows the post's own image

The row of a published Topic Post SHALL show the post's own image at the row's thumbnail size, and its Topic's image
while the post has none. A row about a Comment or a reaction on a Topic Post SHALL keep its Topic's image.

#### Scenario: A post with an image shows it

- **WHEN** a Topic Post with its own image is published on a Topic
- **THEN** its row shows the post's image, and a Comment's row on that post shows the Topic's image

#### Scenario: A post with no image yet shows its Topic's

- **WHEN** a Topic Post is published and its image is not drawn yet
- **THEN** its row shows its Topic's image

### Requirement: A published Topic Post's row opens the post's info popup

The row of a published Topic Post SHALL hold a notebook-pen button beside its title in the note button's place. The
button, and a click or a tap anywhere else on the row, SHALL open that post's info popup, loaded when it opens, in a
popover on the web and a sheet in the mobile app. A row about a Comment or a reaction on a Topic Post SHALL open its
Topic's note.

#### Scenario: A row click opens the post's popup

- **WHEN** a user clicks a published Topic Post's row beside its title
- **THEN** the post's info popup opens over the list, and the page stays open

#### Scenario: A Comment on a post opens the Topic's note

- **WHEN** a user clicks the row of a Comment on a Topic Post beside its title
- **THEN** its Topic's note opens

### Requirement: A person's own Topic Posts are in their own group

The own group SHALL hold the person's published Topic Posts on every Topic the reader may open, whether or not the
person owns, holds through a Team, or follows that Topic. The person SHALL open what their account may open, and every
Topic as an admin. Anyone else SHALL read the person's posts on public Topics alone. A later group SHALL leave those
posts out.

#### Scenario: A post on a Topic outside the three groups shows

- **WHEN** a user publishes a Topic Post on a public Topic they neither own, hold through a Team, nor follow
- **THEN** the post's row is in the own group of that user's news, and in their profile's news for a visitor

#### Scenario: A post on a followed Topic shows once

- **WHEN** a user publishes a Topic Post on a Topic they follow
- **THEN** the post's row is in the own group and not again in the followed group

### Requirement: A Comment's row shows its first line as plain text

A Comment's row SHALL show its author's username and the Comment's first line as plain text, cut to 140 characters,
with no link made from its text. The row's title SHALL link to the Comment on its page.

#### Scenario: A url in a Comment stays text

- **WHEN** a Comment in the news begins with a url
- **THEN** its row shows the url as text, and the row's title opens the Comment on its page

### Requirement: The news is read in numbered pages of five under a rate limit

A news read SHALL return one numbered page of five rows, the window's total, the Podcast Episodes its rows play, and
the window's cursor. A read of another page that passes the cursor back SHALL read the window as its first read fixed
it. Reads SHALL be limited to 120 a minute for a signed-in user, or for an address for a visitor, and a read past the
limit SHALL be rejected.

#### Scenario: A window is paged

- **WHEN** a week's news holds 12 rows
- **THEN** the first page returns 5 rows and a total of 12, and the second and third pages return the other 7

#### Scenario: A cursor with an impossible time is rejected

- **WHEN** a read passes back a cursor whose time is later than a day from now
- **THEN** the read is rejected as an invalid cursor, and nothing is read

#### Scenario: A scraper is slowed

- **WHEN** one address sends 121 news reads inside a minute
- **THEN** the 121st is rejected as rate limited

### Requirement: A profile's server render holds the first page

A profile page's server render SHALL hold the first page of the week's news in its HTML, so a reader without
JavaScript and a crawler see the newest rows and their links.

#### Scenario: A crawler reads the newest rows

- **WHEN** a request with no session fetches a profile whose week holds 32 public rows
- **THEN** the HTML holds the first five rows and their links

### Requirement: The home and every profile show one news component

The signed-in home and every profile page SHALL show the news titled "Brews News". Both SHALL be one shared component
that the web and the mobile app render through a platform adapter.

#### Scenario: The home and a profile render the same list

- **WHEN** a user opens the signed-in home and then their own profile page, on the web and in the mobile app
- **THEN** each shows the same rows from the one component, under the same title

### Requirement: The news reports its window changes and its page opens

The browser and the app SHALL send `social_news_window_change` with the chosen window and the place, home or profile,
and `social_news_page_open` with the page and the place. A profile's events SHALL hold the profile's user id. No event
SHALL hold text.

#### Scenario: A window change is counted

- **WHEN** a user chooses Day on a profile's news
- **THEN** one `social_news_window_change` event is sent with the window, the place, and the profile's user id
