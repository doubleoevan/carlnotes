# podcast-episode-player Specification

## Purpose
TBD - created by archiving change coffee-break-podcast. Update Purpose after archive.
## Requirements
### Requirement: The topic page shows the latest Podcast Episode in a player under the title

On a Topic with a published Podcast Episode that the user may listen to, the topic page SHALL show a player directly
under the topic title and above the findings section, following the wireframes in `docs/design/podcast/`. Its section
heading SHALL read "Coffee Break podcast". It SHALL show the latest Podcast Episode's season,
episode number, title, publish date, length, and chapter count, a seek bar split by chapter, a playback rate button once
the Podcast Episode is loaded, a Subscribe button, and a chapter list: the first three chapters shown, with a control
under the card that shows the rest. The page's html SHALL include every chapter, and in a browser without JavaScript
every chapter SHALL show and the control SHALL not. A chapter's title SHALL play the Podcast Episode from that chapter,
and a press anywhere else on its row SHALL open the note of its Finding, as a row in the findings list does. A chapter
whose Finding the user cannot see SHALL play from its whole row. A press on the seek bar SHALL play the Podcast Episode from the position that was pressed. The Podcast Episode's
details line SHALL end with "Carl and Vienna are AI voices", and while the Podcast Episode is loaded in the player that
line SHALL show the chapter that is playing instead. Once the Podcast Episode is loaded, a pill beside the section
heading SHALL read "Playing" or "Paused" and SHALL pause or play the Podcast Episode. Each chapter's row SHALL show
the chapter's pill, such as `E14 · ch 2`, the same pill as on the Finding it narrates, which plays or pauses the chapter
and is highlighted while it plays. Until the user starts the published Podcast Episode that the player shows, the heading
SHALL show "new episode" in its place. A Topic with no Podcast Episode that the user may listen to SHALL show no player,
unless the player shows the recording state or a failed Podcast Episode, as the next requirement describes.

#### Scenario: The player sits under the title

- **WHEN** a user opens a Topic with a published Podcast Episode
- **THEN** the player renders between the topic title and the findings section, showing the latest Podcast Episode's
  season, number, title, date, and length

#### Scenario: The chapter list collapses past three

- **WHEN** the latest Podcast Episode has twelve chapters
- **THEN** the player lists the first three chapters, and a control under the card reads "+ 9 chapters"

#### Scenario: A chapter's title plays it, and its row opens its Finding

- **WHEN** a listener presses chapter 2's title, and then the rest of chapter 3's row
- **THEN** the Podcast Episode plays from chapter 2 with no note open, and then the note of chapter 3's Finding opens
  over the player

#### Scenario: Every chapter shows without JavaScript

- **GIVEN** a latest Podcast Episode with twelve chapters
- **WHEN** a visitor whose browser runs no script opens the page
- **THEN** the player lists all twelve chapters and shows no control to expand the list

#### Scenario: A press on the seek bar starts the Podcast Episode there

- **GIVEN** a Podcast Episode that is not playing
- **WHEN** a listener presses the seek bar at its midpoint
- **THEN** the Podcast Episode plays from the middle

#### Scenario: The voices are labeled as AI

- **WHEN** the player renders a Podcast Episode that is not loaded
- **THEN** the Podcast Episode's details line ends with "Carl and Vienna are AI voices"

#### Scenario: A Topic without Podcast Episodes shows no player

- **WHEN** a user opens a Topic that has no Podcast Episode and no running Scan
- **THEN** no player renders and the page is otherwise unchanged

### Requirement: A Podcast Episode opened by its id shows its state until it can play

The topic page SHALL open one Podcast Episode by its id from a link, such as the digest's, for a user who may listen to
it. If that Podcast Episode is still rendering, the player SHALL show its title, SHALL say that Carl and Vienna are
recording, SHALL check the Podcast Episode every few seconds, and SHALL show it ready to play once it publishes. The
player SHALL never start a Podcast Episode that no press started. If the render failed, the player SHALL say "Coffee
Break podcast failed to record." An id that the user may not listen to, or one that does not exist, SHALL open the topic
page as usual with no Podcast Episode selected. While a Scan runs on a Topic whose Scans render a Podcast Episode, the
topic page SHALL show the same recording state before the Podcast Episode exists, with "Coffee Break podcast" in place
of the title and a cover that says the hosts are recording. With no Podcast Episode in the url, a user who may listen to
the Topic's rendering Podcast Episode SHALL see it in the same recording state, with its cover, in place of the latest
Podcast Episode unless the player has one of the Topic's Podcast Episodes loaded. The page SHALL keep checking while
that Podcast Episode renders, and for a short time after a Scan finishes, and once the Podcast Episode publishes the
player SHALL show it ready to play without starting it. If the Topic's newest Podcast Episode failed to render, the
topic page SHALL show that to a user who may start a Scan of the Topic, as
"Coffee Break podcast failed to record. Brew to try again...", where "Brew" is the page's own scan button, until a
later Podcast Episode of the Topic is rendering or published. A user who may not start a Scan SHALL see the latest
Podcast Episode instead.

