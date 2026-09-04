## MODIFIED Requirements

### Requirement: Curation runs after ingestion within the same Scan

`runTopicScan` SHALL run curation after it upserts the Scan's Resources and before it closes the Scan: the Scan stays `running` through curation and is closed exactly once, recording curation's outputs alongside ingestion's. Curation SHALL process a discovered Resource when it has no Finding for the Topic, when its Finding was reviewed against a different Topic context than the current one, or when its Finding was reviewed against different Resource content than the Resource now holds. A Resource whose Finding was reviewed against the same context and the same content SHALL be left untouched, so an unchanged Topic spends nothing re-deriving what it already knows. A curation failure SHALL finalize the Scan as `failed` with the error recorded, never leaving it stuck `running`.

#### Scenario: Curation runs before the Scan closes

- **WHEN** a Scan's Sources have returned Resources and ingestion has upserted them
- **THEN** curation runs over the Resources that need reviewing and the Scan is closed once, after curation, with its curation outputs recorded

#### Scenario: Already-scored Resources are skipped

- **WHEN** a discovered Resource has a Finding whose reviewed context hash and reviewed content hash both match the current ones
- **THEN** curation does not re-score it, no model call is spent on it, and its Finding stands

#### Scenario: An edited Topic context reviews again its Findings

- **WHEN** the owner edits the Topic's prompt, or adds or removes an attachment, and the Topic scans
- **THEN** every discovered Resource whose Finding was reviewed against the previous context is re-scored, and its Finding is updated in place rather than duplicated

#### Scenario: Changed Resource content is reviewed again

- **WHEN** a discovered Resource's stored content hash differs from the hash its Finding was reviewed against
- **THEN** curation re-scores it against the current Topic context

#### Scenario: A Finding the Scan never rediscovered is reviewed again

- **WHEN** the Topic's context has changed and it holds a Finding whose Resource no Source returned on this Scan
- **THEN** curation re-scores that Finding anyway, so a bookmarked or rated Finding is not frozen by its feed moving on

#### Scenario: A Finding that predates the hash is reviewed once

- **WHEN** a discovered Resource has a Finding with no reviewed context hash
- **THEN** curation treats it as reviewed against an unknown context and re-scores it, so the Finding records the context it was reviewed against from then on

#### Scenario: A curation failure fails the Scan

- **WHEN** curation throws an unrecoverable error
- **THEN** the Scan is marked `failed`, the error is recorded, and it is not left `running`

### Requirement: Tiered LLM scoring produces Findings with relevance explanations

Curation SHALL score each fetched survivor against the topic's effective context with a cheap-tier model routed through LiteLLM. A survivor whose first-pass score is at or above the promotion threshold SHALL be re-scored by a premium-tier model that also writes a substantive relevance explanation: several sentences of plain prose that first summarize what the content actually says (its specific claims, findings, numbers, names, or events) and then explain how it relates to the topic context — enough substance that the reader gets the gist without opening the source. A single-line note does not satisfy this. Curation SHALL upsert one Finding per `(topic, resource)` carrying the `relevance_score`, the `relevance_explanation`, the `scan_id`, the hash of the topic context it was reviewed against, and the content hash of the Resource as reviewed. Only curation writes Findings; ingesters never do.

A re-score SHALL leave what the user put on the Finding untouched: its rating, who cast that rating and the role they held, its view count, its bookmarks, its read state, and its feedback all survive being reviewed again. The prune that closes the Scan is a separate step and still removes a Finding past `max_results` that no user bookmarked or rated, so surviving a re-score is not the same as surviving the Scan.

#### Scenario: A relevant Resource becomes a scored Finding with a relevance explanation

- **WHEN** a survivor scores at or above the promotion threshold and is re-scored by the premium tier
- **THEN** a Finding is written for `(topic, resource)` with the premium `relevance_score`, a substantive multi-sentence `relevance_explanation`, the current `scan_id`, the reviewed context hash, and the reviewed content hash

#### Scenario: Only promoted Resources reach the premium tier

- **WHEN** a survivor's cheap-tier score is below the promotion threshold
- **THEN** it is not re-scored by the premium tier, consumes no premium-tier spend, and its Finding carries an empty `relevance_explanation`

#### Scenario: Writing a Finding is idempotent per (topic, resource)

- **WHEN** a Finding is written for a `(topic, resource)` that already has one
- **THEN** the existing row is updated via the `(topic_id, resource_id)` unique constraint rather than duplicated, so a Finding is never doubled

#### Scenario: A re-score keeps what the user put on a Finding

- **WHEN** a Finding with a rating, a view count, a bookmark, and feedback is re-scored
- **THEN** its relevance score, explanation, scan id, reviewed hash, and reviewed content hash are updated, and its rating, rater, rater role, view count, bookmark, read state, and feedback are unchanged

## REMOVED Requirements

### Requirement: A scan prunes the topic to its max results, sparing bookmarks

**Reason**: Its exemption is only bookmarks, which was safe while a Finding's score never moved. A re-score can lower a score, so the same prune would delete a Finding a user rated and cascade away the rating with it.

**Migration**: Replaced by "A scan prunes the topic to its max results, sparing bookmarked and rated Findings", which keeps the `max_results` ranking, the delete, and the rule that lowering the value deletes nothing until the next scan, and widens the exemption from bookmarked to bookmarked or rated.

## ADDED Requirements

### Requirement: A scan prunes the topic to its max results, sparing bookmarked and rated Findings
After a scan writes its Findings, curation SHALL keep only the topic's top `max_results` Findings by relevance score and delete the rest, except Findings a user bookmarked or rated, which are never pruned. A Finding is spared when a user with access bookmarked it or when it has a rating. A view SHALL NOT spare a Finding: opening one is incidental, and sparing every opened Finding would leave an actively read topic unable to prune at all. User feedback SHALL NOT be read here either, since feedback stays record-only and never reaches the ranking path. A lowered `max_results` takes effect at the next scan; editing the value never deletes rows on its own.

Sparing a rating alongside a bookmark matters because a re-score can lower a Finding's relevance score. Without it, editing a topic's prompt would silently delete the rating attached to whatever the new context scores lower.

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
