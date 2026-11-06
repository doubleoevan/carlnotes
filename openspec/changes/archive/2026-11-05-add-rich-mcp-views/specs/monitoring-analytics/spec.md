## ADDED Requirements

### Requirement: Product events from Personal sources hold no content

When `POSTHOG_API_KEY` is set, Personal sources, updates, and MCP view events SHALL hold only ids, counts, and
flags. No property SHALL hold a title, a summary, a link, an email address, a Topic name, or an API key's label or
secret. An event from a sender's Personal sources API key SHALL have `entryPoint` `api` and no plan or device property,
since the request has no session.

#### Scenario: A send counts its entries without its content

- **WHEN** a connected AI app sends one item to two Topics with three links queued
- **THEN** `personal_source_entry_received` has `origin` `send`, `entryCount` 2, and `queuedLinkCount` 3
- **AND** no property holds the item's title, summary, or link, or a Topic's name

### Requirement: Updates reports each list

`updates_requested` SHALL report every list the user may read, an empty list included, with `minutes`,
`findingCount`, `moreCount`, `hasOpener`, and `topicId` for a list of one Topic.

#### Scenario: An empty list still reports

- **WHEN** a user with no unread Findings asks for a list
- **THEN** `updates_requested` has `findingCount` 0

### Requirement: Personal sources report confirmations

`personal_source_entry_received` SHALL report a send that is accepted, an email that is filed, and an import that is
saved, with `origin` `send`, `email`, or `import`, `entryCount`, and `topicId` where one Topic received it. A send SHALL
also have `queuedLinkCount`.

#### Scenario: A retried email reply reports nothing

- **WHEN** an email is filed and its reply is retried
- **THEN** the filing reports one `personal_source_entry_received`, and the retry reports no event

### Requirement: Personal sources report limits and rejections

`personal_sources_quota_reached` SHALL report a send or an email past the daily limit.
`personal_sources_send_rejected` SHALL report any other send that is not accepted, with `reason`.
`personal_sources_email_unfiled` SHALL report an email that was not filed, with `reason`.

#### Scenario: An email past the limit reports both events

- **WHEN** an email arrives past the sender's daily limit
- **THEN** `personal_sources_email_unfiled` has `reason` `quota`, and `personal_sources_quota_reached` is sent

### Requirement: Personal sources report changes and summaries

`personal_source_entry_deleted` SHALL report a deleted entry with `topicId`. `source_added` and `source_removed` SHALL
report a personal Source a sender adds to or deletes from a Topic, with `sourceType`. `personal_sources_context_built`
SHALL report each summary that commits, keyed to the sender, with `topicId`, `entryCount`, and `hasIncompleteCoverage`.

#### Scenario: A repeat delete reports nothing

- **WHEN** a sender deletes a Source that was already deleted
- **THEN** the request succeeds and no `source_removed` is sent

### Requirement: AI app setup reports each control

`topics_suggested` SHALL report the first page of a matching `suggest_topics` call with `suggestedCount`.
`personal_sources_nudge_dismissed`, `ai_agent_disconnected`, `ai_agent_api_key_created`, and `ai_agent_api_key_revoked`
SHALL report their account controls.

#### Scenario: A later page and autocomplete report nothing

- **WHEN** a host requests a second page of suggestions or an autocomplete
- **THEN** no `topics_suggested` is sent

### Requirement: A Scan reports its Personal sources counts

`scan_completed` SHALL have `personalFindingsKept`, the kept Findings with a Personal sources score bonus, and
`privateAnnotationsSaved`, the private annotations that the Scan saved.

#### Scenario: A Scan keeps a Personal sources link

- **WHEN** a Scan keeps a Finding with a Personal sources score bonus and saves three private annotations
- **THEN** `scan_completed` has `personalFindingsKept` 1 and `privateAnnotationsSaved` 3

### Requirement: An MCP view's audio request reports a play

An MCP view's first request for a podcast episode's audio SHALL report `episode_played` for the user its play token
names, with `entryPoint` `mcp`. A request for a later byte range and a visitor's token SHALL report nothing.

#### Scenario: A seek is not a new play

- **WHEN** an MCP view requests a podcast episode's audio from the first byte, then seeks to a later byte
- **THEN** `episode_played` is sent once, with `entryPoint` `mcp`

### Requirement: An email from a sender with no account reports a visitor event

`personal_sources_email_unregistered` SHALL be a visitor event with `entryPoint` `email`, sent under one shared distinct
id with no person profile and no sender address, once for each delivered reply to a sender who has no account.

#### Scenario: A retried reply to a new sender reports once

- **WHEN** the first reply to a sender with no account fails and a retry delivers it
- **THEN** `personal_sources_email_unregistered` is sent once
