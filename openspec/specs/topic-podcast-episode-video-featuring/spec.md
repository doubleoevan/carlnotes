# topic-podcast-episode-video-featuring Specification

## Purpose
Films get their own shelves on the home page, on a person's Café, and on a team page: picked films first, then a
fallback by the podcast rules, always placed right before the podcast sections they pair with.

## Requirements

### Requirement: A film card is the podcast episode card with the film's image and a play button that opens the film

A film card SHALL show what a podcast episode card shows, in the same frame, with the film's own image in the image's
place, or the podcast episode's image until the film has one. The film player's round play button, labeled "Play film",
SHALL sit centered over that image, and nothing SHALL sit beside the title. A press SHALL open the film in the Video
dialog on web and the full-screen sheet on mobile and play it, and SHALL leave the film on its poster where the platform
refuses the play.

#### Scenario: The play button sits over the image

- **WHEN** a film card renders
- **THEN** its play button is centered over the image, its title row holds only the title, and a press on the image
  outside the button opens the podcast episode's page

#### Scenario: The play button opens the dialog and plays the film

- **WHEN** a user presses the play button on a film card on the home page
- **THEN** the Video dialog opens with that film, and the film plays once it loads

#### Scenario: The card shows the film's own image

- **GIVEN** a Podcast Episode whose film has its own image
- **WHEN** its film card and its podcast card render
- **THEN** the film card shows the film's image, cropped to the card's frame, and the podcast card shows the podcast
  episode's image

#### Scenario: A film without its own image

- **WHEN** a film card renders for a film whose own image was never drawn
- **THEN** it shows the podcast episode's image, or its Topic's

### Requirement: The home shows Featured films and New films this week before the home podcasts

Both faces of the home page SHALL show a collapsible Featured films section and then a collapsible New films this week
section, right before the Featured podcasts section. Each SHALL show six film cards a page with the home sections'
pager. Every card SHALL be in the server's HTML. A section with no film SHALL be hidden.

#### Scenario: Film sections lead the podcast sections

- **WHEN** a visitor opens a home page that has films
- **THEN** Featured films and New films this week appear in that order, directly above Featured podcasts

#### Scenario: Every card without script

- **GIVEN** nine films new this week
- **WHEN** a browser without JavaScript opens the home page
- **THEN** New films this week lists all nine cards

#### Scenario: No films, no sections

- **WHEN** no public Topic has a film
- **THEN** neither film section renders

### Requirement: The home's Featured films lists the admin's picks, then the home podcasts' fallback

The home's Featured films SHALL list the films an admin pinned, in order, then the films of public shown Topics by
their podcast episode's listener count, one per Topic, until twelve. An admin SHALL pin from the podcast episode page's
action menu with Home films, shown only for a ready film on a public Topic. Only an admin's request SHALL change a pin.

#### Scenario: A pin leads the section

- **WHEN** an admin pins a film at position one
- **THEN** that film leads the home's Featured films on the next cache refresh

#### Scenario: Unpinned films fall back by listeners

- **GIVEN** no pinned film and three public Topics whose films have 40, 10, and 25 listeners
- **WHEN** the home renders
- **THEN** Featured films lists them 40, 25, then 10

#### Scenario: A non-admin cannot pin

- **WHEN** a request to pin a film arrives from a user who is not an admin
- **THEN** it is rejected, and no pin changes

### Requirement: New films this week lists the past seven days' films, newest first

New films this week SHALL list the ready films of public shown Topics whose podcast episode published in the last
seven days, newest first, and only those.

#### Scenario: A new film joins and leaves

- **WHEN** a public Topic's podcast episode publishes and its film finishes rendering
- **THEN** the film appears in New films this week on the next cache refresh, and leaves seven days after the publish

#### Scenario: A private Topic's film never shows

- **WHEN** a private Topic's film finishes rendering
- **THEN** it appears in neither home film section

#### Scenario: A week with no new film shows no section

- **WHEN** no public shown Topic's podcast episode with a ready film published in the last seven days
- **THEN** the home shows no New films this week section, and Featured films sits directly above Featured
  podcasts

### Requirement: The Café shows Featured Films right before Featured Podcasts

A person's Café SHALL show a collapsible Featured Films section right before Featured Podcasts. It SHALL list the
person's pinned films, then the rest of their films by Featured Podcasts' fallback rule, six a page, paging through all
of their films, with every card in the server's HTML. Anyone but the person SHALL see films on public Topics only. A
Café with no film SHALL show no section.

#### Scenario: A visitor sees public films only

- **GIVEN** a person with films on one public and one private Topic
- **WHEN** a visitor opens their Café
- **THEN** Featured Films holds only the public Topic's film

