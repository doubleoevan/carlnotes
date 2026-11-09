# home-page Specification

## Purpose
The home route shows a visitor what CarlNotes is and shows a user their own Topics, both built from the featured topics
and podcast episodes: the pinned Topics and Podcast Episodes first, then the trending ones.

## Requirements

### Requirement: The home route has a visitor face and a user face

`/` SHALL render a visitor's face on the server, cached at the edge under the `rendered` and `home` tags, and a user's
face in the browser, chosen by the session. The directory SHALL live at `/topics`, one click away from both faces.

#### Scenario: A visitor is served from the edge

- **WHEN** a request with no session cookie fetches `/`
- **THEN** the HTML holds the visitor face and the response carries the edge headers of a rendered page with the
  `home` tag

#### Scenario: A user opens their own face

- **WHEN** a signed-in user opens `/`
- **THEN** the page shows the headline, their Updates, the featured cards, and their Topics as cards, rendered in
  the browser

### Requirement: The visitor face shows the hero, the headline, how it works, and the featured cards

The visitor face SHALL show, in order, Carl's hero, the headline "He already read it. All of it." under the search bar
with the New Topic button on its right, how it works in three steps, each step's number beside its heading, the
featured Topic cards, the featured Podcast Episode cards, and the Podcast Episode cards new this week, each Podcast
Episode card with a play button that plays inline. Each card section SHALL be drawn as the Topics page's sections
are, open at first with its count at the right and a divider only while closed, and SHALL show six cards a page,
with every card in the html for a reader without JavaScript. It SHALL show no
sign-in section, notice, warning, or explanatory text beyond those. The tutorial video button SHALL sit beside the logo
on every page, never in the hero, and "All of it." SHALL link to the Topics page on both faces.

#### Scenario: A visitor plays a featured podcast episode in place

- **WHEN** a visitor presses play on a featured Podcast Episode card
- **THEN** the podcast episode plays on the home page without a navigation

### Requirement: The user face shows the headline, Updates, the featured cards, and your Topics

The user face SHALL show the visitor face's headline beside the New Topic button, then the Updates card in how it
works' place, then the featured cards, then the user's owned and followed Topics as cards under "Your topics". The home
payload SHALL hold the first six of those Topics and their total, and each later page of six SHALL be requested from
the server when the user opens it. A user with no Topic SHALL see the New Topic button in the cards' place.

#### Scenario: A new user sees where to start

- **WHEN** a user with no Topic opens `/`
- **THEN** the featured cards show and the New Topic button stands where their Topics would

#### Scenario: A user with many Topics pages through them

- **WHEN** a user who owns or follows twelve Topics opens `/` and then the second page of Your topics
- **THEN** the home payload holds six Topic cards and a total of twelve, and the second page requests the next six

### Requirement: Featured topics and podcast episodes are pinned first, then trending, from a cached query

The featured topics and podcast episodes SHALL be the Topics holding a feature order, in order, then the trending public
shown Topics until twelve, and the Podcast Episodes holding a feature order, then published Podcast Episodes of public
shown Topics by listener count until twelve, one per Topic. Beside them, the new Podcast Episodes SHALL be the Podcast
Episodes of public shown Topics published in the last seven days, newest first. They SHALL come from one cached entry
with a short time to live, never computed per request, and only public shown Topics and their published Podcast Episodes
SHALL ever appear.

#### Scenario: A new podcast episode reaches the home unpinned

- **WHEN** a public shown Topic publishes a Podcast Episode
- **THEN** it leads the New podcasts this week cards on the next cache refresh, with no pin and no listener, and
  leaves them seven days after its publish

#### Scenario: A pin leads the featured topics

- **WHEN** an admin pins a Topic at position one
- **THEN** the home's first featured Topic card is that Topic on the next cache refresh

#### Scenario: A private Topic never features

- **WHEN** a pinned Topic turns private
- **THEN** it leaves the featured topics and the home page is purged at the edge

### Requirement: The home carries site and list structured data

The visitor face's head SHALL include `WebSite` JSON-LD and an `ItemList` JSON-LD naming each featured Topic with its
position, name, and url.

#### Scenario: A crawler reads the featured list

- **WHEN** a crawler fetches `/`
- **THEN** the head holds an ItemList whose entries are the featured Topics in order

### Requirement: The home reports its face and its card opens

The browser SHALL send one `home_view` event with the face shown and one `featured_card_open` event with a card's kind
and id when a featured card is opened. No event SHALL carry text.

#### Scenario: A visitor's view is counted by face

- **WHEN** a visitor's home renders
- **THEN** one `home_view` event is sent with `face` set to visitor