#### Scenario: The recording state shows while a Scan runs

- **GIVEN** a Topic whose podcast is on and whose owner's plan renders another Podcast Episode
- **WHEN** a Scan of the Topic is running
- **THEN** the player says "Carl and Vienna are recording..." under the heading "Coffee Break podcast", beside a cover
  that reads "Coffee Break podcast" and "Recording in progress..."

#### Scenario: A rendering Podcast Episode shows without a link

- **GIVEN** a Topic whose newest Scan started a Podcast Episode that is still rendering
- **WHEN** a user who may listen to it opens the topic page with no Podcast Episode in the url
- **THEN** the player shows the Podcast Episode's cover and title and says Carl and Vienna are recording, and once the
  Podcast Episode publishes the player shows it ready to play without starting it

#### Scenario: A rendering Podcast Episode says so and then is ready

- **GIVEN** a reader who follows the digest's link while the Podcast Episode is rendering
- **WHEN** the topic page opens
- **THEN** the player shows the Podcast Episode's title and says Carl and Vienna are recording, and once the Podcast
  Episode publishes the player shows it ready to play and does not start it

#### Scenario: A failed render says so

- **WHEN** a reader follows a link to a Podcast Episode whose render failed
- **THEN** the player says "Coffee Break podcast failed to record.", and offers no play control for it

#### Scenario: A failed render offers the owner a Scan

- **GIVEN** a Topic whose newest Podcast Episode failed to render
- **WHEN** the Topic's owner opens the topic page with no Podcast Episode in the url
- **THEN** the player says "Coffee Break podcast failed to record. Brew to try again...", and pressing "Brew" starts a
  Scan

#### Scenario: A failed render stays out of a subscriber's page

- **GIVEN** a Topic whose newest Podcast Episode failed to render
- **WHEN** a subscriber who may not start a Scan opens the topic page with no Podcast Episode in the url
- **THEN** the player shows the latest published Podcast Episode, or nothing if the Topic has none

#### Scenario: A published Podcast Episode opens ready

- **WHEN** a reader follows a link to a published Podcast Episode
- **THEN** the player shows that Podcast Episode, ready to play, instead of the latest one

#### Scenario: An unknown id opens the page as usual

- **WHEN** a reader follows a link with a Podcast Episode id that they may not listen to
- **THEN** the topic page opens with its latest Podcast Episode, if any, and no error

### Requirement: The player streams from a short-lived URL and resumes where the listener stopped

The player SHALL play through one audio element. It SHALL load the Podcast Episode's stable audio url, which redirects
to a short-lived presigned object storage URL that supports range requests, so seeking never downloads the whole file.
For a signed-in listener it SHALL start at their saved progress. If the presigned URL has expired, the player SHALL load
the stable url again and continue from the same position.

#### Scenario: A listener resumes

- **GIVEN** a listener who stopped a Podcast Episode at 12:40
- **WHEN** they press play on it again, on any device
- **THEN** playback starts at 12:40

#### Scenario: Seeking uses a range request

- **WHEN** a listener drags the seek bar to chapter 8
- **THEN** the browser requests that byte range instead of the whole file

#### Scenario: An expired URL recovers

- **GIVEN** a listener who paused for longer than the presigned URL lasts
- **WHEN** they press play
- **THEN** the player loads the stable url again and continues from the saved position

### Requirement: Listen state is saved per user, at most every 30 seconds

For a signed-in listener the player SHALL record plays, progress, and completion in that user's own listen state, never
on the Podcast Episode. It SHALL save progress at most once every 30 seconds while playing, and once more on pause and
when the page is hidden, each as one upsert for that listener and Podcast Episode. A signed-out visitor's listening
SHALL NOT be saved.

