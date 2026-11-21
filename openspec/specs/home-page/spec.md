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
- **THEN** the page shows the headline, their Brews News, the featured cards, and their Topics as cards, rendered in
  the browser

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

### Requirement: The user face shows the headline, Brews News, the featured cards, and your Topics

The user face SHALL show the visitor face's headline beside the New Topic button, then the Brews News card in how it
works' place, then the featured cards, then the user's owned and followed Topics as cards under "Your topics". The
Brews News card SHALL hold Carl's recap for the day, then the user's news with its window picker, and SHALL hold no
updates list and no reading length button. The home
payload SHALL hold the first six of those Topics and their total, and each later page of six SHALL be requested from
the server when the user opens it. A user with no Topic SHALL see the New Topic button in the cards' place.

#### Scenario: A new user sees where to start

- **WHEN** a user with no Topic opens `/`
- **THEN** the featured cards show and the New Topic button stands where their Topics would

#### Scenario: A user with many Topics pages through them

- **WHEN** a user who owns or follows twelve Topics opens `/` and then the second page of Your topics
- **THEN** the home payload holds six Topic cards and a total of twelve, and the second page requests the next six

#### Scenario: The card shows the opener above the news

- **WHEN** a signed-in user with unread Findings opens `/`
- **THEN** the Brews News card shows Carl's recap, then the week's news with Week selected in the picker, and no
  Finding is marked read

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

### Requirement: The featured-then-trending sections read Featured topics and Featured podcasts

The home page's sections of featured and then trending Topics and Podcast Episodes SHALL read Featured topics and
Featured podcasts in both apps, in the topics directory, in the Rank menu options and dialogs, and in the structured
data. Code SHALL name them home, never featured, so the word stays free for a separate capability.

#### Scenario: A visitor opens the home page

- **WHEN** a visitor opens the home page
- **THEN** the sections read Featured topics and Featured podcasts

### Requirement: The home's sections keep one order, and a week's section hides while it is empty

Both faces of `/` SHALL order their card sections: Featured topics, Featured films, New films this week, Featured
podcasts, New podcasts this week, Featured posts, New posts this week, then Your topics for a user. New films this
week, New podcasts this week, and New posts this week SHALL each list the last seven days alone and SHALL be absent
while they hold no card.

#### Scenario: New podcasts this week follows Featured podcasts

- **WHEN** a visitor opens a home page with a card in every section
- **THEN** New podcasts this week sits directly below Featured podcasts and directly above Featured posts

#### Scenario: An empty week shows no section

- **WHEN** no Topic Post, Podcast Episode, or film of a public shown Topic was published in the last seven days
- **THEN** the home shows none of the three "this week" sections, and the other sections keep their order

### Requirement: The home payload carries the home films and the new films from the cached query

The home payload SHALL hold the home films and the films new this week as film cards, read from the same cached entry
as the home podcast episodes, never computed per request. The fields SHALL be optional, so a released mobile app that
does not read them keeps working. Only ready films of public shown Topics SHALL ever appear.

#### Scenario: An older app reads the new payload

- **WHEN** a released mobile version without the film sections reads the home payload
- **THEN** it renders its sections as before

#### Scenario: A turned-private Topic's film leaves the home

- **WHEN** a Topic whose film is featured turns private
- **THEN** the film leaves both home film sections on the next cache refresh

### Requirement: An admin block takes the person's items off the home

While a user is under an admin block, the Topics that user owns, the Podcast Episodes and films of those Topics, and
the Topic Posts that user wrote SHALL be absent from every card section of the home, featured or not. The home SHALL
follow a block that is set or cleared on its next cache refresh. The items SHALL still open at their own urls.

#### Scenario: A blocked user's Topic leaves the home

- **GIVEN** a public shown Topic among the home's Featured topics
- **WHEN** an admin sets an admin block on its owner
- **THEN** on the next cache refresh the home holds no card of that Topic, of its Podcast Episodes, or of its films

#### Scenario: A blocked user's Topic Post leaves the week's posts

- **GIVEN** a Topic Post published this week on a public shown Topic
- **WHEN** an admin sets an admin block on its author
- **THEN** on the next cache refresh New posts this week and Featured posts no longer hold it

#### Scenario: The Topic still opens at its url

