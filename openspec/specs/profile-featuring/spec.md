# profile-featuring Specification

## Purpose
A person pins their own Topics and Podcast Episodes, and the Topic Posts they wrote, to the top of their profile
page's three Featured sections. The pins follow the rules of the admin's home pins, scoped to one person.

## Requirements

### Requirement: The Featured sections page by six and keep every card in the HTML

Each Featured section SHALL be a collapsible section of Topic cards or Podcast Episode cards, six a page, paging
through all of the person's Topics or Podcast Episodes. The server's HTML SHALL hold every card, with the cards past
the first page hidden only once the page's script runs. A section with no card SHALL be absent.

#### Scenario: A crawler reads every card

- **WHEN** a request with no session fetches the profile of a person with fourteen public Topics
- **THEN** the HTML holds fourteen Topic cards, and a reader with JavaScript sees six and a pager

#### Scenario: A person with no podcast shows no section

- **WHEN** none of a person's Topics has a published Podcast Episode
- **THEN** the profile page shows no Featured Podcasts section

### Requirement: Only a public Topic's owner sets its profile order

Setting a Topic's profile order SHALL be its owner's action alone, authorized on the server through the gate. A Topic
that is not public SHALL NOT hold a profile order, and a request to rank one SHALL be rejected as a conflict. A
published Podcast Episode of a public Topic SHALL hold a profile order under the same rules, set by its Topic's owner.

#### Scenario: Another user cannot feature

- **WHEN** a request to set a profile order arrives from a user who does not own the Topic
- **THEN** it is rejected, and no profile order changes

#### Scenario: A private Topic cannot be featured

- **WHEN** an owner's request names their own Topic whose visibility is not public
- **THEN** it is rejected as a conflict, and no profile order changes

### Requirement: A profile holds at most twelve featured Topics and twelve featured Podcast Episodes

One owner's profile orders SHALL be contiguous from one, with one holder per position, and SHALL end at twelve for
Topics and at twelve for Podcast Episodes. Placing a featured row at a new position SHALL move it and shift the rest. A
request past twelve SHALL be rejected as a conflict.

#### Scenario: A thirteenth featured item is rejected

- **WHEN** an owner with twelve featured Topics asks to feature another without dropping one
- **THEN** it is rejected as a conflict and the twelve keep their positions

#### Scenario: A move shifts the rest

- **WHEN** an owner moves their featured item at position four to position one
- **THEN** it holds position one and the three before it each move down by one

### Requirement: A Topic leaving the public set releases its profile order

A Topic that stops being public SHALL release its profile order and those of its Podcast Episodes, and the orders after
them SHALL close up. A removed Podcast Episode SHALL release its own. A Topic that turns public again SHALL hold none
until its owner features it again.

#### Scenario: A featured Topic turns private

- **WHEN** an owner's Topic featured at position two turns private
- **THEN** it holds no profile order, and the Topic at position three moves to two

### Requirement: The owner features from the profile page's action menu

A person's own profile page SHALL offer "Featured topics" and "Featured podcasts" in its action menu, on the web and in
the mobile app. Each SHALL open a rank dialog that lists the featured rows in order and lets the owner place any of
their public Topics, or those Topics' published Podcast Episodes, at a position. The X on a featured row SHALL ask
before it drops the featured item. Nobody else SHALL see either option.

#### Scenario: An owner features a Topic

- **WHEN** an owner opens "Featured topics" and places one of their public Topics at position one
- **THEN** that Topic leads the Featured Topics section, and the dialog shows it first

#### Scenario: The first featured item saves

- **WHEN** an owner with nothing featured opens "Featured podcasts", places one Podcast Episode, and presses Save
- **THEN** that Podcast Episode holds position one, since Save is enabled whether or not a row moved

#### Scenario: A drop asks first

- **WHEN** an owner presses the X on a featured row and cancels the confirmation
- **THEN** no profile order changes and the row stays

#### Scenario: A visitor sees no feature option

- **WHEN** anyone but the person opens the profile page's action menu
- **THEN** it holds neither "Featured topics" nor "Featured podcasts"

### Requirement: Each Featured section lists the featured items first, then the rest by the home's rules

Featured Topics SHALL list the person's featured Topics in order, then their other Topics by the home's trending order.
Featured Podcasts SHALL list their featured Podcast Episodes in order, then the published Podcast Episodes of their
Topics by listener count, one per Topic. With nothing featured, each section SHALL be its fallback alone. A reader SHALL
see only the Topics they may open, so anyone but the person sees public Topics only.

#### Scenario: Nothing featured falls back to trending

- **WHEN** a person with five public Topics and nothing featured is viewed by a visitor
- **THEN** Featured Topics lists the five by viewer count, then follower count, then newest

