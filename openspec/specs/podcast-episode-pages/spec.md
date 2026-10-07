# podcast-episode-pages Specification

## Purpose
TBD - created by archiving change coffee-break-podcast. Update Purpose after archive.
## Requirements
### Requirement: Each Podcast Episode of a public Topic has its own server-rendered page

Each published Podcast Episode of a public Topic SHALL have a page at a path after the Topic's slugged url,
`/episodes/<season>/<number>`, rendered on the server like the other public pages. The page SHALL show the Podcast
Episode's title as its heading with the Podcast Episode's cover beside it, the Topic's byline under the Podcast
Episode's description on a phone, a player for the Podcast Episode, a table of the chapters under the heading "Episode chapters",
and the full transcript as readable text under the heading "Episode transcript". The byline SHALL credit the Topic's
team to anyone who can open the team's page, and the Topic's owner otherwise. The chapters' section SHALL collapse and
expand on a press of its heading, SHALL be open when the page loads, and SHALL stay open in a browser without
JavaScript. On a narrow screen the page SHALL hide the cover, and SHALL hide the chapters' section if JavaScript runs,
and its html SHALL still include both. A browser without JavaScript SHALL show the chapters' section at every width,
with every chapter's row and no pagination. The table SHALL show each chapter's play button, title, start time, length,
and Topic Finding, a last row with the totals, and the pagination that the app's other tables use. A chapter's play
button SHALL play the Podcast Episode from that chapter, SHALL pause it while that chapter plays, and SHALL be in the
primary color on the chapter that the player is at. The Topic Finding column SHALL show the chapter's Finding by its
title and its source's favicon, host, and age. The title SHALL be a link to the Finding's source, marked as user
content, which a browser without JavaScript opens in a new tab. In a browser with JavaScript a press on the row or on
the title SHALL open the Finding's note, the same note that the topic page opens. A chapter whose Finding a later Scan
filtered out SHALL show its source's favicon and host as a link, and its row SHALL open no note. The transcript SHALL
start each chapter with a dashed rule that holds the chapter's title. The server's html SHALL include the whole
transcript, and a browser with JavaScript SHALL collapse it behind a control reading "read more". Expanded, the
transcript SHALL scroll within a limited height, and the control SHALL read "read less". While the Podcast Episode is
not loaded in the player, the player's details line SHALL say that Carl and Vienna are AI voices, and once it is loaded
the line SHALL show the player's chapter instead. A request under a stale slug SHALL redirect to the current one, as the
topic page does.

#### Scenario: A narrow screen hides the cover and the chapters

- **WHEN** a visitor opens the page on a narrow screen in a browser with JavaScript
- **THEN** the cover and the "Episode chapters" section do not show, and the page's html still includes them

#### Scenario: A narrow screen with no JavaScript shows the chapters' table

- **GIVEN** a Podcast Episode with twelve chapters
- **WHEN** a visitor opens the page on a narrow screen in a browser without JavaScript
- **THEN** the "Episode chapters" section shows its table with all twelve rows, each Topic Finding a link to its source,
  and no pagination

#### Scenario: A podcast episode page renders for a crawler

- **WHEN** a crawler requests a public Topic's `/episodes/2026/14`
- **THEN** the response's html includes the Podcast Episode's title as the heading, its chapters, and its transcript,
  without running any JavaScript

#### Scenario: A chapter shows its Finding

- **WHEN** the table lists a chapter whose Finding the Topic still has
- **THEN** the chapter's row shows its start time, its length, and the Finding's title, favicon, host, and age, and the
  title links to the Finding's source, marked as user content

#### Scenario: A chapter's button plays the Podcast Episode from the chapter

- **GIVEN** a Podcast Episode that is not playing
- **WHEN** a listener presses the play button of the third chapter's row
- **THEN** the Podcast Episode plays from the third chapter, that button shows pause in the primary color, and no note
  opens

