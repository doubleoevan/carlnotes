# reactions Specification

## Purpose
A signed-in user responds to a Finding, a Podcast Episode, a Topic, or a Comment with one Reaction: a positive type
and no words. Customer copy calls it a reaction.

## Requirements

### Requirement: A user holds one Reaction per social target

A Reaction SHALL name its user and exactly one social target: a Finding, a Podcast Episode, a Topic, a post, or a
Comment. A user SHALL hold at most one Reaction per social target. A save for a social target the user already
reacted to SHALL change that Reaction and SHALL NOT write a second one.

#### Scenario: A second type replaces the first

- **WHEN** a user presses Like on a Finding and then presses Funny on the same Finding
- **THEN** one Reaction exists for that user and Finding, holding `funny`

#### Scenario: Two saves at once leave one Reaction

- **WHEN** one user's two saves for the same Topic arrive together
- **THEN** one Reaction exists and neither save fails with a server error

#### Scenario: A Comment takes a Reaction

- **WHEN** a user presses Insightful on another person's Comment
- **THEN** one Reaction exists for that user and Comment, and the Comment's count for Insightful is one higher

### Requirement: A Reaction holds one positive type and no text

A Reaction SHALL hold exactly one reaction type from `like`, `celebrate`, `support`, `love`, `insightful`, and
`funny`. No negative type SHALL exist. A Reaction SHALL hold no text. A save that names no type SHALL delete the
user's Reaction, and a press on the user's own type SHALL send that save.

#### Scenario: A press on a type saves a Reaction

- **WHEN** a user presses Insightful on a Podcast Episode
- **THEN** a Reaction is saved with the type `insightful`, and no composer opens

#### Scenario: A press on the user's own type removes it

- **WHEN** a user presses the type they already chose
- **THEN** their Reaction is deleted and that type's count is one lower

#### Scenario: An unknown type is rejected

- **WHEN** a save names a type outside the six
- **THEN** it is rejected as a validation error

### Requirement: A Reaction changes at any age

A Reaction SHALL have no edit time. Its user SHALL be able to change its type or remove it at any age.

#### Scenario: A year-old Reaction changes

- **WHEN** a user presses a different type on a Finding they reacted to long ago
- **THEN** the Reaction holds the new type

### Requirement: Saving needs an account and reading follows the social target

Only a signed-in user who may open the social target SHALL save a Reaction on it. A Comment's social target SHALL be
opened by whoever may open the Topic it belongs to. Anyone who may open the social target, a visitor included, SHALL
read its counts. A Reaction SHALL be shown as soon as it is saved, with no approval step and no confirmation dialog.

#### Scenario: A visitor reads and does not save

- **WHEN** a visitor opens a public Topic that has reactions
- **THEN** the counts show, and a press on a type opens sign-up

#### Scenario: A private Topic's reactions stay private

- **WHEN** a user without access asks for a private Topic's reaction summary
- **THEN** the request is rejected in the same words as for a Topic that does not exist

#### Scenario: A Reaction on a Comment follows the Comment's Topic

- **WHEN** a user without access to an invite Topic saves a Reaction on one of its Comments
- **THEN** the save is rejected as not found and nothing is written

### Requirement: A social target's reactions read as a summary

A read of a Topic page, a Podcast Episode page, a feed of Findings, and a comment thread SHALL include each one's
reaction summary: the count per type, the newest eight users who chose it, and the caller's own type. A summary
SHALL leave out a user hidden from the caller. A tool result that a model reads SHALL hold the numbers alone.

#### Scenario: A feed read includes each Finding's summary

- **WHEN** a client reads a Topic's feed of 40 Findings
- **THEN** each Finding includes its summary, and the read makes the same number of queries as for one Finding

#### Scenario: A thread read includes each Comment's summary

- **WHEN** a client reads a thread page of 20 Comments with replies
- **THEN** each Comment and each reply includes its summary, and the read makes the same number of queries as for one

