## REMOVED Requirements

### Requirement: The first discussion records once the edit time ends

**Reason**: A published Topic Post no longer has an edit time. The requirement added below keeps the 15 minute wait
before the first recording.

**Migration**: None. The publish workflow waits the same 15 minutes, so a workflow already waiting replays unchanged.

## MODIFIED Requirements

### Requirement: Each recording bills the person who started it

A first discussion's script and speech SHALL bill the user who published the Topic Post, and a regenerated one the user
who pressed Regenerate, on that user's own model key, counted in their monthly spend with Podcast Episode cost. A spent
budget or a passed podcast budget cutoff SHALL record nothing and SHALL leave the Topic Post published.

#### Scenario: A team member's Regenerate bills the member

- **WHEN** a team member regenerates the discussion of a Topic Post the Topic's owner published
- **THEN** the recording's cost counts in the member's monthly spend and not in the owner's

#### Scenario: A spent budget leaves the post published

- **WHEN** a publisher's budget is spent when the 15 minute wait after the publish ends
- **THEN** no discussion is recorded, the Topic Post stays published, and its page shows no player

## ADDED Requirements

### Requirement: The first discussion records 15 minutes after the publish

Publishing a Topic Post SHALL start its first discussion 15 minutes after the publish, from the text as it then
stands. A post deleted before that, or one already recording from a Regenerate, SHALL record nothing then. A later edit
SHALL leave the recording as it is. The wait SHALL show no discussion, and a recording on its way its recording state.

#### Scenario: The wait shows no recording state

- **WHEN** a reader and the author each open a Topic Post five minutes after it was published
- **THEN** the reader sees no discussion card, and the author sees the card with "Not recorded yet." and Regenerate

#### Scenario: A Regenerate during the wait is the only recording

- **WHEN** an editor presses Regenerate five minutes after a publish, and the wait then ends
- **THEN** the editor's recording is made, and the publish starts no second one

#### Scenario: An edit during the wait reaches the recording

- **WHEN** an author publishes, corrects a paragraph five minutes later, and the wait ends
- **THEN** the discussion is written from the corrected text, and only one recording is made

#### Scenario: An edit after the recording keeps it

- **WHEN** an author corrects a paragraph a day after the first recording
- **THEN** the recording stays as it is until an editor presses Regenerate

#### Scenario: A deleted post records nothing

- **WHEN** an author deletes a Topic Post eight minutes after publishing
- **THEN** no discussion is recorded and nothing is billed for one
