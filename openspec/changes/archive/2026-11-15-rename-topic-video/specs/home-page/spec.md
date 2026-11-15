## RENAMED Requirements

- FROM: `### Requirement: The pinned-then-trending sections read Featured topics and Featured podcasts`
- TO: `### Requirement: The featured-then-trending sections read Featured topics and Featured podcasts`

## REMOVED Requirements

### Requirement: Featured topics and podcast episodes are pinned first, then trending, from a cached query

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "Featured topics and podcast episodes are featured first, then trending, from a cached query"

### Requirement: The home shows Featured posts below the podcast sections

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "The home shows Featured posts after the podcast sections"

### Requirement: The home shows New posts this week below Featured posts

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "The home shows New posts this week after Featured posts"

### Requirement: An admin pins the home's Topic Posts from the home page

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "An admin features the home's Topic Posts from the home page"

### Requirement: An admin pins a Topic Post from the post's own page

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "An admin features a Topic Post from the post's own page"

### Requirement: A switch limits the home to its pinned items

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "A switch limits the home to its featured items"

## MODIFIED Requirements

### Requirement: The featured-then-trending sections read Featured topics and Featured podcasts

The home page's sections of featured and then trending Topics and Podcast Episodes SHALL read Featured topics and
Featured podcasts in both apps, in the topics directory, in the Rank menu options and dialogs, and in the structured
data. Code SHALL name them home, never featured, so the word stays free for a separate capability.

#### Scenario: A visitor opens the home page

- **WHEN** a visitor opens the home page
- **THEN** the sections read Featured topics and Featured podcasts

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

## ADDED Requirements

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
