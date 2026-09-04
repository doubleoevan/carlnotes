## REMOVED Requirements

### Requirement: Finding is a topic-scoped judgment about a Resource

**Reason**: A Finding now records what it was reviewed against, and the word for that act is review everywhere in the code. Judgment named the same thing under a word the codebase no longer uses.

**Migration**: Replaced by "Finding is a topic-scoped review about a Resource", which keeps the one-Finding-per-topic-and-resource rule and the in-place re-score, and adds the reviewed context hash and reviewed content hash the re-read depends on.

## ADDED Requirements

### Requirement: Finding is a topic-scoped review about a Resource
A Finding SHALL reference both its Topic and its Resource and carry a signal score, a why-summary, a `source_visibility` provenance value, and an optional thumbs value. It SHALL also record what it was reviewed against: a hash of the Topic's effective context at the moment it was scored, and the content hash of the Resource as scored. Both are nullable. A null context hash SHALL read as a review made against an unknown context, which the next Scan reviews again. A null content hash SHALL match a Resource that has no content hash, so a Resource that never had one is settled rather than reviewed again by every Scan forever. `(topic_id, resource_id)` MUST be unique, so re-scoring a Resource in the same Topic updates the existing Finding instead of inserting a duplicate. One Resource MUST still be able to have many Findings across different Topics.

#### Scenario: One resource yields findings in multiple topics
- **WHEN** the same resource is reviewed relevant to two topics
- **THEN** two `findings` rows exist, each referencing the shared `resources` row and its own `topics` row

#### Scenario: Re-scoring updates in place
- **WHEN** a resource already has a finding in a topic and is scored again in that topic
- **THEN** the existing `findings` row is updated and no duplicate row is created

#### Scenario: A finding records what it was reviewed against
- **WHEN** a finding is written or re-written by curation
- **THEN** its row carries the hash of the topic context and the resource content hash it was scored against

#### Scenario: A finding written before the columns existed reads as unknown
- **WHEN** a finding row carries a null reviewed context hash
- **THEN** it is treated as reviewed against an unknown context rather than the current one, so the next scan reviews again it

#### Scenario: A resource that never had a content hash is settled
- **WHEN** a finding's reviewed content hash and its resource's content hash are both null
- **THEN** the content counts as unchanged, so an untouched topic does not review again it on every scan
