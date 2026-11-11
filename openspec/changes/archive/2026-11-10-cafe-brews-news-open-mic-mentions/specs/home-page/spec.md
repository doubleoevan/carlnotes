# Spec Delta

## ADDED Requirements

### Requirement: The home shows Featured posts below the podcast sections

Both faces of `/` SHALL show a "Featured posts" section directly below New podcasts this week, on the web and in the
mobile app, six cards a page: the Topic Posts an admin pinned, in order, then the newest published Topic Posts of
public shown Topics, one per Topic, until twelve. The section SHALL be absent while it holds no post. The home payload
SHALL hold the cards as `homeTopicPosts`.

#### Scenario: No pin falls back to the newest posts

- **WHEN** no Topic Post is pinned, and two public shown Topics each hold published Topic Posts
- **THEN** Featured posts holds two cards, the newest post of each Topic, the newer of the two first

#### Scenario: A pinned post leads

- **WHEN** an admin pinned one Topic Post at position one
- **THEN** it leads Featured posts, ahead of the newest post of every other Topic

#### Scenario: No post shows no section

- **WHEN** no public shown Topic holds a published Topic Post
- **THEN** the home shows Featured podcasts followed by New podcasts this week, with no Featured posts after them

### Requirement: The home shows New posts this week below Featured posts

Both faces of `/` SHALL show a "New posts this week" section directly below Featured posts, on the web and in the
mobile app, six cards a page: the Topic Posts of public shown Topics published in the last seven days, newest first,
pinned or not. The home payload SHALL hold the cards as the optional `newestTopicPosts`, read from the home's cached
ids with the other card ids.

#### Scenario: A new post joins and leaves

- **WHEN** an author publishes a Topic Post on a public shown Topic
- **THEN** it leads New posts this week once the home's cached ids are cleared, and leaves seven days after its
  publish

#### Scenario: A pinned post shows in both sections

- **WHEN** an admin pinned a Topic Post that was published this week
- **THEN** Featured posts and New posts this week each hold its card, from one read of the cards

#### Scenario: A private Topic's post never shows

- **WHEN** an author publishes a Topic Post on a Topic that is not public and shown
- **THEN** New posts this week does not hold it, and the home's cached ids stay as they are

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

### Requirement: An admin pins the home's Topic Posts from the home page

The web home page's action menu SHALL offer "Home posts" to an admin alone, under the notebook-pen icon. It SHALL open
the rank dialog over the pinned Topic Posts, with a picker of the newest published Topic Posts of public shown Topics.
Only a published Topic Post of a public shown Topic SHALL hold a home order. A deleted Topic Post, and a Topic that
stops being public, SHALL release it and close the gap. Each change SHALL purge the home at the edge.

#### Scenario: An admin pins a post

- **WHEN** an admin opens "Home posts", adds a published Topic Post of a public shown Topic, and presses Save
- **THEN** that Topic Post holds position one and leads the home's Featured posts

#### Scenario: Anyone else is refused

- **WHEN** a request to set a Topic Post's home order, or to read the dialog's rows, arrives from anyone but an admin
- **THEN** a visitor's is rejected as unauthorized and a user's as forbidden, and no home order changes

#### Scenario: A draft is rejected

- **WHEN** an admin's request names a draft, or a Topic Post of a Topic that is not public and shown
- **THEN** it is rejected as a conflict, and no home order changes

### Requirement: An admin pins a Topic Post from the post's own page

The web page of a published Topic Post of a public Topic SHALL offer "Home posts" in its action menu to an admin alone,
under the notebook-pen icon. It SHALL open the home page's rank dialog over the pinned Topic Posts, with the page's
post offered a place at the end if it is not pinned. The mobile app SHALL NOT offer it.

#### Scenario: An admin pins the post they are reading

- **WHEN** an admin opens "Home posts" on a published Topic Post of a public shown Topic and presses Save
- **THEN** that Topic Post holds the next home order and shows in the home's Featured posts

#### Scenario: Anyone else sees no option

- **WHEN** anyone but an admin opens a Topic Post page's action menu, or an admin opens a draft's
- **THEN** it holds no "Home posts"

## RENAMED Requirements

- FROM: `### Requirement: The user face shows the headline, Updates, the featured cards, and your Topics`
- TO: `### Requirement: The user face shows the headline, Brews News, the featured cards, and your Topics`

## MODIFIED Requirements

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

### Requirement: The user face shows the headline, Brews News, the featured cards, and your Topics

The user face SHALL show the visitor face's headline beside the New Topic button, then the Brews News card in how it
works' place, then the featured cards, then the user's owned and followed Topics as cards under "Your topics". The
Brews News card SHALL hold Carl's opener for the day, then the user's news with its window picker, and SHALL hold no
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
- **THEN** the Brews News card shows Carl's opener, then the week's news with Week selected in the picker, and no
  Finding is marked read
