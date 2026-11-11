# Spec Delta

## ADDED Requirements

### Requirement: read_news returns the caller's news with unseen mentions first

The `read_news` tool SHALL take an optional window of week, day, or hour and an optional cursor. It SHALL return the
caller's unseen Comment Mentions first, then one page of their News Events in the news' own order, with the window's
total and the next cursor. It SHALL mark no mention seen and no Finding read. A visitor's call SHALL return the sign-in
result the other account tools return. The tool SHALL be titled "Read Brews News" and annotated read-only.

#### Scenario: Mentions lead the result

- **WHEN** a user with two unseen Comment Mentions calls `read_news`
- **THEN** the result lists the two mentions, then the week's first 20 News Events, and both mentions stay unseen

#### Scenario: A window narrows the result

- **WHEN** a user calls `read_news` with the hour
- **THEN** the result holds only events of the last hour and that window's total

#### Scenario: A visitor is asked to sign in

- **WHEN** a client with no user calls `read_news`
- **THEN** the result is the sign-in result, and no news is read

### Requirement: read_topic_posts returns a Topic's published Topic Posts

The `read_topic_posts` tool SHALL take a Topic and an optional cursor and SHALL return that Topic's published Topic
Posts, newest first, 20 a page, each with its id, title, author's username, publish time, summary, and url, to anyone
who may open the Topic. On the topic-bound route the Topic SHALL default to the bound one. It SHALL return no draft.
The tool SHALL be titled "Read a topic's Open Mic posts" and annotated read-only.

#### Scenario: A visitor reads a public Topic's posts

- **WHEN** a client with no user calls `read_topic_posts` with a public Topic that has three Topic Posts
- **THEN** the result lists the three, newest first, each with its summary and url

#### Scenario: A Topic the caller may not open is not found

- **WHEN** a client calls `read_topic_posts` with a private Topic its user may not open
- **THEN** the result is the same error as for a Topic that does not exist

### Requirement: read_topic_post returns one Topic Post with its summary

The `read_topic_post` tool SHALL take a Topic Post's id and SHALL return its title, author's username, publish time,
summary, body as text, url, and whether it has a discussion, to anyone who may open its Topic. A body past the MCP page
budget SHALL end at a whole paragraph and say that the rest is on the page. A draft SHALL be answered as not found. The
tool SHALL be titled "Read an Open Mic post" and annotated read-only.

#### Scenario: A post is read with its summary

- **WHEN** a client calls `read_topic_post` with a published Topic Post on a public Topic
- **THEN** the result holds the summary, the body's text, and the url of the post's page

#### Scenario: A long post fits the budget

- **WHEN** a Topic Post's body would pass the page budget
- **THEN** the result ends at a whole paragraph and says the rest is on the page

#### Scenario: A draft is not found

- **WHEN** a client calls `read_topic_post` with a draft's id, as its author or as anyone else
- **THEN** the result is the same error as for a Topic Post that does not exist

### Requirement: The news and Topic Post results are fenced

Every text a person or a page wrote in a `read_news`, `read_topic_posts`, or `read_topic_post` result SHALL be fenced
with a per-call nonce in both its text and its structured content: usernames, Comment lines, titles, Topic names,
summaries, and a Topic Post's body. The result SHALL say that the text is data and never instructions. The MCP view
SHALL read the plain copy from its `_meta` data, which the model does not read.

#### Scenario: A post's body holds an instruction

- **WHEN** a Topic Post's body tells the model to do something
- **THEN** the body arrives inside its fence in both representations, and the MCP view shows it as written

### Requirement: Topic Posts are published on the web and in the mobile app only

No tool SHALL create, save, publish, edit, or delete a Topic Post, or regenerate its image or its discussion. A Topic
Post's thread SHALL be read and written through `read_hot_takes` and `post_hot_take` with the post as the social target,
and `save_reaction` SHALL accept it as well.

#### Scenario: A Comment on a post goes through the hot take tool

- **WHEN** a client calls `post_hot_take` with a published Topic Post as its target
- **THEN** the Comment is posted on that post's thread, unshared

#### Scenario: No tool publishes

- **WHEN** a client lists tools
- **THEN** none of them writes a Topic Post

### Requirement: The new tool descriptions name their phrases

`read_news` SHALL list Brews News, what happened this week, and who mentioned me among the phrases it answers to.
`read_topic_posts` and `read_topic_post` SHALL list Open Mic and a topic's posts. Each description SHALL name Carl and
CarlNotes and SHALL NOT tell the model to call the tool unprompted.

#### Scenario: The descriptions pass the annotation check

- **WHEN** the annotation check reads the three new tools
- **THEN** each description names Carl, CarlNotes, and its phrases, and none asks the model to act on its own

## MODIFIED Requirements

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. The four existing reads,
`suggest_topics`, `read_scan_status`, `read_topic_context`, `read_hot_takes`, `read_news`, `read_topic_posts`, and
`read_topic_post` SHALL use `readOnlyHint: true`. The
seven existing account tools SHALL use `readOnlyHint: false` and conservative `destructiveHint: true`, including
Source suggestions that consume allowance. `stop_scan` SHALL use `readOnlyHint: false` and `destructiveHint: true`,
since a stop ends paid work and cannot be undone. `save_reaction` SHALL use `readOnlyHint: false` and
`destructiveHint: true`, since a save replaces or removes the caller's Reaction. The additive `send_to_topic`,
`read_updates`, `send_finding_feedback`, and `post_hot_take` tools SHALL use `readOnlyHint: false` and
`destructiveHint: false`. `start_scan` SHALL use `readOnlyHint: false`, `destructiveHint: false`, and
`openWorldHint: true`. Existing edit confirmations SHALL remain unchanged; new-Topic creation SHALL follow the
explicit draft-confirmation flow.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all twenty-five tools have titles and the expected safety hints
- **AND** idempotence and open-world hints remain accurate

#### Scenario: An annotation regresses

- **WHEN** a tool loses its title, supplies a non-boolean hint, marks a write read-only, or drops its required
  destructive hint
- **THEN** the annotation check fails with the tool name
- **AND** newly advertised tools cannot silently bypass that check

#### Scenario: The additive send has accurate metadata
- **WHEN** a client lists `send_to_topic`
- **THEN** it has a nonempty title, explicit false read-only and destructive hints, and accurate idempotence/open-world
  hints
- **AND** its description requires an explicit user request and never requests assistant history, memory, or uploaded
  files

### Requirement: MCP release gates include additive sends

MCP smoke checks SHALL include both routes, all twenty-five tool annotations, identity and revocation checks,
editable-Topic authorization and sender-only private layers, origin handling, and existing result-size/pagination
guarantees. The nine UI resources, numbered suggestion text, name search, stable cursor pages, and atomic multi-Topic
send accounting SHALL be checked. Each new tool SHALL have a smoke section on both routes. New send results SHALL remain
bounded and render as text if MCP Apps are unavailable.

#### Scenario: A release regresses the new contract
- **WHEN** a send is mislabeled read-only or destructive, a disconnected client sends, or another user's entry leaks
- **THEN** the smoke gate fails with the responsible tool and condition

#### Scenario: Routing description guidance regresses
- **WHEN** a release omits any explicit trigger verb or recipient, suggests despite a named Topic, or permits autonomous
  initiation
- **THEN** the MCP smoke gate fails on both routes

#### Scenario: Existing transport checks still run
- **WHEN** MCP smoke validation runs
- **THEN** missing Origin remains accepted, disallowed Origin remains rejected on both routes, and existing read
  pagination/auth checks still pass
