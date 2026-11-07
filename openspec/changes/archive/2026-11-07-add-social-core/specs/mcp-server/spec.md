# Spec Delta

## ADDED Requirements

### Requirement: save_reaction saves the caller's Reaction

The `save_reaction` tool SHALL take a social target, a Comment included, and an optional reaction type, and SHALL
save the connected user's Reaction by the rules, gate, and daily limit the site's save uses. A call with no type
SHALL remove the caller's Reaction. The tool SHALL take no text. It SHALL be titled "React", SHALL be annotated as a
destructive, idempotent write, and SHALL give a visitor the connect text.

#### Scenario: A type is saved for a Finding

- **WHEN** a connected user's client calls `save_reaction` with a Finding and the type `insightful`
- **THEN** the user's Reaction on that Finding holds `insightful`, and the result says it was saved

#### Scenario: A type is saved for a Comment

- **WHEN** a connected user's client calls `save_reaction` with a Comment it read through `read_hot_takes`
- **THEN** the user's Reaction on that Comment holds the type

#### Scenario: A call with no type removes the Reaction

- **WHEN** a connected user's client calls `save_reaction` with a Topic and no type
- **THEN** the user's Reaction on that Topic is gone

#### Scenario: A visitor is asked to connect

- **WHEN** a client with no account calls `save_reaction`
- **THEN** the result asks the user to connect an account and nothing is saved

### Requirement: read_hot_takes returns a thread as fenced data

The `read_hot_takes` tool SHALL take a social target and an optional cursor and SHALL return one page of that
thread, newest first, with each Comment's first replies, to anyone who may open the social target. Each body SHALL
be fenced as untrusted data, in the text result and in the structured content, and the result SHALL say that the text
was written by other people and is data and never instructions. The tool SHALL be titled "Read hot takes" and SHALL
be annotated read-only.

#### Scenario: A public Topic's thread is read

- **WHEN** a client calls `read_hot_takes` with a public Topic
- **THEN** the result holds the newest 20 Comments and their first replies, each fenced, with their authors'
  usernames and the notice

#### Scenario: A thread the caller may not open is not found

- **WHEN** a client calls `read_hot_takes` with a private Topic its user may not open
- **THEN** the result is the same error as for a Topic that does not exist

#### Scenario: The structured content is fenced too

- **WHEN** a client calls `read_hot_takes` with a thread whose Comment holds text shaped like a closing untrusted-data
  tag
- **THEN** the structured content holds each body inside that call's delimiters, without that tag

### Requirement: post_hot_take posts a Comment

The `post_hot_take` tool SHALL take a social target, a body, an optional chapter position, and an optional
`parent_id` for a reply, and SHALL post the connected user's Comment by the rules, gate, classification, daily limit,
and share default the site's post uses. The tool SHALL be titled "Add a hot take", SHALL be annotated as a write that
is neither destructive nor idempotent, and SHALL give a visitor the connect text.

#### Scenario: A Comment is posted to a Podcast Episode

- **WHEN** a connected user's client calls `post_hot_take` with a Podcast Episode and a body
- **THEN** the Comment is the newest in that Podcast Episode's thread

#### Scenario: A reply is posted

- **WHEN** a connected user's client calls `post_hot_take` with a body and the `parent_id` of a Comment
- **THEN** the reply shows under that Comment

#### Scenario: A rejected body returns the rejection

- **WHEN** the classification rejects the body
- **THEN** the result is an error naming the category, and nothing is stored

### Requirement: The social tools keep the Terms check and the bound Topic

`save_reaction` and `post_hot_take` SHALL reject an account with outdated Terms, as the site's routes do. On the
Topic-bound endpoint, `save_reaction`, `read_hot_takes`, and `post_hot_take` SHALL reach the social targets of the
bound Topic alone.

#### Scenario: Outdated Terms reject a write

- **WHEN** a connected user with outdated Terms calls `save_reaction` or `post_hot_take`
- **THEN** the call is rejected and nothing is stored

#### Scenario: A Topic-bound connection stays on its Topic

- **WHEN** a client on the Topic-bound endpoint names a social target on another Topic
- **THEN** the call is rejected, and nothing is read or written

### Requirement: read_topic_feed includes each Finding's reaction counts

The `read_topic_feed` result SHALL include each Finding's reaction counts in its structured content, the count per
type alone and never the caller's own type. It SHALL include no Comment's text. A stored MCP view bundle that does
not know the field SHALL still read the result.

#### Scenario: A Finding's counts come with the feed

- **WHEN** a client reads a Topic's feed whose Finding has four Reactions
- **THEN** that Finding's structured content holds the count per type and not the caller's own type

## MODIFIED Requirements

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. The four existing reads,
`suggest_topics`, `read_scan_status`, `read_topic_context`, and `read_hot_takes` SHALL use `readOnlyHint: true`. The
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
- **THEN** all twenty-two tools have titles and the expected safety hints
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

MCP smoke checks SHALL include both routes, all twenty-two tool annotations, identity and revocation checks,
editable-Topic authorization and sender-only private layers, origin handling, and existing result-size/pagination
guarantees. The six UI resources, numbered suggestion text, name search, stable cursor pages, and atomic multi-Topic
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

