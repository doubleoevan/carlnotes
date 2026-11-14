## ADDED Requirements

### Requirement: The home is one read, and visitors share one copy of it

`GET /api/home` SHALL stay the home's one read. A visitor's whole payload SHALL be served from one 60-second copy, as
the page-reads capability states, and every clear of the home's cached ids SHALL clear that copy too. A signed-in home's
request MAY ask for the first page of the user's news in the same read, which is null if the news read fails. The day's
opener SHALL stay a read of its own.

#### Scenario: Visitors cost one home build a minute

- **WHEN** a thousand visitors load the home inside a minute
- **THEN** the payload is built only by the reads that found no copy, and a warm read sends no query

#### Scenario: A pin reaches the next visitor

- **WHEN** an admin pins a Topic at position one
- **THEN** the home's cached ids and the visitors' copy are cleared together, and the next visitor's home leads with
  that Topic

#### Scenario: A signed-in home asks for its news

- **WHEN** a signed-in user's home loads
- **THEN** one request returns the home with the first page of the week's news, and the opener is requested on its own

#### Scenario: A failed news part leaves the home

- **WHEN** the news read inside a signed-in home's read fails
- **THEN** the read returns the home with a null news page, and the home still shows its cards

### Requirement: The home's newest sections page on the server if the request asks

A request for the home that asks for pages SHALL get the first page of six cards and the count of each of New films this
week, New podcasts this week, and New posts this week, and each later page SHALL be requested from the server. A request
that does not ask SHALL get each whole list as before, so a released app and a stored MCP view show what they showed.
The web SHALL ask.

#### Scenario: The web's home holds one page a section

- **GIVEN** 40 Podcast Episodes new this week
- **WHEN** the web reads the home
- **THEN** the payload holds six New podcasts this week cards and a count of 40, and the section's title counts 40

#### Scenario: A later page is one request

- **WHEN** a reader opens the third page of New podcasts this week
- **THEN** the web shows cards 13 to 18 from one read of that page

#### Scenario: A released app still gets every card

- **WHEN** a request that does not ask for pages reads the home
- **THEN** each of the week's new lists holds every card it held before, in the fields it used

### Requirement: A section the server pages loads its pages ahead

On the web, a card section that the server pages SHALL request every page that one of its visible page buttons opens
before the reader presses it, so opening a page shows no wait. The home's newest sections and the Topic Post lists SHALL
share one hook for it, and the page shown SHALL stay on screen until the page asked for has loaded.

#### Scenario: A pressed page shows at once

- **GIVEN** a New posts this week section whose page buttons read 1, 2, 3, and next
- **WHEN** the reader presses 3
- **THEN** the third page's cards show from a read that had already returned, with no loading state

#### Scenario: A far page keeps the shown page until it loads

- **WHEN** a reader opens a page whose read has not returned
- **THEN** the cards on screen stay until the new page's cards replace them

## MODIFIED Requirements

### Requirement: The visitor face shows the hero, the headline, how it works, and the featured cards

The visitor face SHALL show, in order, Carl's hero, the headline "He already read it. All of it." under the search bar
with the New Topic button on its right, how it works in three steps, each step's number beside its heading, the featured
Topic cards, the featured Podcast Episode cards, and the Podcast Episode cards new this week, each Podcast Episode card
with a play button that plays inline. Each card section SHALL be drawn as the Topics page's sections are, open at first
with its count at the right and a divider only while closed, and SHALL show six cards a page. A featured section SHALL
hold every card in the html for a reader without JavaScript. A section of the week's new cards, which the server pages,
SHALL hold its first page of six in the html, and its page buttons SHALL be links that show without JavaScript, each to
the home at that page of the section, so a reader without JavaScript and a crawler still reach every card. The visitor
face SHALL show no sign-in section, notice, warning, or explanatory text beyond those. The tutorial video button SHALL
sit beside the logo on every page, never in the hero, and "All of it." SHALL link to the Topics page on both faces.

#### Scenario: A visitor plays a featured podcast episode in place

- **WHEN** a visitor presses play on a featured Podcast Episode card
- **THEN** the podcast episode plays on the home page without a navigation

#### Scenario: A reader without JavaScript reaches a later page

- **GIVEN** nine Podcast Episodes new this week
- **WHEN** a browser without JavaScript opens the home
- **THEN** New podcasts this week shows six cards and a link to its second page, and following the link shows the other
  three, rendered on the server

#### Scenario: A featured section keeps every card in the html

- **WHEN** a browser without JavaScript opens a home with twelve featured Topics
- **THEN** the html holds all twelve featured Topic cards