#### Scenario: The person sees their private Topic's card

- **WHEN** a person opens their own profile page
- **THEN** Featured Topics also holds their private Topics, after the featured items, in the same order rule

### Requirement: A featured order change shows on the profile at once and is reported

Setting, moving, or clearing a profile order SHALL purge that profile page at the edge. The server SHALL send
`social_profile_order_change` with the kind, Topic or Podcast Episode, the object's id, and the new position, and no
text.

#### Scenario: A visitor sees the new featured item

- **WHEN** an owner features a Topic and a visitor then loads that profile page
- **THEN** the served page shows the featured Topic first

### Requirement: An author features their published Topic Posts on their profile

A Topic Post SHALL hold a profile order among its author's featured items, set by its author alone. Only a published
Topic Post of a public Topic SHALL hold one, and any other request SHALL be rejected as a conflict. One author's orders
SHALL be contiguous from one and SHALL have no limit. A deleted Topic Post, and a Topic that stops being public, SHALL
release the order and close the gap. A change SHALL purge the author's profile page at the edge.

#### Scenario: Another user cannot feature a post

- **WHEN** a request to set a Topic Post's profile order arrives from anyone but its author, its Topic's owner included
- **THEN** it is rejected as not found, and no profile order changes

#### Scenario: A draft cannot be featured

- **WHEN** an author's request names their own draft, or their published Topic Post on a Topic that is not public
- **THEN** it is rejected as a conflict, and no profile order changes

#### Scenario: A thirteenth post is featured

- **WHEN** an author with twelve featured Topic Posts asks to feature another without dropping one
- **THEN** it holds position thirteen and the twelve keep their positions

#### Scenario: A featured post's Topic turns private

- **WHEN** the Topic of a Topic Post featured at position one on its author's profile turns private
- **THEN** the post holds no profile order, and the author's post at position two moves to one

### Requirement: The profile page shows Featured Posts after Featured Podcasts

The profile page SHALL show a collapsible "Featured Posts" section directly below Featured Podcasts, on the web and in
the mobile app: the person's featured Topic Posts in order, then every other published Topic Post of theirs, newest
first, six cards a page, counted whole in its title. The person SHALL see every post, and anyone else the posts of
public Topics alone. A section with no card SHALL be absent, and the page SHALL show no other Topic Post section.

#### Scenario: Nothing featured lists every post newest first

- **WHEN** a person with three published Topic Posts on one public Topic and one on another, and nothing featured, is
  viewed
- **THEN** Featured Posts holds four cards, newest first, and its title counts four posts

#### Scenario: A featured post leads and the rest follow

- **WHEN** a person features the oldest of their three Topic Posts on one public Topic
- **THEN** Featured Posts leads with the featured post, then shows the other two, the newer first

#### Scenario: A visitor sees public Topics' posts only

- **WHEN** a person published one Topic Post on a public Topic and one on a private Topic, and a visitor opens their
  profile
- **THEN** the section holds the public Topic's card alone and counts one post, and the person's own view counts two

#### Scenario: A person with no post shows no section

- **WHEN** a person has published no Topic Post that the reader may read
- **THEN** the profile page shows no Featured Posts section

### Requirement: The owner features posts from the profile page's action menu

A person's own profile page SHALL offer "Featured posts" in its action menu beside "Featured topics" and "Featured
podcasts", under the notebook-pen icon, on the web and in the mobile app. It SHALL open the rank dialog over their
featured Topic Posts, and its picker SHALL offer every published Topic Post of theirs on a public Topic, named by its
title and its Topic. Nobody else SHALL see the option.

#### Scenario: An author features a post

- **WHEN** an author opens "Featured posts", adds one of their published Topic Posts, and presses Save
- **THEN** that Topic Post leads the Featured Posts section, and the dialog shows it first

#### Scenario: A visitor sees no posts option

- **WHEN** anyone but the person opens the profile page's action menu
- **THEN** it holds no "Featured posts"

### Requirement: The author features a post from the post's own page

The page of a published Topic Post of a public Topic SHALL offer its author "Featured posts" in its action menu, under
the notebook-pen icon, on the web and in the mobile app. It SHALL open the rank dialog over the author's featured Topic
Posts, with the page's post offered a place at the end if it is not featured. Nobody else SHALL see the option.

#### Scenario: An author features the post they are reading

- **WHEN** an author opens "Featured posts" on their published Topic Post of a public Topic and presses Save
- **THEN** the dialog showed that post last with a check, and the post holds the next profile order

#### Scenario: A draft's page has no option

- **WHEN** an author opens the action menu on their draft, or on their Topic Post of a Topic that is not public
- **THEN** it holds no "Featured posts"