#### Scenario: The chapters stay open without JavaScript

- **WHEN** a visitor whose browser runs no script opens the page
- **THEN** the "Episode chapters" section shows its table, and pressing its heading does not close it

#### Scenario: A row opens the Finding's note

- **GIVEN** a browser with JavaScript
- **WHEN** a visitor presses a chapter's row
- **THEN** the Finding's note opens with its link, its link preview, and Carl's notes, and the page does not change

#### Scenario: A filtered-out Finding leaves its source

- **WHEN** the table lists a chapter whose Finding a later Scan filtered out
- **THEN** the chapter's row shows its source's favicon and host as a link, and pressing the row opens no note

#### Scenario: The table totals its chapters

- **WHEN** the page shows a Podcast Episode with twelve chapters from five hosts
- **THEN** the table's last row reads "12 chapters", the chapters' total length, and "5 sources"

#### Scenario: The transcript is whole without JavaScript

- **WHEN** a visitor whose browser runs no script opens the page
- **THEN** the whole transcript shows, with no control to expand it

#### Scenario: The transcript collapses with JavaScript

- **WHEN** a visitor whose browser runs JavaScript opens the page
- **THEN** the transcript shows its first lines and a control reading "read more", and pressing it shows the rest in a
  box that scrolls

#### Scenario: A stale slug redirects

- **WHEN** a client requests a podcast episode page at a path after the Topic's old slug
- **THEN** it is redirected permanently to the same podcast episode at a path after the current slug

#### Scenario: A removed Podcast Episode's page is missing

- **WHEN** a client requests the page of a Podcast Episode that its Topic's owner removed
- **THEN** the response is not found, and the sitemap no longer lists the page

#### Scenario: An unknown number is missing

- **WHEN** a client requests a podcast episode number that the season does not have
- **THEN** the response is not found

### Requirement: A podcast episode page has a card, and a public one is described for search engines

Every published Podcast Episode's page SHALL have its card in its head, whatever its Topic's visibility, so a shared
link previews: the Podcast Episode's title and description, and its Open Graph image, the Podcast Episode's own card of
1200 by 630 pixels with its cover beside its title, its Topic's name, and its season, number, and length. The card SHALL
be drawn on its first request and stored, and its url SHALL change when what it shows changes. No episode page SHALL
include Open Graph audio tags, so a link preview opens the page instead of playing the Podcast Episode in place.

A public Topic's episode page SHALL also declare a canonical url, and include `PodcastEpisode` JSON-LD with the Podcast
Episode's name, description, url, publish date, duration, episode number, season, the audio's url, and the series it
belongs to. A page whose Topic is public but not yet shown SHALL be `noindex`, as its topic page is. When a Podcast
Episode of a public Topic publishes, search engines SHALL be told about its page through IndexNow.

A private or invite Topic's episode page SHALL have its card alone: it SHALL be `noindex`, with no canonical url, no
JSON-LD, and no podcast feed.

#### Scenario: The head describes the Podcast Episode

- **WHEN** a crawler reads a public Topic's podcast episode page
- **THEN** the head has the Podcast Episode's description as the meta description, a canonical url, PodcastEpisode
  JSON-LD, and the Podcast Episode's card as `og:image`

#### Scenario: A shared link opens the page

- **WHEN** a messaging app fetches a public Topic's podcast episode url
- **THEN** the head has no `og:audio` tags, so the preview shows the card with no play button and opens the page

#### Scenario: The card is wide, so a link preview crops nothing

- **WHEN** a social platform fetches a Podcast Episode's `og:image`
- **THEN** it gets a 1200 by 630 image with the Podcast Episode's cover on the left and its title on the right

#### Scenario: An invite Topic's episode link previews

- **WHEN** a messaging app fetches an invite Topic's podcast episode url with no session
- **THEN** the head has the Podcast Episode's title, its description, and its card as `og:image`, and it is `noindex`
  with no canonical url, no JSON-LD, and no `og:audio`

