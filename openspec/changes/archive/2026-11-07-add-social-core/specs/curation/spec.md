# Spec Delta

## ADDED Requirements

### Requirement: A weighted signal orders the scoring examples

A Finding's reaction signal SHALL be the sum of the account weight times 2 for each distinct author with at least one
Comment on the Finding, and the account weight times 1 for each Reaction on the Finding. The account weight SHALL be the
age and reputation factors the invite limit uses. The signal SHALL leave out authors under an admin block and authors in
a block with the Topic's owner. Reactions on a Comment SHALL NOT count.

#### Scenario: The examples list signal above a thumbs up

- **WHEN** a Topic has a bookmarked page, a page whose signal is at least 2, and a page rated thumbs up
- **THEN** the scoring examples list the bookmarked page first, then the page with the signal, then the thumbs up

#### Scenario: A Comment from an established account outranks a thumbs up

- **WHEN** a Topic has one page with a Comment from an established account and another page rated thumbs up
- **THEN** the scoring examples list the first page before the second

#### Scenario: Many Comments from one author count once

- **WHEN** one established account writes fifty Comments on a Finding
- **THEN** that Finding's signal is 2

#### Scenario: A few new accounts do not move the examples

- **WHEN** five accounts created that day each press a type on one Finding
- **THEN** that Finding's signal is under 2 and its page joins no example list

#### Scenario: A thumbs down still removes the page

- **WHEN** a Finding with a high signal is rated thumbs down
- **THEN** its page is listed with the pages rated down and never with the liked ones

### Requirement: The scoring examples hold no Comment text

A scoring example line SHALL hold a page's title and host only. No Comment's body, the Topic owner's included, SHALL
be on an example line.

#### Scenario: The owner's Comment is not on the example line

- **WHEN** a Topic's owner writes a Comment on a Finding they bookmarked
- **THEN** the next Scan's scoring examples list that page with its title and host and none of the Comment's text

### Requirement: A link in a shared Comment is reviewed as a Personal sources link is

Sharing a Comment SHALL store each url in its body as a pending Comment link of the Comment's Topic, and unsharing
SHALL delete them. A Scan SHALL add the Topic's pending Comment links to its discovered Resources. The review SHALL
skip the embedding gate for them, score them with the Topic's ordinary scoring prompt, add the bonus a deliberate
Personal sources send gets, and mark each link considered.

#### Scenario: A shared link is scored with the bonus

- **WHEN** an editor shares a Comment that holds a url and the Topic's next Scan runs
- **THEN** the page is scored without the embedding gate, its score includes the Personal sources bonus, and the
  resulting Finding is an ordinary Finding with no sender-private explanation

#### Scenario: A link is considered once

- **WHEN** a second Scan runs after the first considered the link
- **THEN** the link is not added to that Scan's discovered Resources

#### Scenario: An unshared Comment's link is not scored

- **WHEN** an editor unshares the Comment before the next Scan
- **THEN** no pending link remains and the Scan does not add the page for that Comment

#### Scenario: An unshared Comment's url stays text

- **WHEN** a follower's unshared Comment holds a url
- **THEN** no Comment link is stored and no Scan reads the url

### Requirement: A shared Comment's links follow its share

A shared Comment's pending links SHALL stay out of a Scan while its Finding is rated thumbs down, or while its author
is under an admin block or in a block with the Topic's owner. An edit that takes a share back SHALL delete the
Comment's pending links.

#### Scenario: A left-out shared Comment's link waits

- **WHEN** a Scan runs while a shared Comment's Finding is rated thumbs down, or while its author is under an admin
  block or in a block with the Topic's owner
- **THEN** the Scan does not add that Comment's pending link, and a later Scan adds it once that changes

#### Scenario: An edit that takes a share back deletes the pending link

- **WHEN** an author who may not edit the Topic edits a waiting shared Comment that holds a url
- **THEN** no pending link remains and the next Scan does not add the page for that Comment

## MODIFIED Requirements

### Requirement: A scan prunes the topic to its max results, sparing bookmarked and rated Findings
After a scan writes its Findings, a scan SHALL keep only the topic's top `max_results` Findings by relevance score and
delete the rest, except Findings a user bookmarked or rated, which are never pruned. A Finding is spared if a user
with access bookmarked it or if it has a rating. A view SHALL NOT spare a Finding: opening one is incidental, and
sparing every opened Finding would leave an actively read topic unable to prune at all. User feedback SHALL NOT be read
here either, since feedback stays record-only and never reaches the ranking path. A lowered `max_results` takes effect
at the next scan; editing the value never deletes rows on its own.

Sparing a rating alongside a bookmark matters because a re-score can lower a Finding's relevance score. Without it,
editing a topic's prompt would silently delete the rating attached to whatever the new context scores lower.

A Finding SHALL also be spared if it has a Comment, so a re-score never deletes what a person wrote. A Reaction SHALL
NOT spare a Finding, because its author is not shown and the Topic's owner cannot remove it. A Comment from an author
under an admin block, or in a block with the Topic's owner, SHALL NOT spare a Finding.

#### Scenario: The prune keeps the top of the ranking
- **WHEN** a scan finishes on a topic with more Findings nobody bookmarked or rated than its `max_results`
- **THEN** only the top `max_results` by relevance score remain, plus every bookmarked or rated Finding

#### Scenario: Editing max results does not delete rows
- **WHEN** an owner lowers a topic's `max_results`
- **THEN** no Finding is deleted until the topic's next scan prunes to the new value

#### Scenario: A re-score that lowers a score keeps a rated Finding
- **WHEN** an edited topic context re-scores a rated Finding below its topic's `max_results` cut
- **THEN** the Finding remains with its updated score and explanation, and its rating is intact

#### Scenario: Being read does not spare a Finding from the limit
- **WHEN** an unrated, unbookmarked Finding the user has opened falls past the topic's `max_results` cut
- **THEN** it is pruned like any other, so reading a topic never stops it pruning

#### Scenario: A Finding with a Comment is spared
- **WHEN** a Finding that holds a Comment falls past the topic's `max_results` cut
- **THEN** the Finding and its Comment remain

#### Scenario: A Reaction does not spare a Finding
- **WHEN** a Finding that holds Reactions and no Comment falls past the topic's `max_results` cut
- **THEN** it is pruned, and its Reactions are deleted with it

#### Scenario: Deleting the Comment lets the Finding prune
- **WHEN** a Topic's owner deletes the one Comment on a Finding past the cut
- **THEN** the next scan prunes that Finding
