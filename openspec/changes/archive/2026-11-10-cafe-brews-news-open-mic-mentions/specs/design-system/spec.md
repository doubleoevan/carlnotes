# Spec Delta

## ADDED Requirements

### Requirement: A page section's title is the section title role with its count at the far right

A page section on the web and in the mobile app SHALL show its title in the `sectionTitle` type role, the display
font at text-xl, at the left of its title row, and its count with its noun in small muted text at the far right. A
section whose count is zero SHALL show no count. A control beside a section's title SHALL sit after the count. A
count SHALL hide on a narrow screen under a title too long to leave it room.

#### Scenario: A section with rows counts them

- **WHEN** a user with three teams opens the Teams page
- **THEN** the section's title reads "Your teams" in the display font at text-xl, with "3 teams" at the far right

#### Scenario: An empty section shows no count

- **WHEN** a user who follows no Topic opens the Activity page
- **THEN** the "Topics you follow" title shows with no count beside it

#### Scenario: A long title hides its count on a phone

- **WHEN** a user opens a topic page with five Podcast Episodes on a phone
- **THEN** the "Coffee Break podcast episodes" title shows with no count, and a wide screen shows "5 episodes"

#### Scenario: The count sits before the section's button

- **WHEN** a member opens a team page whose team holds four notes
- **THEN** the "Team notes" title row reads "4 notes" and then the Add Note button

### Requirement: A card section's count sits beside its title where the cards do not fill the row

On the web, an open section of cards whose cards do not fill one row of its grid SHALL show its count right after its
title instead of at the far right: with one card where the grid has two columns or more, and with two cards where it
has three. A closed section, a section whose cards fill the row, and every section on a phone's single column, SHALL
keep the count at the far right.

#### Scenario: One film on a wide screen

- **WHEN** a user opens the home on a wide screen with one film in Featured films
- **THEN** "1 film" sits right after the "Featured films" title, above the one card

#### Scenario: A closed section keeps the far right

- **WHEN** a user closes a section of one card on a wide screen
- **THEN** its count moves back to the far right of the title row

#### Scenario: Three cards fill the row

- **WHEN** a user opens the home on a wide screen with twelve topics in Featured topics
- **THEN** "12 topics" sits at the far right of the title row

#### Scenario: A phone keeps the far right

- **WHEN** a user opens the home on a phone with one film in Featured films
- **THEN** "1 film" sits at the far right of the title row

### Requirement: An empty list or table shows its line in a card

A page section whose list or table holds no row SHALL show its one muted line, or its call to action, inside the card
its rows would sit in, on the web and in the mobile app. The line SHALL never sit bare under the section's title. An
empty search SHALL show its lines in the same card.

#### Scenario: A Café with no public team

- **WHEN** a visitor opens the Café of a person who is on no public team
- **THEN** the All Teams section shows "No public teams." inside a card

#### Scenario: A call to action sits in the card too

- **WHEN** a user who is on no team opens the Teams page
- **THEN** the "Start a team." link and the line after it show inside a card

### Requirement: A row of buttons under the search bar holds one highlighted button

A page whose header is an avatar and a name, the team page and the Café, SHALL show its buttons in one row under the
search bar, on the web and in the mobile app. The page's own button SHALL sit at the row's left in the plain button
style, and the topic button at its right SHALL be the row's one highlighted button. A page with a titled header SHALL
keep its button at the right of its title's row.

#### Scenario: The left button is plain and the right one highlighted

- **WHEN** a leader opens their team's page
- **THEN** Add Member shows at the left in the plain style and Add Topic at the right in the highlighted style

#### Scenario: A titled page keeps its button beside its title

- **WHEN** a user opens the Teams page
- **THEN** New team shows at the right of the Teams title's row, and no row of buttons shows above it

### Requirement: A plain button at the left of a top row highlights its icon

The plain button at the left of a page's top row of buttons SHALL show its icon in the highlight color, with its label
and its border as every plain button has them, on the web and in the mobile app. The highlighted button at the row's
right SHALL keep its icon in its own text color.

#### Scenario: New team on the Café

- **WHEN** a user opens their own Café
- **THEN** the plus in New team shows in the highlight color, and the button stays plain

#### Scenario: The podcast page's Subscribe

- **WHEN** a user opens a Podcast Episode's page
- **THEN** the icon in Subscribe shows in the highlight color, as the icon in a Topic page's left button does

### Requirement: A top row's two buttons are one size with equal gaps above and below

The plain button and the highlighted button of a page's top row of buttons, and the button of a titled header row,
SHALL share one height, padding, label size and weight, icon size, and corner radius at every width, on the web and in
the mobile app, and differ in their fill alone. The gap above the row, from the search bar, SHALL equal the gap below
it, to the page's header. A button drawn shorter than 44px SHALL keep a touch target of at least 44px.

#### Scenario: Subscribe and New Topic on a phone

- **WHEN** a user opens a Podcast Episode's page at 390 pixels wide
- **THEN** Subscribe and New Topic are both 36px tall with the same label, icon size, and corner, and each takes a
  tap within an area 44px tall

#### Scenario: The gaps around the row match

- **WHEN** a user opens a topic page, a Podcast Episode's page, the Café, or a team page at 390 or 1280 pixels wide
- **THEN** the row of buttons sits 16px under the search bar and 16px over the page's header

#### Scenario: A titled page's button is the same size

- **WHEN** a user opens the Teams page
- **THEN** New team is as tall as New Topic on the Café, with the same label, icon size, and corner

### Requirement: A closed section of a stacked column shows a divider

On the topic page, a closed section of the two columns SHALL show a divider under it only below the width where the
columns sit side by side, where each section fills a row of its own, and the page's last section SHALL show none. The
mobile app's topic screen, whose sections always fill a row, SHALL show the divider under every closed section but
the last.

