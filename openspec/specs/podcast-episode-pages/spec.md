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
link previews: the Podcast Episode's title, a description, and its Open Graph image, the Podcast Episode's own card of
1200 by 630 pixels with its cover beside its title, its Topic's name, and its season, number, and length. The card SHALL
be drawn on its first request and stored, and its url SHALL change when what it shows changes. No episode page SHALL
include Open Graph audio tags, so a link preview opens the page instead of playing the Podcast Episode in place.

A public Topic's episode page SHALL describe itself with the Podcast Episode's own description, declare a canonical
url, and include `PodcastEpisode` JSON-LD with the Podcast Episode's name, description, url, publish date, duration,
episode number, season, the audio's url, and the series it belongs to. A page whose Topic is public but not yet shown
SHALL be `noindex`, as its topic page is. When a Podcast Episode of a public Topic publishes, search engines SHALL be
told about its page through IndexNow.

A private or invite Topic's episode page SHALL have its card alone: it SHALL be `noindex`, with no canonical url, no
JSON-LD, and no podcast feed. Its description SHALL be the Topic's sanitized description, the text the Topic's own page
head carries, and never the Podcast Episode's model-written description, which recounts the Topic's Findings to anyone
who fetches the head with no session.

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
- **THEN** the head has the Podcast Episode's title, the Topic's description in place of the Podcast Episode's, and its
  card as `og:image`, and it is `noindex` with no canonical url, no JSON-LD, and no `og:audio`

#### Scenario: A private Topic's episode head recounts no Findings

- **GIVEN** a private Topic whose Podcast Episode's description names what its Findings said
- **WHEN** anyone fetches that episode page's head
- **THEN** the description is the Topic's description, and none of the Podcast Episode's description is in the head

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

### Requirement: A Podcast Episode page credits the theme song

A note icon SHALL sit beside the Coffee Break podcast heading and beside each Podcast Episode title: on a Podcast
Episode page, beside the title heading and beside the title in the player card, and on a topic page, beside the podcast
section's heading and the title in its player card. The episode page's podcast line above the title SHALL have no note.
The note's popup SHALL open with the centered heading Coffee Break Theme Song, its song title linking to the song on
YouTube, then credit the song's lyrics and melody with the copyright year and the songwriter linking to the songwriter's
site, its performer, its producer, and its drummer. The popup and the podcast feed SHALL read the credits from one
config entry, and the Coffee Break docs page SHALL write the same credits. Under the credits the popup SHALL show the
song's lyrics from the lyrics file in the app's standard scroll box, with its orange border and orange scrollbar, each
section's heading over its lines, and SHALL show no lyrics box while the file holds none. The popup SHALL end with a
bold Enjoy 😊 link at its far right, below the lyrics, that opens the song on YouTube.

#### Scenario: The note credits the song, its songwriter, and its producer

- **WHEN** a visitor opens the note beside a public Podcast Episode's title
- **THEN** the popup reads Coffee Break Theme Song, then Lyrics and melody © 2022 Laura Atkinson, then Performed by
  Chase Wimberly, then Production by Jimmy Deer, then Drumming by Nate Barnes, and the heading's song title and the
  songwriter's name open their links in a new tab

#### Scenario: The lyrics show under the credits

- **WHEN** the lyrics file holds a Verse 1 section and a Chorus section
- **THEN** the popup shows a scroll box under the credits, with Verse 1 over its lines, then Chorus over its lines, and
  a bold Enjoy 😊 link below the box at the far right opens the song on YouTube

#### Scenario: The topic page's podcast section has the note

- **WHEN** a visitor opens a topic page with a published Podcast Episode
- **THEN** a note sits beside the Coffee Break podcast heading and beside the episode's title in the player card

### Requirement: Mobile episode links open the existing episode content in the app

The mobile app SHALL open accessible Podcast Episode links and podcast search results on an episode screen.
It SHALL show the web's title, description, Topic byline, player, transcript, other episodes, and similar podcasts.
Opening the page SHALL NOT start playback. Existing mobile Topic cards, seasons, and lists SHALL remain the Topic entry points.

#### Scenario: A search result opens its episode

- **WHEN** a person opens a podcast search result or an episode link inside the app
- **THEN** the episode screen opens with that episode selected and no browser handoff
- **AND** audio continues unchanged until the person uses a playback control

#### Scenario: An older episode opens from the existing list

- **WHEN** a person selects an earlier season and opens an episode title
- **THEN** the screen shows that season's episode, independent of the latest episode or an episode already playing
- **AND** its play control can replace the loaded episode

#### Scenario: A link carries an old Topic slug

- **WHEN** an episode link contains an old slug but identifies an accessible Topic, season, and episode number
- **THEN** the app resolves the episode by those identifiers and presents its current Topic information

### Requirement: Mobile episode presentation follows the web's responsive structure

The mobile episode screen SHALL match the web's narrow-screen structure, Nightshift typography, colors, icons, and formatting.
It SHALL use the player's chapter list without a second chapter table on a phone.
The large heading cover SHALL follow the web's width rule; the mini player and system controls SHALL show the episode cover.
Player and chapter controls SHALL remain separate from Finding links.

#### Scenario: The phone shows one chapter list

- **WHEN** an episode screen opens at phone width
- **THEN** its full player shows the segmented progress, controls, and expandable chapter list
- **AND** no duplicate chapter table or large heading cover consumes the narrow screen

#### Scenario: Chapter navigation stays independent of the Finding

- **WHEN** a listener selects a later or earlier chapter title or play pill
- **THEN** playback follows the player specification without opening the Finding reader
- **WHEN** they select that chapter's Finding action
- **THEN** the existing mobile Finding reader opens without an unintended seek or pause

#### Scenario: A long chapter remains usable