#### Scenario: No film, no section

- **WHEN** a person has no film
- **THEN** their Café shows no Featured Films section

### Requirement: The Café's owner pins up to twelve films from its action menu

A person's own Café SHALL offer Featured films in its action menu, on web and mobile. It SHALL open the same rank dialog
as Featured podcasts. The pins SHALL follow the Café's pin rules: the owner alone, public Topics only, at most twelve,
contiguous from one, and released if the Topic leaves the public set or the podcast episode is removed.

#### Scenario: A thirteenth film pin is rejected

- **WHEN** an owner with twelve pinned films asks to pin another
- **THEN** it is rejected as a conflict, and the twelve keep their positions

#### Scenario: A visitor sees no film pin option

- **WHEN** anyone but the person opens the Café's action menu
- **THEN** it holds no Featured films option

### Requirement: The team page shows Featured Films right before Featured Podcasts

A team page SHALL show a collapsible Featured Films section right before Featured Podcasts, on web and mobile. It SHALL
list the ready films of the published Podcast Episodes of the Topics the reader may open: the films their owners
pinned on their Cafés first, then the most listened one of each other Topic, six a page with the whole count beside
the title. A team SHALL hold no film pins of its own, and a team page with no film SHALL show no section.

#### Scenario: A member sees every Topic's films

- **GIVEN** a team that holds a private Topic and a public Topic, each with a ready film, the public Topic's pinned
  on its owner's Café
- **WHEN** a member opens the team page
- **THEN** Featured Films shows both films, the pinned one first, directly above Featured Podcasts

#### Scenario: A visitor sees the public Topics' films alone

- **GIVEN** the same team, with a public page
- **WHEN** a visitor or a user who is not on the team opens it
- **THEN** Featured Films holds only the public Topic's film

#### Scenario: A team with no film shows no section

- **WHEN** none of the team's Topics that the reader may open has a ready film of a published Podcast Episode
- **THEN** the team page shows no Featured Films section, and its action menu holds no films option

### Requirement: The podcast episode page offers Featured films to the Topic's owner

On web and mobile, the podcast episode page's action menu SHALL offer Featured films right above Featured podcasts, to
whoever it offers Featured podcasts, only if the Podcast Episode has a ready film. It SHALL open the Café's rank dialog
for films with this film offered a place, under the Café's pin rules. The topic page's menu, which has no Featured
podcasts for a Podcast Episode, SHALL offer neither.

#### Scenario: The owner pins the film from its page

- **WHEN** a public Topic's owner opens the action menu on the page of a published Podcast Episode with a ready film
- **THEN** Featured films shows directly above Featured podcasts, and it opens the Featured films dialog with this
  film offered a place

#### Scenario: No film, no option

- **WHEN** the same owner opens the action menu on a Podcast Episode with no ready film
- **THEN** the menu holds Featured podcasts and no Featured films

#### Scenario: Anyone else sees neither

- **WHEN** a user who does not own the Topic opens the action menu
- **THEN** it holds no Featured films and no Featured podcasts

### Requirement: Film sections always sit right before the podcast sections they pair with

A film section SHALL sit right before its podcast section: Featured films before Featured podcasts on the home page,
Featured Films before Featured Podcasts on the Café and on a team page, and Coffee Break films before Coffee Break
podcast episodes on the topic page. The one exception is the podcast episode page, where Coffee Break podcast SHALL
come first and Coffee Break Cinema after it. Web and mobile SHALL match. The home's New podcasts this week SHALL sit
directly below Featured podcasts.

#### Scenario: The mobile Café keeps the order

- **WHEN** a user opens a Café with films and podcasts in the mobile app
- **THEN** Featured Films sits directly above Featured Podcasts, as on the web

#### Scenario: The home's podcast sections follow its film sections

- **WHEN** a visitor opens a home page with films and podcasts new this week
- **THEN** the sections read Featured films, New films this week, Featured podcasts, New podcasts this week, in that
  order, on the web and in the mobile app

#### Scenario: The podcast episode page leads with the podcast

- **WHEN** a user opens the page of a Podcast Episode that has a film, on the web or in the mobile app
- **THEN** Coffee Break podcast sits above Coffee Break Cinema

### Requirement: Film headings never say video

The film sections' headings SHALL read "Featured films" and "New films this week" on the home page, "Featured Films"
on the Café and on a team page, and "Coffee Break films" on the topic page, each cased as the neighbouring sections on
the same page. No heading SHALL contain the word video. No film section SHALL show a notice, a warning, or explanatory
text.

#### Scenario: Headings use film

- **WHEN** a home page with films renders
- **THEN** neither film section's heading contains "video"
