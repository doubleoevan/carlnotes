## ADDED Requirements

### Requirement: The title is saved before any audio is recorded

The outline call SHALL write the Podcast Episode's title and description, and both SHALL be saved on the Podcast Episode
before any chapter is written or recorded. The episode workflow SHALL then signal the Scan's email workflow that the
outline is settled. It SHALL send the same signal if the Scan records no Podcast Episode and if the plan or the outline
fails for good, so the Scan's email never waits on a recording. A signal that finds no email workflow SHALL be ignored.

#### Scenario: The title exists while the audio does not

- **WHEN** a Podcast Episode's outline has finished and its chapters are still recording
- **THEN** the Podcast Episode has its title and description, a status of `recording`, and no audio

#### Scenario: The email workflow is signaled as soon as the outline is settled

- **WHEN** a scheduled Scan's outline saves its title
- **THEN** the email workflow is told at once, before the first chapter is recorded

#### Scenario: Nothing to record is reported too

- **WHEN** a scheduled Scan's podcast episode workflow finds nothing to record
- **THEN** it tells the email workflow, and ends

### Requirement: Recordings run on their own task queue with a configured limit

Podcast Episode recordings SHALL run on their own Temporal task queue, `episode-recordings`, with their own Worker, the
way Scans and scan emails do. The limit on concurrent recording activities SHALL be read from
`PODCAST_RECORDING_CONCURRENCY`, the way `SCAN_CONCURRENCY` is read, with a default of 16 per worker replica. A burst
of recordings after the scheduled sweep SHALL wait in that queue, SHALL never take a scan slot, and SHALL stay within the
speech provider's rate limits.

#### Scenario: A recording burst never delays a Scan

- **GIVEN** fifty Podcast Episodes waiting to record after a sweep
- **WHEN** a Scan is started
- **THEN** the Scan's activities start as soon as a scan slot is free, regardless of the waiting recordings

#### Scenario: The limit is configured

- **WHEN** the worker starts with `PODCAST_RECORDING_CONCURRENCY` at 2
- **THEN** at most two recording activities run at once on that replica

#### Scenario: The default is sixteen

- **WHEN** the worker starts with `PODCAST_RECORDING_CONCURRENCY` unset
- **THEN** at most sixteen recording activities run at once on that replica

### Requirement: A Podcast Episode aims for its plan's length, with longer chapters if it has fewer Findings

A Podcast Episode SHALL aim to run close to its minute limit and never more, sharing the time by how much each Finding
has to say, so that fewer Findings get longer chapters that go deeper. The minute limit SHALL be 30 minutes, or 10
minutes on a Topic whose owner is on the free plan and is not an admin. The limit SHALL count the hosts' talk alone, and
the theme song's intro and outro SHALL play as they do on every Podcast Episode. A Podcast Episode SHALL never be
padded, and a chapter SHALL never be planned longer than its Finding can fill. Each Finding SHALL get one chapter
planned at one to eight minutes. Eight is about what one speech request holds with the cold open, a transition, or the
sign-off that is recorded with the chapter. Script length SHALL be estimated at 150 words a minute. The outline's prompt
SHALL be given the minute limit. The outline's planned lengths SHALL be goals for the written script, and a written
chapter or script that runs past its plan SHALL be kept, never rejected.

#### Scenario: An outline over 30 minutes is rejected before the last draft

- **GIVEN** a Topic whose owner is on a paid plan
- **WHEN** a first or second outline draft plans over 30 minutes
- **THEN** the draft is rejected and the call is retried

#### Scenario: A free Topic's outline over 10 minutes is rejected before the last draft

- **GIVEN** a Topic whose owner is on the free plan
- **WHEN** a first or second outline draft plans 14 minutes
- **THEN** the draft is rejected, and the retried call is told that 14 minutes is over the 10 allowed

#### Scenario: A free Topic's Podcast Episode keeps its theme music

- **GIVEN** a Topic whose owner is on the free plan
- **WHEN** its Podcast Episode records 10 minutes of talk
- **THEN** the hosts start at 40 seconds, and the outro plays to the song's end 40 seconds after the last word

#### Scenario: A chapter that runs long is kept