- **WHEN** titles, sources, durations, or translated system text require extra space
- **THEN** labels wrap or truncate as on the web without overlapping play, expand, or Finding controls
- **AND** accessible labels expose the complete action and chapter title

### Requirement: Mobile transcripts preserve the readable web transcript

The episode screen SHALL show the authorized episode's transcript with chapter headings, dashed dividers, speaker labels, and the web's text formatting.
The transcript SHALL start collapsed behind read more, expand into a bounded scroll area, and offer read less.
Missing transcript content SHALL use an explicit empty state and SHALL NOT display a previous episode's text.

#### Scenario: A listener reads the transcript

- **WHEN** a listener expands Episode transcript
- **THEN** all available sections appear in order, including the sign-off, with distinct speakers and chapter headings
- **AND** read less collapses the section without changing playback

#### Scenario: The transcript is empty or changes episode

- **WHEN** the selected episode has no transcript or its request is still loading
- **THEN** the screen shows the corresponding empty or loading state without stale transcript content

### Requirement: Mobile chapter ratings keep the web's targets and permissions

Chapter ratings SHALL use the same eligibility, rating target, selected state, and failure rollback as the web.
An available Finding SHALL open the existing Finding reader and its rating controls.
For an eligible chapter whose Finding was filtered out, an accessible chapter action SHALL offer its episode-chapter rating without inventing a Finding.
People without rating permission SHALL see no actionable rating control.

#### Scenario: A chapter still has its Finding

- **WHEN** an eligible listener opens the chapter's Finding and rates it
- **THEN** the existing Finding rating flow updates the same target as web and restores the previous state if the write fails

#### Scenario: A filtered-out Finding still permits a chapter rating

- **WHEN** an eligible listener opens the rating action for a chapter whose Finding identifier is absent
- **THEN** the app offers the web's chapter rating choices and submits an episode-chapter rating
- **AND** a rejected write restores the previous rating and shows the error

### Requirement: Mobile episode actions use the web's authorization and confirmations

The episode menu SHALL offer the web's permitted Add topic to team, Share topic, Report issue, and Remove episode actions.
Authorized episode removal from a page or episode row SHALL require the web's confirmation.
Confirmed removal SHALL stop that loaded episode, clear its resume state, and refresh affected lists; page removal SHALL return to the Topic.
Cancellation or failure SHALL retain the episode.

#### Scenario: Removal succeeds from the episode page

- **WHEN** an authorized owner or admin confirms Remove episode for the loaded episode
- **THEN** the app removes it, stops its audio, clears its system metadata and resume state, and opens the Topic
- **AND** stale load, autoplay, or retry responses cannot restart it

#### Scenario: Removal is cancelled or denied

- **WHEN** a person cancels the confirmation or the API rejects removal
- **THEN** no successful removal is shown and the page remains available according to current access
- **AND** a write failure shows feedback and permits retry

#### Scenario: A member opens another person's private Topic episode

- **WHEN** an authorized member opens that episode's menu
- **THEN** Add topic to team stays hidden where web hides it, and Remove episode appears only when explicitly allowed
- **AND** Share topic and Report issue act on the Topic through the existing mobile forms

### Requirement: Mobile episode gates and request states expose no private content

The mobile episode screen SHALL honor current episode access and join-date rules.
It SHALL distinguish loading, retryable request failure, missing episode, and the existing Topic gate.
An access denial SHALL clear protected episode content and audio. An offline failure SHALL NOT masquerade as confirmed permission loss.
Sign-in from a gate SHALL retain the episode destination.

#### Scenario: A visitor opens a gated episode

- **WHEN** a visitor opens an invite or private episode
- **THEN** the app shows the current Topic gate with the appropriate sign-in actions and no protected transcript, chapters, or player
- **AND** a private gate does not reveal the Topic's name

#### Scenario: A late subscriber opens an earlier episode

- **WHEN** an invite Topic subscriber requests an episode published before they joined
- **THEN** the screen treats that episode as unavailable according to the API, even if the Topic itself is accessible

#### Scenario: A request fails without an access decision

- **WHEN** an episode request fails because of connectivity or a server error
- **THEN** the screen offers retry and does not reveal stale protected content or claim that access was revoked

### Requirement: Mobile retains podcast credits and paused-show copy

Mobile SHALL retain the web's theme-song note placement, credits, lyrics, links, and paused-show copy.
The credits SHALL open in an accessible sheet using the same content as web.
Playback and transcripts SHALL retain the episode's sign-off. Disabling future episodes SHALL NOT hide already published episodes or their playback controls.

#### Scenario: The theme-song note opens

- **WHEN** a listener presses the note beside Coffee Break or an episode title
- **THEN** a sheet shows the shared song credits, available lyrics, and the same destination links as web

#### Scenario: The show is paused

- **WHEN** the Topic stops producing new episodes but has published episodes
- **THEN** mobile shows the web's paused-show explanation and retains access to permitted published episodes

### Requirement: Mobile podcast states remain accessible in both themes

Mobile podcast screens and sheets SHALL preserve meaningful loading, empty, error, disabled, selected, and expanded states in light and dark themes.
Controls SHALL expose labels, playback state, and adjustable progress to assistive technology.
Text scaling, safe areas, keyboard appearance, and open sheets SHALL NOT obscure required controls.
Listener counts SHALL accept the shared count display input without fabricating a live value.

#### Scenario: A listener adjusts progress with accessibility controls

- **WHEN** a screen-reader user adjusts the seek control or activates a chapter
- **THEN** playback performs the same seek as touch input and announces meaningful position and chapter information

#### Scenario: A count is unavailable

- **WHEN** no current listener-count value has been supplied
- **THEN** the display follows the shared unavailable state instead of inventing a count or starting an independent polling loop
