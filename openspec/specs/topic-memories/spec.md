# topic-memories Specification

## Purpose
Preserve topic memories across a Topic's Scans so readers can review them and Carl can use them as background.

## Requirements

### Requirement: Successful Scans maintain a bounded Journal

After a successful Scan, the topic memory update SHALL cluster kept external public Findings by embedding. Each proposal
call SHALL see one cluster. Reconciliation SHALL check the resulting claims against the active Journal within its input
budget. Every model call of an update SHALL wait and try again after a rate limit, a failing provider, or a timeout,
within the update's attempt, except the optional premium extraction, which makes one attempt and is skipped if it
fails. An update SHALL keep one running total of what its model calls cost and SHALL start no
further model call once the total reaches the amount it reserved, and it SHALL save what it had checked. The proposal
call SHALL see a rated topic memory's thumbs and never the note. The last attempt of an update that fails SHALL be
reported by its error class and codes alone. The backfill's updates SHALL run on the platform's key, and their cost
SHALL be recorded in the `spends` table as the platform's, never against a Scan's owner or on the Scan.

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

#### Scenario: Saved topic memories and corrections fill the limit

- **WHEN** a Scan succeeds on a Topic whose saved topic memories and corrections alone fill its limit
- **THEN** the update SHALL mark the Scan updated with no model call, because a new topic memory would be retired in
  the write that adds it
- **AND** the Scan's evidence SHALL reach no existing topic memory, until a saved topic memory or correction is removed

#### Scenario: A provider limits the rate of an update's calls

- **WHEN** one model call of an update gets a rate limit and its next attempt succeeds
- **THEN** the update SHALL finish its attempt with that one extra call
- **AND** no wait SHALL end in the attempt's last half minute

#### Scenario: An update reaches the amount it reserved

- **WHEN** the running total of an update's model calls reaches the amount the update reserved
- **THEN** the update SHALL start no further model call, commit the claims it had matched, and report that it stopped
- **AND** the Scan row SHALL take the update's spend once a stage and once more as the update ends

#### Scenario: An update fails its last attempt

- **WHEN** the last attempt of a Scan's update fails
- **THEN** the failure SHALL be reported with its error class, its status code, and its error code, and never with
  the provider's message
- **AND** a child that could not start SHALL be reported, and the Scan's podcast episode, email, and push SHALL
  still start

#### Scenario: Another attempt holds a Scan's update

- **WHEN** an update finds another attempt's lease on its Scan
- **THEN** its next attempt SHALL wait at least as long as one whole attempt may run

#### Scenario: The owner's key is replaced during an update

- **WHEN** the model gateway rejects a key that the owner no longer holds
- **THEN** the update SHALL be tried again on the owner's current key

#### Scenario: The backfill meets failures in a row

- **WHEN** three Scans in a row fail in the backfill
- **THEN** the backfill SHALL wait and try the last of them once more before it goes on
- **AND** a Scan that its user stopped SHALL be left out of the backfill

#### Scenario: The backfill bills the platform

- **GIVEN** a Scan whose owner's monthly budget is spent and who is past the daily cutoff
- **WHEN** the backfill updates that Scan's topic memories
- **THEN** the update SHALL run on the platform's key with nothing reserved against the owner
- **AND** its cost SHALL be a `spends` row with no user, and the Scan's cost SHALL stay as it was

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

Exact combines SHALL match the normalized subject, claim type, and value, and require compatible dates. A newer
observation may retire an older row with a changed value only when the normalized subjects and single-valued claim types
match, one normalized value contains the other as complete tokens, and the model confirms an update to the same fact
after seeing both texts and dates. The writer SHALL recheck the predecessor under the Topic lock. Similarity SHALL only
create groups during reads. A topic memory SHALL keep the newest 30 of the Findings that support it. A statement SHALL
be archived as an outdated row only if its wording or its date is new.

#### Scenario: A checked claim repeats an existing fact

- **WHEN** extraction or splitting produces a checked claim
- **THEN** the reconciliation prompt SHALL receive all eligible active topic memories that fit together within its input
  budget
- **AND** it SHALL fall back to the nearest eligible active rows only when the full Journal exceeds that budget,
  matching each batch of claims in one call against the union of that batch's nearest rows
- **AND** it SHALL choose add, update by existing ID, or no operation

#### Scenario: A model directs a Journal update

- **WHEN** the candidate expresses the same assertion as a row the model was shown
- **THEN** the writer SHALL recheck the row's Topic, revision, active status, and date under the Topic lock
- **AND** it SHALL retain the existing ID and preserve the prior wording and evidence as a recoverable outdated row when
  updating it
- **AND** invalid or stale IDs SHALL leave existing rows intact
- **AND** the candidate's wording SHALL replace the row's only if no one has rated the row and the Scan is no older than
  the row's last one, and a rated row SHALL still gain the evidence