- **WHEN** a written chapter's estimated length is over its planned length
- **THEN** the chapter is kept, and the Podcast Episode records it

### Requirement: Podcast Episodes pause once monthly spend passes the plan's share of the budget

If the billed user's monthly spend is at or past their plan's share of their monthly budget when a Podcast Episode is
planned, the Podcast Episode SHALL NOT be recorded, and Podcast Episodes SHALL stay paused for that user until the next
month. The share SHALL be 50 percent on the free plan and 80 percent on a paid plan, so a free user's Scans keep half
of the budget. Scans SHALL keep running. The check SHALL read the same monthly spend sum that every other budget check
reads.

#### Scenario: Past 80 percent, the Scan runs and the Podcast Episode does not

- **GIVEN** a plus user whose spend this month is $12.50 of a $15 budget
- **WHEN** their Topic's scheduled Scan succeeds
- **THEN** the Scan is saved and emailed as usual, and no Podcast Episode is recorded

#### Scenario: Under 80 percent, the Podcast Episode is recorded

- **GIVEN** a plus user whose spend this month is $6 of a $15 budget
- **WHEN** their Topic's Scan succeeds
- **THEN** its Podcast Episode is recorded

#### Scenario: Past 50 percent on the free plan, the Scan runs and the Podcast Episode does not

- **GIVEN** a free user whose spend this month is $1.60 of a $3 budget
- **WHEN** their Topic's Scan succeeds
- **THEN** the Scan is saved as usual, and no Podcast Episode is recorded

#### Scenario: A new month resumes Podcast Episodes

- **GIVEN** a user whose Podcast Episodes paused because of the budget in September
- **WHEN** their first Scan of October succeeds
- **THEN** its Podcast Episode is recorded

### Requirement: The Topic's owner and an admin can remove a Podcast Episode, and its Findings may be narrated again

The Topic's owner and an admin SHALL be able to remove a published or failed Podcast Episode, and nobody else SHALL.
Removing a Podcast Episode SHALL delete its audio from object storage, its chapters, its script, and its listen state,
and SHALL keep the Podcast Episode's row with the status `removed`, its season, its number, and its cost. Its number
SHALL never be reused, and its cost SHALL still count in the billed user's monthly spend. A removed Podcast Episode
SHALL be in no feed and no episode list, SHALL have no public page, and its audio, chapters, and transcript urls SHALL
respond as missing. The Findings it narrated MAY be narrated by a later Podcast Episode. Whoever may remove a Podcast
Episode SHALL find the remove control on each row of the episodes card, on the Topic page's player card, and as Remove
episode in the Podcast Episode page's actions menu, and every one SHALL open the same confirmation.

#### Scenario: An owner removes a Podcast Episode

- **WHEN** a Topic's owner removes its published Podcast Episode
- **THEN** the audio object is deleted, the Podcast Episode is gone from the player, the episodes card, and every feed
  of the Topic, and its audio url responds as missing

#### Scenario: An admin removes a Podcast Episode

- **WHEN** an admin removes a Podcast Episode of another user's Topic
- **THEN** it is removed the same way

#### Scenario: A subscriber cannot remove a Podcast Episode

- **WHEN** a subscriber who does not own the Topic sends the removal
- **THEN** the api rejects it and the Podcast Episode stays

#### Scenario: A removed Podcast Episode's number is not reused

- **GIVEN** a Topic whose latest Podcast Episode this season is number 14
- **WHEN** the owner removes it and the next Podcast Episode publishes
- **THEN** the new Podcast Episode is number 15

#### Scenario: Whoever may remove finds the control on the player and the episode page

- **WHEN** an admin opens a Topic page and one of its Podcast Episode pages
- **THEN** the player card shows the remove button, the episode page's actions menu offers Remove episode, and a
  subscriber who does not own the Topic sees neither

#### Scenario: A removed Podcast Episode still counts in spend

- **WHEN** a Podcast Episode that cost $0.40 is removed
- **THEN** the billed user's monthly spend still includes the $0.40

### Requirement: A free Topic keeps only its latest short Podcast Episode

