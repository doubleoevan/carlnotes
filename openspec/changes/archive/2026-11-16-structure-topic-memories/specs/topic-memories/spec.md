## ADDED Requirements

### Requirement: Each stored fact has structured identity

A new Topic Memory SHALL include one named subject, fixed claim type, value, readable text, and any supported event date. Person subjects SHALL carry an evidence-based identifying detail.

#### Scenario: A known entity appears under a spelling variant

- **WHEN** extraction identifies the same entity in the Topic's established subjects
- **THEN** extraction SHALL reuse its subject spelling, normalize the value, and choose a claim type from the shared contract
- **AND** extraction SHALL use `other` for an unclear claim type and preserve a person's identifying detail

#### Scenario: A Finding supplies an alternate name for a known subject

- **WHEN** public Finding evidence explicitly identifies an alternate name for an existing entity
- **THEN** the Topic SHALL record the alias with its Finding and reuse the canonical name
- **AND** an update for a person SHALL require the same resolved person match key

#### Scenario: A source supplies only a year or month

- **WHEN** evidence establishes an event year or month
- **THEN** the topic memory SHALL store and display that precision
- **AND** exact combines SHALL accept a compatible partial or unknown date

#### Scenario: A claim uses a pronoun

- **WHEN** an extracted or stored claim starts with a pronoun
- **THEN** Carl SHALL use the person supported by the linked Findings and write the person's name in the claim
- **AND** a claim with an unresolved subject SHALL stay out of the Journal and prompt context

#### Scenario: An article describes a trip duration

- **WHEN** an extracted duration depends on the article for who traveled and where
- **THEN** each published claim SHALL name the traveler and destination or route from the linked Finding

#### Scenario: A dated article reports a changing state

- **WHEN** a source describes a then-current home, job, or other state
- **THEN** the topic memory SHALL qualify that observation in past tense using the supported publication date
- **AND** the publication date SHALL remain distinct from any event date in `factDate`

#### Scenario: Dev contains an earlier claim

- **WHEN** a dev repair encounters an earlier Topic Memory
- **THEN** it SHALL extract the fields, split supported compound claims, retain the original and applicable feedback, and re-embed changed claim text

#### Scenario: A repair cannot produce a supported rewrite

- **WHEN** checking or rewriting an active claim fails or yields an unsupported rewrite
- **THEN** the repair SHALL keep the original text, sources, and feedback active and queue the row for another repair
- **AND** a split that cannot save distinct supported children SHALL roll back every attempted child and feedback write
- **AND** the queued row SHALL stay outside prompt selection, exact matching, and eviction until checked
- **AND** the repair SHALL retire an unreplaced original only after an explicit nonclaim verdict

### Requirement: An independent human can label sampled pairs

The review SHALL sample up to 50 combined pairs and 50 grouped pairs without revealing the action class or judge. Score reports SHALL distinguish the human score, judge score, and agreement and disclose the sample denominator.

#### Scenario: The owner reviews a pair on a phone

- **WHEN** the owner chooses Same fact or Different
- **THEN** the review SHALL save the label and make it available after a reload

## MODIFIED Requirements

### Requirement: Code deduplicates and evicts topic memories

Exact combines SHALL match the normalized subject, claim type, and value, and require compatible dates. A newer observation may retire an older row with a changed value only when the normalized subjects and single-valued claim types match, one normalized value contains the other as complete tokens, and the model confirms an update to the same fact after seeing both texts and dates. The writer SHALL recheck the predecessor under the Topic lock. Similarity SHALL only create groups during reads.

#### Scenario: A checked claim repeats an existing fact

- **WHEN** extraction or splitting produces a checked claim
- **THEN** the reconciliation prompt SHALL receive all eligible active topic memories that fit together within its input budget
- **AND** it SHALL fall back to the nearest eligible active rows only when the full Journal exceeds that budget
- **AND** it SHALL choose add, update by existing ID, or no operation

#### Scenario: A model directs a Journal update

- **WHEN** the candidate expresses the same assertion as a row the model was shown
- **THEN** the writer SHALL recheck the row's Topic, revision, active status, and date under the Topic lock
- **AND** it SHALL retain the existing ID and preserve the prior wording and evidence as a recoverable outdated row when updating it
- **AND** invalid or stale IDs SHALL leave existing rows intact

#### Scenario: An exact combine preserves both statements

- **WHEN** the subject, claim type and normalized value match and the dates are compatible
- **THEN** the write SHALL retain the combined original as outdated with `replacedById` pointing to the active row
- **AND** a partial or unknown date SHALL preserve separate rows when it could match conflicting dated occurrences

#### Scenario: The Journal button is disabled

- **WHEN** `TOPIC_JOURNAL_ENABLED` is off or production uses the default
- **THEN** the Topic page SHALL omit the Journal count and the web and Expo Brew diary SHALL hide its button

#### Scenario: A backfill discovers an older value

- **WHEN** an earlier completed Scan proposes a different value for an exact key
- **THEN** the older value SHALL retain its own row and feedback

#### Scenario: Cleanup merges a duplicate cluster

- **WHEN** authorized claims share a subject, claim type, and normalized value, have compatible dates, and meet the read grouping rule
- **THEN** the Journal SHALL select one representative per group
- **AND** the Journal SHALL show the newest observation and favor fuller wording when dates tie

#### Scenario: Prompts use ranked topic memories

- **WHEN** a model prompt includes topic memories
- **THEN** it SHALL use at most one claim per reversible group, preserving distinct normalized values

#### Scenario: The same key covers two events

- **WHEN** two claims share a key but describe separate events or versions
- **THEN** both SHALL remain active with independent evidence and feedback

#### Scenario: The model gateway rejects the Topic owner's key

- **WHEN** the Journal job receives an authentication rejection from LiteLLM
- **THEN** the activity SHALL report a nonretryable failure in Temporal and monitoring without exposing the key
- **AND** the completed Scan SHALL remain successful

#### Scenario: The Journal is full

- **WHEN** the active Topic Memory limit is exceeded among claims ready for use
- **THEN** code SHALL retire the lowest ranked unprotected rows by importance and Scan recency
- **AND** protected rows SHALL remain active if they alone exceed the 100-row target

#### Scenario: The last Journal page disappears

- **WHEN** a page request exceeds the current authorized group count
- **THEN** the reader SHALL receive the last available page from that same snapshot

#### Scenario: A Scan returns to an evicted story

- **WHEN** new evidence confirms an evicted fact with the same exact key and value
- **THEN** it SHALL reactivate and gain the new Finding links

#### Scenario: Namesakes and rejected text are guarded

- **WHEN** the same name has incompatible identifying details or the wording was rejected
- **THEN** the writer SHALL keep namesakes separate and withhold rejected wording