#### Scenario: A type names who chose it

- **WHEN** eleven users press Like on a Topic
- **THEN** the summary shows 11 for Like and names the newest eight

#### Scenario: A blocked user stays out of the summary

- **WHEN** a user reads a summary that holds a Reaction from someone they blocked
- **THEN** neither the count nor the names include that person

### Requirement: One reaction row serves the web, the mobile app, and the MCP view

The reaction row and its type picker SHALL each be one shared component that the web, the mobile app, and the
findings MCP view render through a platform adapter. The row SHALL show the six types, each with its count, and SHALL
mark the caller's own type in the primary color with a light fill and no pill behind it.

#### Scenario: The same row renders on three platforms

- **WHEN** one Finding's reactions show on the web, in the mobile app, and in the findings MCP view
- **THEN** all three show the same counts and the same marked type from one component

#### Scenario: A type with a number lists who chose it

- **WHEN** a user hovers over a type with a count on the web or in an MCP view, or holds it in the mobile app
- **THEN** the type shows in bold over a list of avatars and usernames, each linking to that person's profile, and a
  label counts anyone the list leaves out

#### Scenario: The caller's own type is marked

- **WHEN** a user who chose Support opens the row
- **THEN** Support shows in the primary color with a light fill, and the other five show muted

### Requirement: The reaction row shows with a Finding, a Topic, a Podcast Episode, and a Comment

The reaction row SHALL show in a Finding's details on the web, the mobile app, and the findings MCP view, just below
the Finding's domain and podcast button on the web and the mobile app. On a Topic's page and screen and a Podcast
Episode's page and screen it SHALL show beside the byline, at every width. Each Comment and each reply in a thread
SHALL show its own row after its age. No notice, warning, or guideline text SHALL accompany the row.

#### Scenario: A Finding's details hold the row

- **WHEN** a user opens a Finding on a Topic page
- **THEN** the reaction row shows just below the Finding's domain and podcast button

#### Scenario: A Finding rated thumbs down has no row

- **WHEN** a link or a Podcast Episode chapter opens a Finding rated thumbs down
- **THEN** its details show no reaction row

#### Scenario: A Topic and a Podcast Episode hold the row

- **WHEN** a visitor opens a public Topic's page and one of its Podcast Episode pages
- **THEN** each page's reaction row shows beside its byline

#### Scenario: A Comment holds its own row

- **WHEN** a user opens a thread with a Comment and a reply
- **THEN** the Comment and the reply each show their own six types and counts

### Requirement: A post is a social target before posts exist

The social target kinds SHALL include a post. Until posts exist, a read or a save that names a post SHALL be rejected
as not found, and the shared components SHALL accept a post target.

#### Scenario: A save on a post is not found

- **WHEN** a user saves a Reaction naming a post
- **THEN** the save is rejected as not found and nothing is written

### Requirement: A Reaction is deleted with what it belongs to

A Reaction SHALL be deleted with its social target and with its user's account. Removing a Podcast Episode SHALL
delete that Podcast Episode's reactions. Deleting a Comment SHALL delete the reactions on it.

#### Scenario: A closed account's reactions go

- **WHEN** a user closes their account
- **THEN** every Reaction they saved is gone and each count is one lower

#### Scenario: A removed Podcast Episode keeps no reactions

- **WHEN** a Topic's owner removes a Podcast Episode
- **THEN** its reactions are deleted with its audio and chapters

#### Scenario: A deleted Comment keeps no reactions

- **WHEN** an author deletes a Comment that holds four reactions
- **THEN** the four Reactions are deleted with it

### Requirement: A Reaction never removes a Finding from the podcast

A Finding SHALL stay as eligible for a Podcast Episode with reactions as without them.

#### Scenario: A Finding with reactions is planned like any other

- **WHEN** a Podcast Episode is planned for a Topic whose Finding has reactions
- **THEN** that Finding is considered by the same rules as a Finding with none