A Topic whose owner is on the free plan and is not an admin SHALL record a short Podcast Episode after every Scan that
succeeds with Findings to narrate, within the budget share above. Its row SHALL be marked short when the Podcast Episode
is planned. The Topic SHALL record one short Podcast Episode at a time: a Scan that succeeds while the Topic has a
recording short Podcast Episode SHALL record none and spend nothing, and its Findings SHALL wait for the next Podcast
Episode. Publishing a short Podcast Episode SHALL replace every other published short Podcast Episode of the Topic in
the same transaction, so the Topic never has two published short Podcast Episodes and never has none between them.
Full Podcast Episodes that the Topic published while its owner was on a paid plan SHALL never be replaced. A replaced
Podcast Episode SHALL be removed the way an owner removes one, with its audio, script, and listen state deleted and its
row kept as `removed` with its season, its number, and its cost, except that its chapters SHALL be kept so its Findings
still count as narrated. A failed Podcast Episode SHALL NOT be replaced.

#### Scenario: A new short Podcast Episode replaces the last one

- **GIVEN** a free Topic with a published short Podcast Episode number 3
- **WHEN** the Topic's next Scan succeeds and its Podcast Episode publishes as number 4
- **THEN** number 3 is gone from the player, the episodes card, and every feed, its audio url responds as missing, and
  number 4 is the Topic's only published Podcast Episode

#### Scenario: A brew during a short recording gets no Podcast Episode

- **GIVEN** a free Topic whose short Podcast Episode is still recording
- **WHEN** another Scan of the Topic succeeds with new Findings
- **THEN** that Scan records no Podcast Episode and spends nothing on one, and its new Findings are not narrated yet

#### Scenario: A replaced Podcast Episode's cost still counts

- **WHEN** a short Podcast Episode that cost $0.19 is replaced
- **THEN** the billed user's monthly spend still includes the $0.19

#### Scenario: A paid Topic keeps every Podcast Episode

- **GIVEN** a Topic whose owner is on a paid plan, with three published Podcast Episodes
- **WHEN** its next Podcast Episode publishes
- **THEN** all four stay published

#### Scenario: An owner who moves to the free plan keeps their full Podcast Episodes

- **GIVEN** a Topic with ten published full Podcast Episodes whose owner moved from plus to free
- **WHEN** the Topic's first short Podcast Episode publishes, and then its second
- **THEN** the ten full Podcast Episodes stay published, and the second short Podcast Episode replaces the first

#### Scenario: An owner who upgrades keeps their last short Podcast Episode

- **GIVEN** a free Topic with a published short Podcast Episode whose owner moved to plus
- **WHEN** the Topic's next Podcast Episode publishes as a full one
- **THEN** both stay published

## MODIFIED Requirements

### Requirement: The script is schema-checked and rejected past its limits

The writer's output SHALL be validated against a schema before anything is recorded. It SHALL have a title of at most 60
characters, specific to what the chapters cover, in the host's voice and never clickbait. It SHALL have a description of
at most 155 characters that starts with "Carl and Vienna talk about", a short cold open that names the show and its
hosts in a sentence or two before it turns to the topic, segments joined by short transitions, one chapter per Finding
that includes the Finding's id, and a sign-off and a goodbye. A prompt SHALL list its Findings under short numbers from
1 and SHALL never show a Finding's stored id, and a chapter's number SHALL be mapped back to the Finding's stored id
before the output is checked. The cold open, each transition, each chapter, the sign-off, and the goodbye SHALL each be
a list of turns, and a turn SHALL be a speaker, text, and an optional short style. The text SHALL read as natural
speech, with fillers like "well", short replies like "Right.", and inline vocal tags in the syntax that Gemini's speech
prompting guide defines.