#### Scenario: The structured data is valid

- **WHEN** the page's JSON-LD is parsed
- **THEN** it is a `PodcastEpisode` with a `partOfSeries` that names the Topic's podcast feed, a `datePublished`, and an
  ISO 8601 duration

#### Scenario: A new Podcast Episode is announced

- **WHEN** a Podcast Episode of a public Topic publishes
- **THEN** IndexNow is told the podcast episode page's url

### Requirement: A private or invite Topic's Podcast Episodes are gated

A Podcast Episode of a private or invite Topic SHALL open its page, rendered in the browser, only for a signed-in user
who may listen to the Podcast Episode. A visitor, or a user who may not see the Topic, SHALL meet the Topic's gate over
the episode's loading skeleton, the same notice the Topic's own page shows: on an invite Topic a visitor is offered Sign
up and Log in, on a private Topic Log in alone, each returning to the episode, and a signed-in user is told to ask the
Topic's owner. The gate's api answer SHALL name an invite Topic and never a private one. The episode's own content, its
player, its chapters, and its transcript, SHALL never be rendered for a visitor or a crawler, and the page SHALL stay out
of the sitemap.

#### Scenario: A visitor meets an invite Topic's gate

- **WHEN** a visitor opens an invite Topic's podcast episode url
- **THEN** the page shows the gate over the episode's loading skeleton, and its sign up link returns to the episode

#### Scenario: A visitor meets a private Topic's gate

- **WHEN** a visitor opens a private Topic's podcast episode url
- **THEN** the page shows the private gate with Log in alone, and neither the gate nor its api answer names the Topic

#### Scenario: An invite Topic's owner opens a podcast episode page

- **WHEN** the owner of an invite Topic opens one of its Podcast Episodes' urls
- **THEN** the Podcast Episode's page loads with its player, its chapters, and its transcript

#### Scenario: A late subscriber cannot open an earlier Podcast Episode's page

- **GIVEN** a subscriber of an invite Topic who joined after a Podcast Episode published
- **WHEN** the subscriber requests that Podcast Episode's url
- **THEN** the response is not found, since the subscriber may see the Topic and meets no gate

#### Scenario: Nothing private is indexed

- **WHEN** any page or feed of a private or invite Topic's Podcast Episodes is served
- **THEN** it declares `noindex`, and the sitemap lists none of them

### Requirement: A Podcast Episode's page offers its Topic's actions and Remove episode

A Podcast Episode's page SHALL offer three actions on its Topic in the search bar's actions menu, and Remove episode
for whoever may remove the Podcast Episode. Add topic to team SHALL show where Team Up would show, for a signed-in
user and never on someone else's private Topic, and SHALL open a dialog that lists the teams the user leads that hold
the Topic with a remove action, the user's other leader teams with an add action, and New team, which opens the new
team form with the Topic picked. Share topic SHALL open the Topic's share dialog. Report issue SHALL report the Topic.
Remove episode SHALL remove the Podcast Episode after a confirmation and open the Topic's page. The Add topic to team
dialog and the Topic page's Team Up SHALL read the same teams and act the same way.

#### Scenario: A user adds the episode's Topic to a team from the menu

- **GIVEN** a signed-in user who leads a team that does not hold the Topic
- **WHEN** the user opens the Podcast Episode's page, opens its actions menu, picks Add topic to team, and picks the team
- **THEN** the Topic is added to that team and the dialog shows the team with a remove action

#### Scenario: Add topic to team stays hidden on someone else's private Topic

- **WHEN** a member of a team that holds someone else's private Topic opens one of its Podcast Episodes' pages
- **THEN** the actions menu offers Share topic and Report issue, and no Add topic to team

#### Scenario: A visitor can report the Topic

- **WHEN** a visitor opens a public Topic's Podcast Episode page and its actions menu
- **THEN** the menu offers Share topic and Report issue, and no Remove episode

