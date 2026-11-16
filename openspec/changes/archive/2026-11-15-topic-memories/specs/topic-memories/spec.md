## Purpose

Preserve takeaways across a Topic's Scans so readers can review them and Carl can use them as background.

## ADDED Requirements

### Requirement: Successful Scans maintain a bounded Journal

After a successful Scan, the takeaway update SHALL cluster kept external public Findings by embedding. Each call SHALL only see that cluster and at most five nearest active or outdated takeaways. The model SHALL propose atomic facts and corrections, with the Finding IDs resolved from cited indexes.

#### Scenario: A Finding describes multiple events

- **WHEN** a Finding reports someone starting a job and someone receiving a grant
- **THEN** the takeaway update can preserve each claim separately with its supporting Findings
- **AND** the text contains the claim, while its known event day and Scan provenance stay in fields

#### Scenario: A source is Carl's own work

- **WHEN** a candidate points to CarlNotes content such as a Coffee Break episode, film, or Topic Post
- **THEN** it is excluded from takeaway updates and duplicate review even if another Topic published it

#### Scenario: A Scan adds evidence about a known takeaway

- **WHEN** new public evidence confirms or expands an existing takeaway
- **THEN** the takeaway update updates that takeaway and its latest Scan and provenance
- **AND** retrying the same update cannot apply the changes again

#### Scenario: Personal sources and rejected takeaways

- **WHEN** the Topic has personal source content or a previously rejected takeaway
- **THEN** the update excludes private content and does not restore the rejected takeaway

#### Scenario: A budget cutoff pauses the takeaway update

- **WHEN** the free scheduled scan cutoff prevents a run
- **THEN** the next completed Scan can update takeaways without replaying the skipped backlog

#### Scenario: Backfill processes the latest five Scans

- **WHEN** an operator runs the backfill
- **THEN** it considers each Topic's latest five succeeded Scans in chronological order

### Requirement: Code deduplicates and evicts takeaways

Adds SHALL merge with a compatible match at cosine similarity 0.98 or higher, flag for review from 0.80 up to 0.98, and otherwise add. Every fifth successful Scan, cleanup SHALL review up to twelve flagged pairs using both texts, dates, and source Findings. Every pair in a merge group SHALL meet the automatic threshold or have a confirmed duplicate verdict. Eviction SHALL remove the lowest importance times Scan-count recency above 100 active rows, protecting saved takeaways and corrections.

#### Scenario: A Scan returns to an evicted story

- **WHEN** a new takeaway matches an evicted one at 0.98 or higher and their identities and dates are compatible
- **THEN** that takeaway becomes active again and receives the new evidence

#### Scenario: Cleanup merges a duplicate cluster

- **WHEN** the fifth Scan triggers cleanup and several takeaways represent the same story
- **THEN** the survivor keeps the earliest first scan, all cited Finding IDs, and the current feedback per rater
- **AND** the old rows retain their original feedback and point to the survivor

#### Scenario: The Journal is full

- **WHEN** dedup leaves more than 100 active takeaways
- **THEN** unprotected takeaways with the lowest recency-adjusted importance become outdated without a replacement

#### Scenario: Namesakes and rejected text are guarded

- **WHEN** two takeaways about a person have the same normalized name and different identifying details
- **THEN** they remain separate
- **AND** a new proposal that repeats rejected text stays out

### Requirement: Readers and authorized raters use the Journal

The Journal SHALL read one page of active takeaways at a time. It SHALL show the numbered claims and rank positive feedback first, corrections second, and the remainder by importance and recency.

#### Scenario: A Topic has no takeaways

- **WHEN** a reader opens an empty Journal
- **THEN** they see an empty state in Carl's voice

#### Scenario: The owner provides feedback

- **WHEN** an owner or team lead submits a rate-limited rating and optional note together
- **THEN** the rater's saved note returns when they reopen the takeaway
- **AND** the Journal and MCP show the stored claim. Other readers cannot see the rating note.
- **AND** a thumbs-down rejects the takeaway when the note is blank or keeps it as a correction when it contains text

#### Scenario: The owner reaches the saved takeaway limit

- **WHEN** an owner or team lead tries to save a thirty-first active takeaway
- **THEN** the Journal reports the cap without creating another saved takeaway

#### Scenario: A guest opens a private Topic's Journal

- **WHEN** the caller lacks permission to read the Topic
- **THEN** the caller cannot get its takeaways or submit feedback

### Requirement: Carl uses takeaways as untrusted background

Scoring, Finding descriptions, Coffee Break scripts, and Topic Post Discussion scripts SHALL receive at most 20 active takeaways within a fixed token budget. Relevant chapter and post reads SHALL use vector similarity within feedback priority tiers.

#### Scenario: A rating note accompanies a prompt

- **WHEN** a prompt includes a takeaway with feedback
- **THEN** it includes the bounded notes from either thumb inside an untrusted fence
- **AND** a correction includes the original claim and the corrected wording
- **AND** changes to takeaways leave the review cache hash unchanged

#### Scenario: Dated material distinguishes plans from outcomes

- **WHEN** scoring, a takeaway update, or a script prompt reads dated evidence
- **THEN** the prompt supplies the current UTC date even when the Journal is empty
- **AND** the model compares event dates against that day without treating publication or Scan dates as event dates
- **AND** a past scheduled date alone does not establish that the event happened