A first or second draft SHALL be rejected, and the call retried, if a chapter cites a Finding id outside the input set
or writes a Finding twice, a segment does not have one chapter for each of its Findings, the outline plans more than the
Podcast Episode's minute limit, the title or the description is over its limit, a chapter has more than three quotations
or a quotation over 30 words, or the first segment has no cold open or the last no sign-off or no goodbye. Only a quoted
span of six words or more SHALL count as a quotation. A retried call SHALL be told why its last draft was rejected, with
the numbers that the check measured, so the next draft can fix it. A call's third draft SHALL be repaired instead of
rejected: a long title or description SHALL be cut at a word boundary, a chapter for a Finding outside the input set, a
second chapter for one Finding, and a chapter that quotes too much SHALL be left out, and a missing chapter, cold open,
sign-off, or goodbye and a plan over its minute limit SHALL be accepted. Every draft SHALL have a chapter title over 80
characters cut and a planned chapter length outside one to eight minutes brought within it, with no rejection. Only a
draft that does not match the schema on every try, a script with no chapter left, a script call that finds the budget
spent, speech that records no chapter, or a failure of the encoder, the database, or object storage SHALL fail the
Podcast Episode. A chapter whose speech fails for good, a spent budget included, SHALL be left out, and the Podcast
Episode SHALL fail only if no chapter is recorded.

#### Scenario: An unknown Finding id is rejected

- **WHEN** a segment's first draft has a chapter citing an id that was not in its input
- **THEN** the draft is rejected and the call is retried

#### Scenario: A third draft is repaired instead of failing the Podcast Episode

- **GIVEN** a segment's third draft with one chapter for a Finding in its input
- **WHEN** the draft also has a chapter citing an id that was not in its input, and has no sign-off
- **THEN** that chapter is left out, the segment keeps its valid chapter and no sign-off, and the episode is recorded

#### Scenario: A chapter cites its Finding by the prompt's number

- **GIVEN** a segment's prompt that lists three Findings as 1, 2, and 3
- **WHEN** the output's second chapter cites 2
- **THEN** that chapter is saved with the stored id of the second Finding listed

#### Scenario: A long chapter is not rejected

- **WHEN** a chapter's text is over 450 words
- **THEN** the output is not rejected for its length

#### Scenario: A retried call is told what to fix

- **WHEN** a segment's draft is rejected for a chapter with four quotations
- **THEN** the next call's prompt names that chapter and the limit of three quotations

#### Scenario: A fourth quote is rejected

- **WHEN** a chapter's text has four passages in quotation marks
- **THEN** the output is rejected and the call is retried

#### Scenario: A chapter that keeps quoting too much is left out

- **GIVEN** a segment of three chapters whose third draft has one chapter with four quotations
- **WHEN** that draft is checked
- **THEN** the segment is kept with its other two chapters, the Podcast Episode is recorded without the third, and the
  dropped chapter is reported

#### Scenario: A script that keeps failing fails the Podcast Episode

- **WHEN** a script call's output is rejected three times
- **THEN** the Podcast Episode is saved as failed with the reason, and nothing is recorded

#### Scenario: A long title is rejected

- **WHEN** the outline's title is over 60 characters
- **THEN** the output is rejected and the call is retried


### Requirement: A Podcast Episode picks its Findings by score, with a bonus for a like, a bookmark, and a url Source's page

A Podcast Episode SHALL pick up to fifteen Findings by score with their bonuses, or up to five on a Topic whose owner is
on the free plan and is not an admin, from the triggering Scan's new Findings and the Topic's other Findings that a user
rated thumbs up or bookmarked, or whose page is one of the Topic's url Sources, narrated or not. A Finding SHALL get a
score bonus of 0.2 for a bookmark, 0.2 for a thumbs up, and 0.2 if its page matches one of the Topic's url Sources by
canonical url. The bonuses SHALL add up, and the score SHALL stay at 1 or below. On a tie a new Finding SHALL be picked
first. The picked Findings SHALL be narrated with the Scan's new Findings first, then the others, each in relevance
score order without the bonuses. Any place left SHALL go to the Topic's other Findings that no Podcast Episode of the
Topic has narrated, in score order, then to the Topic's other narrated Findings, in score order. A Finding SHALL count
as narrated by its Resource, so a Finding that was filtered out and found again later counts as narrated. The Findings
of a Podcast Episode that its owner or an admin removed SHALL count as not narrated, and the Findings of a Podcast
Episode that a free Topic's later Podcast Episode replaced SHALL count as narrated. A Finding that a user rated thumbs
down SHALL never be narrated. If every one of the Topic's Findings that may be narrated counts as narrated, no Podcast
Episode SHALL be made and nothing SHALL be spent.


#### Scenario: A Finding with a bonus takes a new Finding's place, and a bonus that only ties does not