#### Scenario: Progress saves on a timer and on pause

- **WHEN** a signed-in listener plays for 70 seconds and pauses
- **THEN** at most three progress saves were sent while playing, plus one on pause

#### Scenario: Completion is recorded

- **WHEN** a signed-in listener plays a Podcast Episode to its end
- **THEN** their listen state records the Podcast Episode as completed

#### Scenario: A visitor's listening is not saved

- **WHEN** a signed-out visitor plays a public Topic's Podcast Episode
- **THEN** no progress request is sent

### Requirement: Lock-screen controls show the Podcast Episode and skip chapters

The player SHALL use the Media Session API, so the device's lock-screen and media controls show the Podcast Episode's
title, the current chapter's title, and the Podcast Episode's cover as the artwork. The topic page's player SHALL show
no cover, as its wireframe has none. The next and previous controls SHALL skip to the next and previous chapter.

#### Scenario: Next skips a chapter

- **GIVEN** a Podcast Episode playing chapter 2
- **WHEN** the listener presses next on the lock screen
- **THEN** playback moves to the start of chapter 3, and the lock screen shows chapter 3's title

### Requirement: A chapter's thumbs rate its Finding, or the chapter once its Finding is filtered out

Each chapter in the player SHALL offer thumbs to a user who may rate the Topic's Findings. If the Topic still has the
chapter's Finding, the thumbs SHALL write the same rating as that Finding's thumbs in the feed, through the same route
and the same permission. If a Scan filtered the Finding out, the thumbs SHALL write a rating on the chapter itself under
the same permission. A later Finding of the chapter's Resource on the same Topic SHALL take the newest chapter rating,
and the chapter SHALL then narrate that Finding. A user who may not rate the Topic's Findings SHALL see no chapter
thumbs.

#### Scenario: A chapter thumb rates the Finding

- **WHEN** an owner gives chapter 2 a thumbs up
- **THEN** the Finding that chapter narrates shows a thumbs up in the findings list

#### Scenario: A chapter whose Finding was filtered out keeps its rating

- **GIVEN** a chapter whose Finding a Scan filtered out
- **WHEN** an owner gives the chapter a thumbs down, and a later Scan finds the chapter's Resource again
- **THEN** the chapter shows the thumbs down after a reload, and the new Finding is rated thumbs down, so no Podcast
  Episode narrates it

#### Scenario: A visitor sees no thumbs

- **WHEN** a signed-out visitor opens a public Topic's player
- **THEN** its chapters show no thumbs

### Requirement: Narrated Findings show a pill, and the one that is playing is highlighted

A Finding narrated in the Topic's latest Podcast Episode SHALL show a small pill in the findings list naming the episode
and the chapter, such as `E14 · ch 2`, in primary-colored text on a muted fill. While the Podcast Episode plays, the
Finding of the current chapter SHALL be highlighted and its pill's fill SHALL turn the primary color, with the same
text. Selecting a pill SHALL play the Podcast Episode from that chapter, and selecting the pill of the chapter that is
playing SHALL pause the Podcast Episode.

#### Scenario: A narrated Finding shows its pill

- **WHEN** the latest Podcast Episode's second chapter narrates a Finding
- **THEN** that Finding's row shows `E14 · ch 2`

#### Scenario: The Finding that is playing is highlighted

- **WHEN** the Podcast Episode is playing its second chapter
- **THEN** that Finding's row is highlighted and its pill's fill is the primary color

#### Scenario: The pill of the chapter that is playing pauses the Podcast Episode

- **GIVEN** a Podcast Episode that is playing its second chapter
- **WHEN** a listener presses the pill of that chapter's Finding
- **THEN** the Podcast Episode pauses and the pill returns to its muted fill

### Requirement: An episodes card lists every Podcast Episode by season