- **WHEN** a visitor opens a blocked user's public Topic by its url
- **THEN** the Topic page opens as before

#### Scenario: Clearing the block brings the items back

- **WHEN** the admin clears the block
- **THEN** the user's items may show on the home again on its next cache refresh

### Requirement: Featured topics and podcast episodes are featured first, then trending, from a cached query

The featured topics and podcast episodes SHALL be the Topics holding a feature order, in order, then the trending public
shown Topics until twelve, and the Podcast Episodes holding a feature order, then published Podcast Episodes of public
shown Topics by listener count until twelve, one per Topic. Beside them, the new Podcast Episodes SHALL be the Podcast
Episodes of public shown Topics published in the last seven days, newest first. They SHALL come from one cached entry
with a short time to live, never computed per request, and only public shown Topics and their published Podcast Episodes
SHALL ever appear.

#### Scenario: A new podcast episode reaches the home unfeatured

- **WHEN** a public shown Topic publishes a Podcast Episode
- **THEN** it leads the New podcasts this week cards on the next cache refresh, with nothing featured and no listener,
  and leaves them seven days after its publish

#### Scenario: A featured item leads the featured topics

- **WHEN** an admin features a Topic at position one
- **THEN** the home's first featured Topic card is that Topic on the next cache refresh

#### Scenario: A private Topic never features

- **WHEN** a featured Topic turns private
- **THEN** it leaves the featured topics and the home page is purged at the edge

### Requirement: The home shows Featured posts after the podcast sections

Both faces of `/` SHALL show a "Featured posts" section directly below New podcasts this week, on the web and in the
mobile app, six cards a page: the Topic Posts an admin featured, in order, then the newest published Topic Posts of
public shown Topics, one per Topic, until twelve. The section SHALL be absent while it holds no post. The home payload
SHALL hold the cards as `homeTopicPosts`.

#### Scenario: Nothing featured falls back to the newest posts

- **WHEN** no Topic Post is featured, and two public shown Topics each hold published Topic Posts
- **THEN** Featured posts holds two cards, the newest post of each Topic, the newer of the two first

#### Scenario: A featured post leads

- **WHEN** an admin featured one Topic Post at position one
- **THEN** it leads Featured posts, ahead of the newest post of every other Topic

#### Scenario: No post shows no section

- **WHEN** no public shown Topic holds a published Topic Post
- **THEN** the home shows Featured podcasts followed by New podcasts this week, with no Featured posts after them

### Requirement: The home shows New posts this week after Featured posts

Both faces of `/` SHALL show a "New posts this week" section directly below Featured posts, on the web and in the
mobile app, six cards a page: the Topic Posts of public shown Topics published in the last seven days, newest first,
featured or not. The home payload SHALL hold the cards as the optional `newestTopicPosts`, read from the home's cached
ids with the other card ids.

#### Scenario: A new post joins and leaves

- **WHEN** an author publishes a Topic Post on a public shown Topic
- **THEN** it leads New posts this week once the home's cached ids are cleared, and leaves seven days after its
  publish

#### Scenario: A featured post shows in both sections

- **WHEN** an admin featured a Topic Post that was published this week
- **THEN** Featured posts and New posts this week each hold its card, from one read of the cards

#### Scenario: A private Topic's post never shows

- **WHEN** an author publishes a Topic Post on a Topic that is not public and shown
- **THEN** New posts this week does not hold it, and the home's cached ids stay as they are

### Requirement: An admin features the home's Topic Posts from the home page

The web home page's action menu SHALL offer "Home posts" to an admin alone, under the notebook-pen icon. It SHALL open
the rank dialog over the featured Topic Posts, with a picker of the newest published Topic Posts of public shown Topics.
Only a published Topic Post of a public shown Topic SHALL hold a home order. A deleted Topic Post, and a Topic that
stops being public, SHALL release it and close the gap. Each change SHALL purge the home at the edge.

#### Scenario: An admin features a post

- **WHEN** an admin opens "Home posts", adds a published Topic Post of a public shown Topic, and presses Save
- **THEN** that Topic Post holds position one and leads the home's Featured posts

#### Scenario: Anyone else is refused

