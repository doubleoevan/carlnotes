# topic-memories Specification

## Purpose
Preserve topic memories across a Topic's Scans so readers can review them and Carl can use them as background.

## Requirements

### Requirement: Successful Scans maintain a bounded Journal

After a successful Scan, the topic memory update SHALL cluster kept external public Findings by embedding. Each proposal call SHALL see one cluster. Reconciliation SHALL check the resulting claims against the active Journal within its input budget.

#### Scenario: A source is Carl's own work

- **WHEN** a candidate points to CarlNotes content such as a Coffee Break episode, film, or Topic Post
- **THEN** it is excluded from topic memory updates and duplicate review even if another Topic published it

#### Scenario: A Scan adds evidence about a known topic memory

- **WHEN** new public evidence confirms or expands an existing topic memory
- **THEN** the update records the new evidence and latest Scan on the existing topic memory
- **AND** retrying the same update cannot apply the changes again

#### Scenario: Personal sources and rejected topic memories

- **WHEN** the Topic has personal source content or a previously rejected topic memory
- **THEN** the update excludes private content and does not restore the rejected topic memory

#### Scenario: A budget cutoff pauses the topic memory update

- **WHEN** the free scheduled scan cutoff prevents a run
- **THEN** the next completed Scan can update topic memories without replaying the skipped backlog

#### Scenario: Backfill processes the latest five Scans

- **WHEN** an operator runs the backfill
- **THEN** it considers each Topic's latest five succeeded Scans in chronological order

### Requirement: Each topic memory contains one claim

The topic memory update SHALL check every proposal it considers for storage. It SHALL ask the model to split compound proposals and reject rewritten topic memories that still contain multiple claims. Each accepted claim SHALL have its own Finding IDs and a separate event date at the precision the evidence supports when an event date is known.

#### Scenario: A Finding describes multiple events

- **WHEN** a Finding reports someone starting a job and someone receiving a grant
- **THEN** the topic memory update verifies each supported claim separately
- **AND** it embeds claim wording alone and stores dates and provenance in separate fields

#### Scenario: An operator splits a stored compound topic memory

- **WHEN** the dev repair finds an active topic memory with multiple claims
- **THEN** it verifies each rewritten claim and keeps the original in history
- **AND** it copies each rating and note to the matching claim, or to every split claim when the target is unclear
- **AND** it checks the source links and ratings again before writing

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

### Requirement: Readers and authorized raters use the Journal

The Journal SHALL read one page of active topic memories at a time. It SHALL show numbered claims with the most recently added claims first across pages. A displayed duplicate group SHALL use its earliest saved date among eligible rows.

#### Scenario: A newly added claim appears first

- **WHEN** a reader opens the Journal after Carl adds a claim
- **THEN** the claim appears ahead of older entries, including those from more recent brews or with positive feedback
- **AND** later evidence for an existing group does not advance its position ahead of a newly added claim

#### Scenario: A Topic has no topic memories

- **WHEN** a reader opens a Topic with no visible topic memories, including a Topic with no Scans
- **THEN** the Brew diary SHALL show the Journal button and a count of zero on web and Expo
- **AND** opening the Journal SHALL show an empty state in Carl's voice

#### Scenario: The owner provides feedback

- **WHEN** an owner or team lead submits a rate-limited rating and optional note together
- **THEN** the rater's saved note returns when they reopen the topic memory
- **AND** the Journal and MCP show the stored claim. Other readers cannot see the rating note.
- **AND** a thumbs-down rejects the topic memory when the note is blank or keeps it as a correction when it contains text

#### Scenario: The owner reaches the saved topic memory limit

- **WHEN** an owner or team lead tries to save a thirty-first active topic memory
- **THEN** the Journal reports the cap without creating another saved topic memory

#### Scenario: A guest opens a private Topic's Journal

- **WHEN** the caller lacks permission to read the Topic
- **THEN** the caller cannot get its topic memories or submit feedback

### Requirement: Carl uses topic memories as untrusted background

Scoring, Finding descriptions, Coffee Break scripts, and Topic Post Discussion scripts SHALL receive at most 20 active topic memories within a fixed token budget. Relevant chapter and post reads SHALL use vector similarity within feedback priority tiers.

#### Scenario: A rating note accompanies a prompt

- **WHEN** a prompt includes a topic memory with feedback
- **THEN** it includes the bounded notes from either thumb inside an untrusted fence
- **AND** a correction includes the original claim and the corrected wording
- **AND** changes to topic memories leave the review cache hash unchanged

#### Scenario: Dated material distinguishes plans from outcomes

- **WHEN** scoring, a topic memory update, or a script prompt reads dated evidence
- **THEN** the prompt supplies the current UTC date even when the Journal is empty
- **AND** the model compares event dates against that day without treating publication or Scan dates as event dates
- **AND** a past scheduled date alone does not establish that the event happened

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