The topic page SHALL show an episodes card in the right column, directly above the scan history card, with the heading
"Coffee Break podcast episodes". It SHALL list the Topic's published Podcast Episodes that the user may listen to,
newest first, each row showing its episode number, title, publish date, and length. It SHALL show one tab per season
that has Podcast Episodes, with the url's season selected, or the newest season that has Podcast Episodes if the url
names none. It SHALL show a season's Podcast Episodes five to a page, the newest page first, with a centered row of page
numbers under the card if the season has more than five. The row SHALL look and behave like the page numbers under a
homepage section: a previous arrow, the page numbers with the current one highlighted, and a next arrow. A browser
without JavaScript SHALL not show the row. Every Podcast Episode of the newest season SHALL arrive with the topic page
and SHALL be in the page that the server renders, each with the link to its own page. With JavaScript, the rows of the
other pages SHALL be hidden, and a browser without JavaScript SHALL show the whole season. A season's tab SHALL be a
link to the topic page with that season in its query, such as `?season=2025`, and the newest season's tab SHALL link the
topic page with no season. A page that the server renders for a url that names a season SHALL list every Podcast Episode
of that season, and its canonical url SHALL stay the topic page's own. In a browser with JavaScript a tab SHALL change
the season in place, without a page load and without moving the scroll position. While an older season loads the card
SHALL show the loading animation in place of the rows, at the height of five rows. A row's round play button SHALL play
that Podcast Episode, and while the Podcast Episode plays the button SHALL pause it, the same playback that the player's
own button controls. A press anywhere on the row outside its title link SHALL do what the button does. The button of the
Podcast Episode that the player shows SHALL be in the primary color. Each row's title SHALL link to that Podcast
Episode's own page, and so SHALL the Podcast Episode's title in the player.

#### Scenario: Seasons are tabs

- **GIVEN** a Topic with Podcast Episodes in 2025 and 2026
- **WHEN** the card renders in 2026
- **THEN** it shows tabs for 2026 and 2025 with 2026 selected

#### Scenario: A season has its own address

- **GIVEN** a public Topic with Podcast Episodes in 2025 and 2026
- **WHEN** a crawler follows the 2025 tab's link
- **THEN** the page that the server renders lists every 2025 Podcast Episode with the link to its page, and declares the
  topic page's own url as canonical

#### Scenario: A season shows five Podcast Episodes to a page

- **WHEN** the selected season has thirteen Podcast Episodes
- **THEN** the card shows the newest five, and the row under the card shows pages 1, 2, and 3 with 1 highlighted

#### Scenario: A page number opens its page

- **GIVEN** a season with thirteen Podcast Episodes showing its first page
- **WHEN** a listener presses 3
- **THEN** the card shows the season's three oldest Podcast Episodes, 3 is highlighted, and the next arrow is disabled

#### Scenario: A browser without JavaScript shows the whole season

- **GIVEN** a public Topic whose newest season has thirteen Podcast Episodes
- **WHEN** a browser without JavaScript opens the topic page
- **THEN** the card lists all thirteen Podcast Episodes, each title a link to its Podcast Episode's page, and shows no
  page numbers

#### Scenario: A season of five or fewer has no page numbers

- **WHEN** the selected season has three Podcast Episodes
- **THEN** the card shows all three and no row of page numbers

#### Scenario: Another season opens on its first page

- **GIVEN** the 2026 season showing its second page
- **WHEN** a listener presses the 2025 tab
- **THEN** the card shows the first page of the 2025 season

#### Scenario: A row's button follows the playback

- **GIVEN** a Podcast Episode that is playing
- **WHEN** the card renders that Podcast Episode's row
- **THEN** the row's button shows pause, and pressing it pauses the player

#### Scenario: The player's Podcast Episode is marked in the card

- **GIVEN** a player that shows a season's third Podcast Episode
- **WHEN** the card renders that season
- **THEN** the third Podcast Episode's button is in the primary color and every other row's button is not

#### Scenario: The list is in the server's html

- **GIVEN** a public Topic with a published Podcast Episode
- **WHEN** a crawler requests the topic page and runs no script
- **THEN** the html lists the newest season's Podcast Episodes, each title linked to its Podcast Episode's page

#### Scenario: The latest Podcast Episode is marked

- **WHEN** the card lists the Topic's newest Podcast Episode
- **THEN** its row is marked as the latest

### Requirement: The edit topic modal turns the podcast on and off, and the settings card shows its state

The edit topic modal SHALL show a podcast switch at its bottom, after Attachments, for a saved Topic. A switch flipped
there SHALL save with the modal's Save through the shared settings tool, the same one that the chat and the MCP server
use, and a plan rejection SHALL be shown while the Topic's other fields stay saved. On a Topic on the free plan that has
used its one Podcast Episode, the switch SHALL also show the plan's limit, and the owner SHALL get the upgrade link
beside the switch, which still turns the podcast off. The Topic's settings card SHALL show "Podcast" right-aligned on
its last row, beside Cost this month, that reads "On" or "Off", with no control.