- **WHEN** a request to set a Topic Post's home order, or to read the dialog's rows, arrives from anyone but an admin
- **THEN** a visitor's is rejected as unauthorized and a user's as forbidden, and no home order changes

#### Scenario: A draft is rejected

- **WHEN** an admin's request names a draft, or a Topic Post of a Topic that is not public and shown
- **THEN** it is rejected as a conflict, and no home order changes

### Requirement: An admin features a Topic Post from the post's own page

The web page of a published Topic Post of a public Topic SHALL offer "Home posts" in its action menu to an admin alone,
under the notebook-pen icon. It SHALL open the home page's rank dialog over the featured Topic Posts, with the page's
post offered a place at the end if it is not featured. The mobile app SHALL NOT offer it.

#### Scenario: An admin features the post they are reading

- **WHEN** an admin opens "Home posts" on a published Topic Post of a public shown Topic and presses Save
- **THEN** that Topic Post holds the next home order and shows in the home's Featured posts

#### Scenario: Anyone else sees no option

- **WHEN** anyone but an admin opens a Topic Post page's action menu, or an admin opens a draft's
- **THEN** it holds no "Home posts"

### Requirement: A switch limits the home to its featured items

While the featured-only switch in the spend control settings is on, every card section of the home SHALL hold only
items an admin featured: no trending Topic, no Podcast Episode or film ranked by its listeners, no newest Topic Post,
and no unfeatured item in a section of the week's new items. Your topics and Brews News on the user face SHALL stay as
they are. The switch SHALL be off until an admin turns it on, and no copy SHALL tell a user that it is on.

#### Scenario: An unfeatured Topic leaves the home

- **GIVEN** two featured Topics and ten trending public shown Topics on the home
- **WHEN** an admin turns the featured-only switch on
- **THEN** Featured topics holds the two featured Topics alone on the home's next cache refresh

#### Scenario: A new account's Topic Post does not reach the home

- **GIVEN** the featured-only switch is on
- **WHEN** a new account publishes a Topic Post on its public shown Topic
- **THEN** neither Featured posts nor New posts this week holds it, and the Topic Post still opens at its url

#### Scenario: A week's section with no featured item is absent

- **GIVEN** the featured-only switch is on and no featured film was published in the last seven days
- **WHEN** a visitor opens the home
- **THEN** New films this week is absent, as an empty week's section is

#### Scenario: Turning the switch off brings the unfeatured items back

- **WHEN** an admin turns the featured-only switch off
- **THEN** the home's sections fill as before on its next cache refresh

#### Scenario: A user's own Topics stay

- **GIVEN** the featured-only switch is on
- **WHEN** a signed-in user opens the home
- **THEN** Your topics lists the Topics the user owns and follows as before

### Requirement: The home is one read, and visitors share one copy of it

`GET /api/home` SHALL stay the home's one read. A visitor's whole payload SHALL be served from one 60-second copy, as
the page-reads capability states, and every clear of the home's cached ids SHALL clear that copy too. A signed-in home's
request MAY ask for the first page of the user's news in the same read, which is null if the news read fails. The day's
recap SHALL stay a read of its own.

#### Scenario: Visitors cost one home build a minute

- **WHEN** a thousand visitors load the home inside a minute
- **THEN** the payload is built only by the reads that found no copy, and a warm read sends no query

#### Scenario: A featured item reaches the next visitor

- **WHEN** an admin features a Topic at position one
- **THEN** the home's cached ids and the visitors' copy are cleared together, and the next visitor's home leads with
  that Topic

#### Scenario: A signed-in home asks for its news

- **WHEN** a signed-in user's home loads
- **THEN** one request returns the home with the first page of the week's news, and the recap is requested on its own

#### Scenario: A failed news part leaves the home

- **WHEN** the news read inside a signed-in home's read fails
- **THEN** the read returns the home with a null news page, and the home still shows its cards

### Requirement: The home's newest sections page on the server if the request asks

A request for the home that asks for pages SHALL get the first page of six cards and the count of each of New films this
week, New podcasts this week, and New posts this week, and each later page SHALL be requested from the server. A request
that does not ask SHALL get each whole list as before, so a released app and a stored MCP view show what they showed.
The web SHALL ask. The server MAY read each whole list and send one page of it, because a week's list stays short.

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
