## MODIFIED Requirements

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title, an `annotations.title` equal to that title, and explicit boolean
safety hints, with at least one of `readOnlyHint` and `destructiveHint` set. Every read SHALL use
`readOnlyHint: true`. Every write SHALL use `readOnlyHint: false`. Only a write that deletes or overwrites something the
caller cannot restore SHALL use `destructiveHint: true`: `delete_note`, `delete_hot_take`, `save_note`, which can
replace a note's body with no history kept, and `set_topic_image`, which deletes the previous image. Every other write,
among them `create_topic`, `edit_topic`, `suggest_sources`, `mark_finding_consumed`, `rate_finding`, `bookmark_finding`,
`follow_topic`, `stop_scan`, and `save_reaction`, SHALL use `destructiveHint: false`. A write that fetches a url the
caller names, `suggest_sources`, `start_scan`, `set_topic_image`, and `add_topic_attachment`, SHALL use
`openWorldHint: true`. A write that leaves the same state when repeated SHALL use `idempotentHint: true`. Topic creation
SHALL keep its draft preview, and `edit_topic` SHALL keep its own confirmations for going public and removing a Source.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all forty-five tools have titles, annotation titles equal to them, and the expected safety hints
- **AND** idempotence and open-world hints remain accurate

#### Scenario: An annotation regresses

- **WHEN** a tool loses its title or its annotation title, names itself differently in its annotations, sets neither
  a read-only nor a destructive hint, supplies a non-boolean hint, marks a write read-only, marks an irreversible
  write non-destructive, or marks any other write destructive
- **THEN** the annotation check fails with the tool name
- **AND** newly advertised tools cannot silently bypass that check

#### Scenario: The additive send has accurate metadata
- **WHEN** a client lists `send_to_topic`
- **THEN** it has a nonempty title, explicit false read-only and destructive hints, and accurate idempotence/open-world
  hints
- **AND** its description requires an explicit user request and never requests assistant history, memory, or uploaded
  files

#### Scenario: Only irreversible writes ask the host

- **WHEN** a client lists tools
- **THEN** `delete_note`, `delete_hot_take`, `save_note`, and `set_topic_image` are the only tools with
  `destructiveHint: true`

### Requirement: MCP release gates include additive sends

MCP smoke checks SHALL include both routes, all forty-five tool annotations, identity and revocation checks,
editable-Topic authorization and sender-only private layers, origin handling, and existing result-size/pagination
guarantees. The sixteen UI resources, numbered suggestion text, name search, stable cursor pages, and atomic
multi-Topic send accounting SHALL be checked. Each new tool SHALL have a smoke section on both routes, and each tool
that returns a list or a page SHALL have a result-size check. Results SHALL remain bounded and render as text if MCP
Apps are unavailable.

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

#### Scenario: A new tool joins every gate

- **WHEN** the smoke tests run after this change
- **THEN** each of the seventeen new tools is called on the plain route and the topic-bound route, and each list or
  page it returns stays within the result-size limit

## REMOVED Requirements

### Requirement: set_topic_image regenerates a topic's image or sets it from a url

**Reason**: A render from a free-text prompt is a paid model call that an AI host could start with no page in front of
the person. Regenerating stays on the topic page, where the month's regenerations show.

**Migration**: Call `set_topic_image` with an `image_url`, or regenerate the image on the topic page.

## ADDED Requirements

### Requirement: set_topic_image sets a topic's image from a url

The server SHALL expose `set_topic_image`, taking a `topic_id` and an `image_url`, and SHALL NOT take an image prompt
or start a render. An image from a url SHALL pass the upload's size, type, and image moderation checks and be fetched
through the public fetch guard. A call from an editor with no `image_url` SHALL leave the image unchanged and return an
error that names the topic page, where the editor regenerates the image.

#### Scenario: A url that is not an image is rejected

- **WHEN** an editor calls `set_topic_image` with a url that returns html
- **THEN** the image is unchanged and the result says the url is not a supported image

#### Scenario: A call with no url names the topic page

- **WHEN** an editor calls `set_topic_image` with no `image_url`
- **THEN** no render starts, the image is unchanged, and the error names the topic page's url and the `image_url`
  argument
