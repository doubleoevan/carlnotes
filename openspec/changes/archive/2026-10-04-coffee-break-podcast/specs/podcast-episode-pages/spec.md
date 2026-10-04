## ADDED Requirements

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

### Requirement: A podcast episode page is described for search engines

An episode page SHALL use the Podcast Episode's description as its meta description and SHALL declare a canonical url.
It SHALL include `PodcastEpisode` JSON-LD with the Podcast Episode's name, description, url, publish date, duration,
episode number, season, the audio's url, and the series it belongs to. It SHALL include Open Graph audio tags for the
Podcast Episode's audio, and its Open Graph image SHALL be the Podcast Episode's own card of 1200 by 630 pixels: the
Podcast Episode's cover beside its title, its Topic's name, and its season, number, and length. The card SHALL be drawn
on its first request and stored, and its url SHALL change when what it shows changes. A page whose Topic is public but
not yet shown SHALL be `noindex`, as its topic page is. When a Podcast Episode of a public Topic publishes, search
engines SHALL be told about its page through IndexNow.

#### Scenario: The head describes the Podcast Episode

- **WHEN** a crawler reads a public Topic's podcast episode page
- **THEN** the head has the Podcast Episode's description as the meta description, a canonical url, PodcastEpisode
  JSON-LD, `og:audio` tags, and the Podcast Episode's card as `og:image`

#### Scenario: The card is wide, so a link preview crops nothing

- **WHEN** a social platform fetches a public Podcast Episode's `og:image`
- **THEN** it gets a 1200 by 630 image with the Podcast Episode's cover on the left and its title on the right

#### Scenario: A private Topic's Podcast Episode has no card

- **WHEN** anyone requests the card of a Podcast Episode on a private or invite Topic
- **THEN** the response is not found

#### Scenario: The structured data is valid

- **WHEN** the page's JSON-LD is parsed
- **THEN** it is a `PodcastEpisode` with a `partOfSeries` that names the Topic's podcast feed, a `datePublished`, and an
  ISO 8601 duration

#### Scenario: A new Podcast Episode is announced

- **WHEN** a Podcast Episode of a public Topic publishes
- **THEN** IndexNow is told the podcast episode page's url

### Requirement: A private or invite Topic's Podcast Episodes have no public page

A Podcast Episode of a private or invite Topic SHALL have no public page. Its episode url SHALL open the Podcast
Episode's page, rendered in the browser, only for a signed-in user who may listen to the Podcast Episode, and SHALL
respond as missing for everyone else. The page SHALL stay out of the sitemap, and the server SHALL never render it for a
visitor or a crawler.

#### Scenario: A private Topic's podcast episode url is missing for a visitor

- **WHEN** a visitor, or a user who may not listen to the Podcast Episode, requests an episode url after a private or
  invite Topic's url
- **THEN** the response is not found

#### Scenario: An invite Topic's owner opens a podcast episode page

- **WHEN** the owner of an invite Topic opens one of its Podcast Episodes' urls
- **THEN** the Podcast Episode's page loads with its player, its chapters, and its transcript

#### Scenario: A late subscriber cannot open an earlier Podcast Episode's page

- **GIVEN** a subscriber of an invite Topic who joined after a Podcast Episode published
- **WHEN** the subscriber requests that Podcast Episode's url
- **THEN** the response is not found

#### Scenario: Nothing private is indexed

- **WHEN** any page or feed of a private or invite Topic's Podcast Episodes is served
- **THEN** it declares `noindex`, and the sitemap lists none of them