- **AND** an update that only adds evidence SHALL archive no copy of the row
- **AND** an update that repeats the row's claim SHALL still widen the row's first and last Scans, with no archived
  copy and no merge decision

#### Scenario: An exact combine preserves both statements

- **WHEN** the subject, claim type and normalized value match and the dates are compatible
- **THEN** the write SHALL retain the combined original as outdated with `replacedById` pointing to the active row
- **AND** a partial or unknown date SHALL preserve separate rows when it could match conflicting dated occurrences
- **AND** the active row's own wording and date stated again SHALL add its evidence and archive no copy

#### Scenario: A backfill discovers an older value

- **WHEN** an earlier completed Scan proposes a different value for an exact key
- **THEN** the older value SHALL retain its own row and feedback

#### Scenario: Cleanup merges a duplicate cluster

- **WHEN** authorized claims share a subject, claim type, and normalized value, have compatible dates, and meet the read
  grouping rule
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

The Journal SHALL read one page of active topic memories at a time. It SHALL show numbered claims with the most recently
added claims first across pages. A displayed duplicate group SHALL use its earliest saved date among eligible rows. The
Topic's owner MAY rate a topic memory, and so MAY a leader of the team that owns the Topic while the owner is an active
member of it. A team that only holds a share of the Topic SHALL NOT rate. A rating SHALL count only while its rater may
still rate. A count of a Journal's groups SHALL read only the rows that can join a group.

#### Scenario: A newly added claim appears first

- **WHEN** a reader opens the Journal after Carl adds a claim
- **THEN** the claim appears ahead of older entries, including those from more recent brews or with positive feedback
- **AND** later evidence for an existing group does not advance its position ahead of a newly added claim

#### Scenario: A Topic has no topic memories

- **WHEN** a reader opens a Topic with no visible topic memories, including a Topic with no Scans
- **THEN** the Brew diary SHALL show the Journal button and a count of zero on web and Expo
- **AND** opening the Journal SHALL show an empty state in Carl's voice

#### Scenario: The owner provides feedback

- **WHEN** the owner or a leader of the owning team submits a rate-limited rating and optional note together
- **THEN** the rater's saved note returns when they reopen the topic memory
- **AND** the Journal and MCP show the stored claim. Other readers cannot see the rating note.
- **AND** a thumbs-down rejects the topic memory when the note is blank or keeps it as a correction when it contains
  text
- **AND** the note is saved on one line
- **AND** a thumbs-down with a blank note rejects every statement of the fact that the Journal shows as one

#### Scenario: The owner reaches the saved topic memory limit

- **WHEN** an owner or team lead rates another active topic memory after reaching the former threshold of thirty
  endorsements
- **THEN** the Journal SHALL save the rating and its optional note
- **AND** the rater SHALL be able to see and edit that feedback on reopening the Journal, including for a topic memory
  outside Carl’s ranked prompt selection

#### Scenario: A guest opens a private Topic's Journal

- **WHEN** the caller lacks permission to read the Topic
- **THEN** the caller cannot get its topic memories or submit feedback

#### Scenario: A leader of a team that only holds a share

- **WHEN** a leader of a team that shares a public Topic rates one of its topic memories
- **THEN** the rating SHALL be refused and the Journal SHALL show that person no rating control

#### Scenario: A rater loses the role

- **WHEN** a leader who rated a topic memory becomes a member, or the Topic's owner leaves the owning team
- **THEN** that leader's rating SHALL stop counting as a correction, as a saved mark, and in every prompt and search
- **AND** it SHALL count again if the leader may rate again

#### Scenario: A newer statement joins a rated fact

- **WHEN** a later Scan adds a statement that the Journal groups with one the caller rated
- **THEN** the Journal SHALL show the caller's own rating and note on that fact, under the id of the statement they
  rated
- **AND** a correction on any statement of the fact SHALL mark the fact and reach Carl's prompts

### Requirement: Carl uses topic memories as untrusted background

Scoring, Finding descriptions, Coffee Break scripts, and Topic Post Discussion scripts SHALL receive at most 20 active
topic memories within a fixed token budget. Relevant chapter and post reads SHALL use vector similarity within feedback
priority tiers. Each topic memory and each note SHALL be one line of the background, and a topic memory too long for the
budget SHALL be left out while the shorter ones after it stay in. A read of topic memories that fails SHALL be reported
and SHALL leave the prompt with no topic memory.

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

#### Scenario: A note holds a line break

- **WHEN** a rating note or a stored claim holds a line break
- **THEN** the background SHALL show it on one line, so it cannot read as a second topic memory

#### Scenario: The topic memories cannot be read

- **WHEN** the read of a Topic's topic memories fails during a review, a script, or a podcast episode plan
- **THEN** the review, the script, or the plan SHALL go on with no topic memory, and the failure SHALL be reported

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