#### Scenario: A phone shows the divider under a closed column section

- **WHEN** a user closes Topic roast on a phone-width topic page
- **THEN** a divider shows under its title, as under a closed Topic findings

#### Scenario: Side by side columns show none

- **WHEN** a user closes Topic roast on a topic page wide enough for two columns
- **THEN** no divider shows under its title

#### Scenario: The last section shows none

- **WHEN** a user closes Tasting Notes on a phone-width topic page with no similar topics
- **THEN** no divider shows under its title

### Requirement: A details line sits under a page's byline and wraps between details

A details line SHALL be one shared component on the web and in the mobile app: small muted text directly under a
page's byline, with a middle dot between details. The line SHALL wrap between details and never inside one, and each
dot SHALL stay at the end of the detail before it. A count SHALL read singular at one, and a count of zero SHALL be
left out. A line with nothing left SHALL be absent.

#### Scenario: The line wraps between counts on a phone

- **WHEN** a topic page's seven counts do not fit one row at 390 pixels wide
- **THEN** the line continues on a second row, no count is split across rows, and no row starts with a middle dot

#### Scenario: A count of one reads singular

- **WHEN** a details line counts one film and two posts
- **THEN** it reads "1 film · 2 posts"

#### Scenario: A line with every count at zero is absent

- **WHEN** a topic with no findings, podcast episodes, comments, posts, notes, or similar topics opens
- **THEN** no details line shows under its byline

### Requirement: An image of a thing with its own page opens that page

On the web and in the mobile app, an image that shows a topic, a podcast episode, or a Topic Post SHALL open that
thing's page when pressed, through one shared image link. The image of the open page's own thing SHALL open nothing.
An image that is an upload or edit control, or a film's poster under its play button, SHALL keep what it opens.
Beside a title that opens the same page, the image's link SHALL add no tab stop and no second announcement.

#### Scenario: A row's thumbnail opens the row's page

- **WHEN** a user presses the thumbnail of a topic's row in the search results
- **THEN** the topic's page opens, as it does from the row's title, and the row's note stays closed

#### Scenario: A popup's image opens the page

- **WHEN** a user opens a topic's note from a Topics row and presses the note's full-width image
- **THEN** the topic's page opens, and a screen reader reads the image's link as "Open" with the topic's name

#### Scenario: The open page's own image opens nothing

- **WHEN** a user on a topic's page opens that topic's note, or a Topic Post's popup with that topic's row
- **THEN** the topic's image in the note and in the row is a plain image, and a press on it leaves the page as it is

#### Scenario: An editor's header image keeps its edit control

- **WHEN** a user who may edit a topic presses the header image on the topic's page
- **THEN** the Edit topic image dialog opens, and the page stays open

#### Scenario: The image beside a linked title adds no tab stop

- **WHEN** a user tabs through the search results
- **THEN** focus reaches each row's title once, and never the row's thumbnail

### Requirement: A page's loading state matches the page it becomes

On the web and in the mobile app, a page's loading state SHALL hold each main block where the loaded page draws it,
at the loaded page's size, and SHALL be laid out in the layout classes and components its loaded page uses. A block
whose height depends on data that the loading state cannot know SHALL take its most common case, never no height.

#### Scenario: A loading state holds the page's main blocks

- **WHEN** a page with a top row of buttons, a header, and sections loads
- **THEN** its loading state holds the row of buttons, the header's image or avatar, the title, the byline and the
  details line, each section's title, and the first card or table of each section, where the loaded page draws them

#### Scenario: The Account page's budget loads in place

- **WHEN** a user opens the Account page and the budget has not loaded yet
- **THEN** a placeholder holds the header row at the plan button's height, the budget's card has the loaded card's
  height, and the Settings title stays where it is when the budget arrives

#### Scenario: The Account page's loading card follows the budget's cutoffs

- **WHEN** an admin whose budget has no override opens their own Account page
- **THEN** the loading card holds no list of monthly budget cutoffs, as the loaded card shows none
- **AND** a user's loading card holds the list under the bar

#### Scenario: A loading section shows its title's row

- **WHEN** a profile, a team, the teams, or the activity loads
- **THEN** each loading section shows placeholders for its title and its count in the section's own title row, over a
  placeholder of its cards or its table in the card they sit in

#### Scenario: The news loads as rows

- **WHEN** the news card waits for a page of the news
- **THEN** it shows a full page of placeholder rows in the card, and the sections under the card stay under it

#### Scenario: A podcast episode's page loads with its film's section

- **WHEN** a podcast episode's page loads
- **THEN** its loading state shows the button row, the header in the loaded header's layout, the podcast's section
  with the player card, and the film's section with the film's card under it

#### Scenario: A topic's page loads with its film's section over its player

- **WHEN** a topic's page loads
- **THEN** its loading state shows both buttons of the button row, the header in the loaded header's layout with
  the byline, the reactions, and the details line, the film's section with the film's card, and the podcast's
  section with the player card and its podcast feed button under it
- **AND** the comment thread and the Topic Posts each show the card of a section with no row yet

#### Scenario: A signed-in reader's Similar topics arrive under the page

- **WHEN** a signed-in reader's topic page has loaded and its Similar topics arrive from their own read
- **THEN** no block above the Similar topics section moves, and the page shows nothing in the section's place until
  then, as the section is the last of its column

#### Scenario: A team's page loads its card sections and its tables

- **WHEN** a team's page loads
- **THEN** its loading state shows a section of cards for the topics, the films, the podcast episodes, and the Topic
  Posts, in the loaded page's order, over a section for the members' table, the topics' table, and the notes