#### Scenario: The settings card shows the state

- **WHEN** a user views the settings card of a Topic that has a podcast
- **THEN** its last row shows "Podcast" at the right, reading "On" or "Off", with no switch

#### Scenario: The edit topic modal saves the switch with its other fields

- **WHEN** the owner opens the edit topic modal, turns the switch at its bottom off, and saves
- **THEN** the Topic's fields and the switch are both saved, and the settings card's Podcast reads "Off"

#### Scenario: A Topic on the free plan past its one Podcast Episode shows the upgrade link

- **GIVEN** a Topic on the free plan that already has one published Podcast Episode
- **WHEN** the owner opens the edit topic modal
- **THEN** the podcast switch shows the upgrade link to the plans page

#### Scenario: An owner on the free plan's other Topic still has its switch

- **GIVEN** an owner on the free plan whose first Topic has used its Podcast Episode
- **WHEN** they open the edit topic modal of a second Topic that has no Podcast Episode yet
- **THEN** its podcast switch shows no plan limit and no upgrade link

### Requirement: A podcast player docks at the bottom while a Podcast Episode is loaded

On a phone the player SHALL be a compact card. Once a listener starts a Podcast Episode, a podcast player SHALL dock at the
bottom of the screen and SHALL stay there on every page while that Podcast Episode is loaded, whether or not the player
card is in view. It SHALL show the Podcast Episode's cover in its square icon slot, its number and title, and the
current chapter, with play and pause. Its cover and title SHALL link to the Podcast Episode's own page once the Podcast
Episode publishes, and a hover anywhere on them SHALL underline the title. The chat pill SHALL sit above the podcast player while the podcast player shows, and
SHALL return to its place once the podcast player is gone.

#### Scenario: The podcast player appears once a Podcast Episode starts

- **WHEN** a listener starts a Podcast Episode
- **THEN** a podcast player docks at the bottom with the podcast episode number, title, and current chapter

#### Scenario: The podcast player links to the Podcast Episode's page

- **WHEN** a listener presses the docked podcast player's title
- **THEN** the Podcast Episode's own page opens

#### Scenario: The podcast player stays beside the player card

- **GIVEN** a Podcast Episode that a listener started
- **WHEN** the player card is in view, or the listener opens another page
- **THEN** the podcast player is still docked

#### Scenario: The chat pill moves up

- **WHEN** the podcast player is docked
- **THEN** the chat pill sits above it, and neither covers the other

#### Scenario: Nothing loaded, no podcast player

- **WHEN** a listener has started no Podcast Episode
- **THEN** no podcast player shows

### Requirement: The player autoplays the listener's next unplayed Podcast Episode

When a Podcast Episode ends, the player SHALL play the signed-in listener's next unplayed Podcast Episode from their
other Topics: the latest published Podcast Episode of a Topic they own or subscribe to that they have not played, newest
first. Playback SHALL continue while the listener moves between pages. If there is none, or the listener is signed out,
playback SHALL stop.

#### Scenario: The next Topic's Podcast Episode plays

- **GIVEN** a listener who subscribes to two Topics and has not played the second Topic's latest Podcast Episode
- **WHEN** the first Topic's Podcast Episode ends
- **THEN** the second Topic's latest Podcast Episode starts

#### Scenario: Nothing unplayed, playback stops

- **WHEN** a Podcast Episode ends and the listener has played every other Topic's latest Podcast Episode
- **THEN** playback stops

### Requirement: An invite Topic's subscriber gets the Podcast Episodes published after they joined

On an invite Topic, a subscriber SHALL see and listen to only Podcast Episodes published after their subscription was
activated, in the player, the episodes card, the scan history pills, and autoplay. The owner and anyone with a team role
on the Topic SHALL get every Podcast Episode.

#### Scenario: An earlier Podcast Episode is not shown

- **GIVEN** an invite Topic with Podcast Episodes 1 through 5, and a subscriber who joined after Podcast Episode 3
  published
- **WHEN** the subscriber opens the topic page
- **THEN** the player and the episodes card show Podcast Episodes 4 and 5 only

#### Scenario: The owner sees every Podcast Episode

- **WHEN** the owner of that Topic opens the podcast episodes card
- **THEN** it lists Podcast Episodes 1 through 5