- **GIVEN** a Scan with fifteen new Findings scored 0.5, a bookmarked Finding scored 0.3, and a liked Finding scored 0.2
  whose page is one of the Topic's url Sources
- **WHEN** its Podcast Episode is planned
- **THEN** the liked Finding on the url Source's page, at 0.6 with its bonuses, is picked in place of the fifteenth new
  Finding, and the bookmarked Finding, at a tie of 0.5 with its bonus, is left out

#### Scenario: A Finding rated down is never narrated, and liked and bookmarked ones follow the new ones

- **GIVEN** a Topic with a new Finding rated thumbs down, a new unrated Finding, an older Finding never narrated, and
  three narrated Findings, the best-scored one unrated, one rated thumbs up, and one bookmarked
- **WHEN** its Podcast Episode is planned
- **THEN** the Finding rated down is left out, and the order is the new unrated Finding, the liked and the bookmarked
  narrated Findings, the older Finding, and the unrated narrated Finding

#### Scenario: New Findings come first

- **GIVEN** a Scan that kept four new Findings on a Topic with ten Findings never narrated
- **WHEN** its Podcast Episode is planned
- **THEN** the four new Findings come first in score order, followed by the ten in score order

#### Scenario: Narrated Findings fill out a thin Scan's Podcast Episode

- **GIVEN** a Scan with two new Findings on a Topic whose five other Findings were all narrated
- **WHEN** its Podcast Episode is planned
- **THEN** the two new Findings come first, followed by the five narrated ones in score order

#### Scenario: Nothing to say, no Podcast Episode

- **GIVEN** a Scan with no new Findings on a Topic whose Findings were all narrated
- **WHEN** the podcast episode workflow runs
- **THEN** no Podcast Episode row is written and no model is called

#### Scenario: A Finding found again counts as narrated

- **GIVEN** an unrated, unbookmarked Finding that a Podcast Episode narrated, was filtered out, and was found again by a
  later Scan
- **WHEN** the later Scan's Podcast Episode is planned
- **THEN** that Finding comes after every Finding that no Podcast Episode narrated


#### Scenario: A free Topic's Podcast Episode picks five

- **GIVEN** a Topic whose owner is on the free plan and a Scan with eight new Findings
- **WHEN** its Podcast Episode is planned
- **THEN** the five best-scored new Findings are picked, and the other three wait for a later Podcast Episode

#### Scenario: A replaced Podcast Episode's Findings stay narrated

- **GIVEN** a free Topic whose later Podcast Episode replaced the one that narrated a Finding
- **WHEN** the Topic's next Podcast Episode is planned
- **THEN** that Finding comes after every Finding that no Podcast Episode narrated

## REMOVED Requirements

### Requirement: A Podcast Episode aims for 30 minutes, with longer chapters if it has fewer Findings

**Reason**: A free Topic's Podcast Episode now aims for 10 minutes, so the limit depends on the plan.

**Migration**: See "A Podcast Episode aims for its plan's length, with longer chapters if it has fewer Findings".

### Requirement: Podcast Episodes pause once monthly spend passes 80 percent of the budget

**Reason**: The free plan pauses Podcast Episodes at 50 percent, so the share depends on the plan.

**Migration**: See "Podcast Episodes pause once monthly spend passes the plan's share of the budget".

### Requirement: The Topic's owner and an admin can remove a Podcast Episode

**Reason**: A free Topic no longer has one Podcast Episode per Topic, so a removed Podcast Episode frees nothing.

**Migration**: See "The Topic's owner and an admin can remove a Podcast Episode, and its Findings may be narrated
again" and "A free Topic keeps only its latest short Podcast Episode".

### Requirement: The title is saved before any audio renders

**Reason**: A Podcast Episode in progress is now recording, the status `recording`, matching what the player says.

**Migration**: See "The title is saved before any audio is recorded".

### Requirement: Renders run on their own task queue with a configured limit

**Reason**: Recordings run on the `episode-recordings` queue, and `PODCAST_RENDER_CONCURRENCY` is now
`PODCAST_RECORDING_CONCURRENCY`.

**Migration**: See "Recordings run on their own task queue with a configured limit". The setting is unset in every
environment, so no configuration changes.
