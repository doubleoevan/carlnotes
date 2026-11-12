## MODIFIED Requirements

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. The four existing reads,
`suggest_topics`, `read_scan_status`, `read_topic_context`, `read_hot_takes`, `read_news`, `read_topic_posts`,
`read_topic_post`, and `read_dashboard` SHALL use `readOnlyHint: true`. The seven existing account tools SHALL use
`readOnlyHint: false` and conservative `destructiveHint: true`, including Source suggestions that consume allowance.
`stop_scan` SHALL use `readOnlyHint: false` and `destructiveHint: true`, since a stop ends paid work and cannot be
undone. `save_reaction` SHALL use `readOnlyHint: false` and `destructiveHint: true`, since a save replaces or removes
the caller's Reaction. The additive `send_to_topic`, `read_updates`, `send_finding_feedback`, and `post_hot_take` tools
SHALL use `readOnlyHint: false` and `destructiveHint: false`. `start_scan` SHALL use `readOnlyHint: false`,
`destructiveHint: false`, and `openWorldHint: true`. Existing edit confirmations SHALL remain unchanged; new-Topic
creation SHALL follow the explicit draft-confirmation flow.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all twenty-six tools have titles and the expected safety hints
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

MCP smoke checks SHALL include both routes, all twenty-six tool annotations, identity and revocation checks,
editable-Topic authorization and sender-only private layers, origin handling, and existing result-size/pagination
guarantees. The ten UI resources, numbered suggestion text, name search, stable cursor pages, and atomic multi-Topic
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
