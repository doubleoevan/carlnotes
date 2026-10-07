# podcast-episode-rendering Specification

## Purpose
TBD - created by archiving change coffee-break-podcast. Update Purpose after archive.
## Requirements
### Requirement: Podcast Episodes are off if the speech model is set empty

`PODCAST_SPEECH_MODEL` SHALL default to `gemini-3.8-flash-tts`. If it is set empty, the app SHALL render no Podcast
Episode, the api SHALL return no episode data, and the ui SHALL show no player, episodes card, podcast switch, or
Subscribe button, so a self-hosted instance runs without a Google key. Otherwise Podcast Episodes SHALL be on for every
user, with no feature flag for admins first. A Topic's podcast SHALL be on by default, and a user who may edit the
Topic SHALL be able to turn it off and on for that Topic.

#### Scenario: A self-hosted instance has no podcast episode UI

- **WHEN** a user opens a topic page on an instance with the speech model set empty
- **THEN** the page shows no player, no episodes card, and no podcast switch, and its Scans render no Podcast Episode

#### Scenario: An instance with no setting renders with the default model

- **GIVEN** an instance with `PODCAST_SPEECH_MODEL` unset
- **WHEN** a Scan succeeds with Findings to narrate
- **THEN** its Podcast Episode renders with `gemini-3.8-flash-tts`

#### Scenario: An owner turns a Topic's podcast off

- **GIVEN** an instance with a speech model configured
- **WHEN** an owner turns their Topic's podcast switch off and the Topic's next Scan succeeds
- **THEN** no Podcast Episode is rendered for it, and the Topic's published Podcast Episodes stay playable

#### Scenario: A user who may not edit the Topic cannot change the switch

- **WHEN** a subscriber who may not edit the Topic sends a change to its podcast setting
- **THEN** the api rejects it

### Requirement: A Podcast Episode aims for 30 minutes, with longer chapters if it has fewer Findings

A Podcast Episode SHALL aim to run close to 30 minutes and never more, sharing the time by how much each Finding has to
say, so that fewer Findings get longer chapters that go deeper. It SHALL never be padded, and a chapter SHALL never be
planned longer than its Finding can fill. Each Finding SHALL get one chapter planned at one to eight minutes. Eight is
about what one speech request holds with the cold open, a transition, or the sign-off that renders with the chapter.
Script length SHALL be estimated at 150 words a minute. The outline's planned lengths SHALL be goals for the
written script, and a written chapter or script that runs past its plan SHALL be kept, never rejected.

#### Scenario: An outline over 30 minutes is rejected before the last draft

- **WHEN** a first or second outline draft plans over 30 minutes
- **THEN** the draft is rejected and the call is retried

#### Scenario: A chapter that runs long is kept

- **WHEN** a written chapter's estimated length is over its planned length
- **THEN** the chapter is kept, and the Podcast Episode renders it

### Requirement: The script is written from each Finding's summary, relevance, and stored content

A script writer on `score-model`, through LiteLLM on the billed user's virtual key, SHALL write the Podcast Episode from
the picked Findings and the Topic's name and prompt. It SHALL never be given context derived from the Topic's
attachments. An attachment stays its owner's alone, and a Podcast Episode reaches every subscriber and, on a public
Topic, the open web through its feed and its transcript. For each Finding it SHALL be given the title, the summary, the
relevance explanation, and the Finding's stored Resource content. Each chapter SHALL be built on the summary and the
relevance explanation, and the stored content SHALL supply the specifics, such as names, numbers, and quotes. The
content SHALL be read from storage the way the chat's retrieval reads it, and nothing SHALL be fetched from the web at
render time. Each Finding's content SHALL be limited to about 1,500 words. The writer SHALL paraphrase what a source
says. It MAY quote a source directly at most three times per Finding, each in one short sentence, and SHALL name the
source if it does. Its prompts SHALL live as markdown under `worker/prompts/`, and every untrusted value, the stored
content included, SHALL reach the model inside the per-call nonce delimiters. The writer SHALL work from one outline. A
first call groups the Findings into a few themed segments, orders them, and gives each chapter a length, and then one
call per segment writes that segment's turns against the outline.

Both hosts SHALL be described in one prompt fragment, `podcast-episode-hosts.md`, that both prompt templates splice. The
fragment SHALL tell them that they host Coffee Break, the carlnotes.com podcast, and that they may name the show or the
site now and then, never as a pitch. It SHALL give them Carl's backstory from the homepage hero, which may color a line
or a joke now and then while each episode stays on the topic. The hosts SHALL call the person each episode is for
the topic follower, never the reader:

- **Carl**, the host: confident, specific, a little too informed, never smug or salesy, delighted you asked. Short
  declaratives, rhythm over adjectives. He reports findings like a friend who can't help himself, not a dashboard. He
  never guilt-trips, never says "you missed", and never asks you to come back.
- **Vienna**, Carl's co-host: very curious, warm, quick, and easy to delight. She asks what
  the listener would and always wants the next detail. She wants things clear, and asks Carl to say a vague point
  plainly. She is opinionated but not negative, and she can disagree with Carl and say why. She is not a skeptic: she
  takes a finding in good faith and never waves one off. Short questions, real follow-ups, and she won't let a chapter
  end until it lands on why it matters.

Every chapter SHALL therefore end on its Finding's relevance explanation. Now and then one host SHALL call the other by
name, once or twice in a segment at most. The writer's sign-off SHALL close on what the episode added up to. Every
Podcast Episode SHALL then have Carl say he has more reading to do and Vienna say he always does, two lines added after
the sign-off with each given to its host, and SHALL end on a short goodbye that the writer adds after them in the hosts'
own words, unscripted and different every episode. The writer SHALL never write the two fixed lines itself. The hosts' names SHALL appear in copy only: the prompts, the UI,
the feeds, and the transcript. They SHALL never appear in the schema or in identifiers.

#### Scenario: The writer gets the stored content

- **WHEN** the script prompts are built for a Podcast Episode
- **THEN** their inputs include each Finding's title, summary, relevance explanation, and stored content, and the
  Topic's name and prompt

#### Scenario: Attachment context never reaches the writer

- **GIVEN** a Topic whose owner uploaded an attachment that Scans read as context
- **WHEN** the script prompts are built for one of its Podcast Episodes
- **THEN** no text from the attachment or from its distilled context is in either prompt

#### Scenario: Nothing is fetched at render time

- **WHEN** a Podcast Episode's script is written
- **THEN** each Finding's content comes from storage, and no request is made to the Finding's source

#### Scenario: Long content is limited

- **WHEN** a Finding's stored content runs to 6,000 words
- **THEN** about its first 1,500 words reach the prompt

#### Scenario: A Finding with no stored content still gets a chapter

- **WHEN** a Finding's Resource has no stored content
- **THEN** its chapter is written from its summary, which is the Resource's snippet, and its relevance explanation

#### Scenario: A source is paraphrased, with three short quotes at most

- **WHEN** a chapter is written for a Finding whose stored content has several quotable passages
- **THEN** the chapter says what the source says in the hosts' own words, quotes at most three sentences of it, and
  names the source of each

#### Scenario: Untrusted values are fenced

- **WHEN** a script prompt is built
- **THEN** every Finding's text, its stored content included, and the Topic's name and prompt sit inside that call's
  nonce delimiters, and the task is restated after them

#### Scenario: One outline, then one call per segment

- **WHEN** a Podcast Episode with three segments is written
- **THEN** one outline call is made, then three segment calls, each given the outline

#### Scenario: A chapter ends on why the Finding matters

- **WHEN** a chapter is written for a Finding
- **THEN** its last turns state the Finding's relevance to the topic follower

#### Scenario: Both hosts are described in the prompts

- **WHEN** the script prompt templates are read
- **THEN** each splices the prompt fragment that describes Carl and Vienna in full, and neither refers to a page outside
  the repo

#### Scenario: The Podcast Episode ends on the hosts' goodbye

- **WHEN** a Podcast Episode's script is built from its segments
- **THEN** it ends on the last segment's sign-off, then Carl's and Vienna's two fixed lines, each said by its own host,
  then the last segment's own goodbye

### Requirement: The title is saved before any audio renders

The outline call SHALL write the Podcast Episode's title and description, and both SHALL be saved on the Podcast Episode
before any chapter is written or rendered. The episode workflow SHALL then signal the Scan's email workflow that the
outline is settled. It SHALL send the same signal if the Scan renders no Podcast Episode and if the plan or the outline
fails for good, so the Scan's email never waits on a render. A signal that finds no email workflow SHALL be ignored.

#### Scenario: The title exists while the audio does not

- **WHEN** a Podcast Episode's outline has finished and its chapters are still rendering
- **THEN** the Podcast Episode has its title and description, a status of `rendering`, and no audio

#### Scenario: The email workflow is signaled as soon as the outline is settled

- **WHEN** a scheduled Scan's outline saves its title
- **THEN** the email workflow is told at once, before the first chapter renders

#### Scenario: Nothing to render is reported too

- **WHEN** a scheduled Scan's podcast episode workflow finds nothing to render
- **THEN** it tells the email workflow, and ends

### Requirement: The script is schema-checked and rejected past its limits

The writer's output SHALL be validated against a schema before anything is rendered. It SHALL have a title of at most 60
characters, specific to what the chapters cover, in the host's voice and never clickbait. It SHALL have a description of
at most 155 characters that starts with "Carl and Vienna talk about", a short cold open that names the show and its hosts in a sentence or two before it turns to
the topic, segments joined by short transitions, one chapter per Finding that includes the Finding's id, and a
sign-off and a goodbye. A prompt SHALL list its Findings under short numbers from 1 and SHALL never show a
Finding's stored id, and a chapter's number SHALL be mapped back to the Finding's stored id before the output is
checked. The cold open, each transition, each chapter, the sign-off, and the goodbye SHALL each be a list of turns, and a turn SHALL
be a speaker, text, and an optional short style. The text SHALL read as natural speech, with fillers like "well", short
replies like "Right.", and inline vocal tags in the syntax that Gemini's speech prompting guide defines.

A first or second draft SHALL be rejected, and the call retried, if a chapter cites a Finding id outside the input set
or writes a Finding twice, a segment does not have one chapter for each of its Findings, the outline plans more than 30
minutes, the title or the description is over its limit, a chapter has more than three quotations or a quotation over 30
words, or the first segment has no cold open or the last no sign-off or no goodbye. Only a quoted span of six words or more SHALL
count as a quotation. A retried call SHALL be told why its last draft was rejected, with the numbers that the check
measured, so the next draft can fix it. A call's third draft SHALL be repaired instead of rejected: a long title or
description SHALL be cut at a word boundary, a chapter for a Finding outside the input set, a second chapter for one
Finding, and a chapter that quotes too much SHALL be left out, and a missing chapter, cold open, sign-off, or goodbye and a
plan over 30 minutes SHALL be accepted. Every draft SHALL have a chapter title over 80 characters cut and a planned chapter
length outside one to eight minutes brought within it, with no rejection. Only a draft that does not match the schema on
every try, a script with no chapter left, a script call that finds the budget spent, speech that renders no chapter, or
a failure of the encoder, the database, or object storage SHALL fail the Podcast Episode. A chapter whose speech fails
for good, a spent budget included, SHALL be left out, and the Podcast Episode SHALL fail only if no chapter renders.

#### Scenario: An unknown Finding id is rejected

- **WHEN** a segment's first draft has a chapter citing an id that was not in its input
- **THEN** the draft is rejected and the call is retried

#### Scenario: A third draft is repaired instead of failing the Podcast Episode

- **GIVEN** a segment's third draft with one chapter for a Finding in its input
- **WHEN** the draft also has a chapter citing an id that was not in its input, and has no sign-off
- **THEN** that chapter is left out, the segment keeps its valid chapter and no sign-off, and the episode renders

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
- **THEN** the segment is kept with its other two chapters, the Podcast Episode renders without the third, and the
  dropped chapter is reported

#### Scenario: A script that keeps failing fails the Podcast Episode

- **WHEN** a script call's output is rejected three times
- **THEN** the Podcast Episode is saved as failed with the reason, and nothing is rendered

#### Scenario: A long title is rejected

- **WHEN** the outline's title is over 60 characters
- **THEN** the output is rejected and the call is retried

### Requirement: Each chapter renders as one two-speaker request with its own retries

Each chapter SHALL render as one two-speaker speech request. The cold open SHALL be rendered with the first chapter,
each transition with the chapter it leads into, and the sign-off with the last chapter, so the chapters' times cover the
whole Podcast Episode. A scheduled Scan's chapters SHALL use the Flex tier and any other Scan's the standard tier.
Chapters SHALL render in parallel, each with its own retries.

No audio SHALL travel in a workflow payload. The activity that renders a chapter SHALL write its audio to a temporary
prefix in object storage and SHALL return only the chapter's position, the object's key and byte size, and how many
attempts the render took. No activity SHALL rely on a local file that another activity wrote, since the worker runs as
several replicas.

A rate-limited or overloaded speech call SHALL be retried with backoff. A scheduled Podcast Episode MAY wait hours for
Flex capacity and SHALL NOT move to the standard tier. Any other rejection SHALL NOT be retried. A chapter whose speech
is rejected or runs out of attempts SHALL be left out, together with the turns that render with it, and the Podcast
Episode SHALL publish the chapters that rendered, with its saved script and transcript matching them. A Podcast Episode
with no chapter rendered SHALL fail, and a failed Podcast Episode SHALL publish nothing.

#### Scenario: Chapters render in parallel

- **WHEN** a Podcast Episode with eight chapters renders
- **THEN** its chapters are requested concurrently, within the render queue's limit

#### Scenario: A chapter's audio stays out of the workflow

- **WHEN** a chapter finishes rendering
- **THEN** its audio is an object under the Podcast Episode's temporary prefix, and the activity's result holds the
  object's key and size and no audio

#### Scenario: The join runs on another replica

- **GIVEN** chapters rendered by one worker replica
- **WHEN** another replica runs the join
- **THEN** it reads every chapter from object storage and the Podcast Episode encodes

#### Scenario: A rate-limited chapter retries alone

- **WHEN** one chapter's request gets a 429
- **THEN** that chapter is retried after a backoff, and the chapters that already rendered are not requested again

#### Scenario: A Flex render waits instead of switching tiers

- **GIVEN** a scheduled Scan's chapter that keeps getting 503 from the Flex tier
- **WHEN** it is retried
- **THEN** each retry still selects the Flex tier

#### Scenario: A rejected chapter is left out

- **WHEN** one chapter's request is rejected with a 400 and the other chapters render
- **THEN** it is not retried, and the Podcast Episode publishes without that chapter or the turns that render with it

#### Scenario: A Podcast Episode with no chapter rendered fails

- **WHEN** every chapter's request is rejected
- **THEN** the Podcast Episode is saved as failed with the reason, and no audio is published

### Requirement: ffmpeg joins the chapters on temp files into one normalized MP3

The chapters' audio SHALL be joined by ffmpeg working on temp files, never held in memory. The joined audio SHALL be
normalized to podcast loudness and encoded as MP3 at 64 kbps mono, about 14 MB for 30 minutes. The file SHALL be stored
in object storage through the existing S3 path, with its byte size and duration recorded on the Podcast Episode. Each
chapter's start and end times SHALL come from the rendered chapters' durations. The temp files SHALL be deleted once
the Podcast Episode's file is stored. The per-chapter audio SHALL stay for a retried join until the Podcast Episode
publishes, and SHALL be deleted then, and a failed Podcast Episode's per-chapter audio SHALL be deleted when it fails.

#### Scenario: Chapter times follow the rendered audio

- **GIVEN** chapters that rendered at 155, 143, and 142 seconds
- **WHEN** the Podcast Episode is encoded
- **THEN** the chapters start at 0, 155, and 298 seconds, and the Podcast Episode's duration is 440 seconds

#### Scenario: The file is a 64 kbps mono MP3

- **WHEN** a Podcast Episode is encoded
- **THEN** its stored file is an MP3 at 64 kbps with one channel

#### Scenario: Nothing is left behind

- **WHEN** a Podcast Episode publishes
- **THEN** its temp files and its per-chapter audio objects are deleted

#### Scenario: A failed Podcast Episode leaves no audio

- **WHEN** a Podcast Episode fails after three of its chapters rendered
- **THEN** the three chapter objects are deleted

### Requirement: A season is the publish year, and numbers are assigned only on publish

A Podcast Episode's season SHALL be the UTC calendar year it publishes in. Its episode number SHALL start at 1 each
season and SHALL be assigned only when the Podcast Episode publishes, so a failed or skipped render leaves no gap. A
Topic's season and number SHALL be unique together, and two Podcast Episodes publishing at once SHALL get different
numbers.

#### Scenario: A failed render leaves no gap

- **GIVEN** a Topic whose latest published Podcast Episode is number 13 this season
- **WHEN** one render fails and the next publishes
- **THEN** the published Podcast Episode is number 14

#### Scenario: A new year starts at 1

- **GIVEN** a Topic whose last Podcast Episode of 2026 was number 40
- **WHEN** its first Podcast Episode of 2027 publishes
- **THEN** it is season 2027, number 1

#### Scenario: The year is UTC

- **WHEN** a Podcast Episode publishes at 23:30 UTC on December 31, 2026
- **THEN** its season is 2026

### Requirement: A Podcast Episode bills the user that its Scan billed

A Podcast Episode's script calls and speech calls SHALL be made on the virtual key of the user that its Scan billed: the
Topic's owner for a scheduled or first Scan, and the acting user for a manual one. The Podcast Episode's cost SHALL be
recorded on the Podcast Episode and SHALL count in that user's monthly spend. One Podcast Episode SHALL serve every
subscriber of the Topic.

#### Scenario: A scheduled Podcast Episode bills the owner

- **WHEN** a scheduled Scan's Podcast Episode renders
- **THEN** its calls use the Topic owner's virtual key and its cost counts in the owner's monthly spend

#### Scenario: A manual Scan's Podcast Episode bills whoever ran it

- **GIVEN** an admin who runs a manual Scan on another user's Topic
- **WHEN** its Podcast Episode renders
- **THEN** its calls use the admin's virtual key

### Requirement: Podcast Episodes pause once monthly spend passes 80 percent of the budget

If the billed user's monthly spend is at or past 80 percent of their monthly budget when a Podcast Episode is planned,
the Podcast Episode SHALL NOT render, and Podcast Episodes SHALL stay paused for that user until the next month. Scans
SHALL keep running. The check SHALL read the same monthly spend sum that every other budget check reads.

#### Scenario: Past 80 percent, the Scan runs and the Podcast Episode does not

- **GIVEN** a plus user whose spend this month is $12.50 of a $15 budget
- **WHEN** their Topic's scheduled Scan succeeds
- **THEN** the Scan is saved and emailed as usual, and no Podcast Episode is rendered

#### Scenario: Under 80 percent, the Podcast Episode renders

- **GIVEN** a plus user whose spend this month is $6 of a $15 budget
- **WHEN** their Topic's Scan succeeds
- **THEN** its Podcast Episode renders

#### Scenario: A new month resumes Podcast Episodes

- **GIVEN** a user whose Podcast Episodes paused because of the budget in September
- **WHEN** their first Scan of October succeeds
- **THEN** its Podcast Episode renders

### Requirement: Renders run on their own task queue with a configured limit

Podcast Episode renders SHALL run on their own Temporal task queue with their own Worker, the way Scans and scan emails
do. The limit on concurrent render activities SHALL be read from `PODCAST_RENDER_CONCURRENCY`, the way
`SCAN_CONCURRENCY` is read, with a default of 16 per worker replica. A burst of renders after the scheduled sweep SHALL
wait in that queue, SHALL never take a scan slot, and SHALL stay within the speech provider's rate limits.

#### Scenario: A render burst never delays a Scan

- **GIVEN** fifty Podcast Episodes waiting to render after a sweep
- **WHEN** a Scan is started
- **THEN** the Scan's activities start as soon as a scan slot is free, regardless of the waiting renders

#### Scenario: The limit is configured

- **WHEN** the worker starts with `PODCAST_RENDER_CONCURRENCY` at 2
- **THEN** at most two render activities run at once on that replica

#### Scenario: The default is sixteen

- **WHEN** the worker starts with `PODCAST_RENDER_CONCURRENCY` unset
- **THEN** at most sixteen render activities run at once on that replica

### Requirement: The Topic's owner and an admin can remove a Podcast Episode

The Topic's owner and an admin SHALL be able to remove a published or failed Podcast Episode, and nobody else SHALL.
Removing a Podcast Episode SHALL delete its audio from object storage, its chapters, its script, and its listen state,
and SHALL keep the Podcast Episode's row with the status `removed`, its season, its number, and its cost. Its number
SHALL never be reused, and its cost SHALL still count in the billed user's monthly spend. A removed Podcast Episode
SHALL be in no feed and no episode list, SHALL have no public page, and its audio, chapters, and transcript urls SHALL
respond as missing. The Findings it narrated MAY be narrated by a later Podcast Episode. A removed Podcast Episode
SHALL NOT count toward the free plan's one Podcast Episode per Topic, so the Topic's next Scan may render a new one.
Whoever may remove a Podcast Episode SHALL find the remove control on each row of the episodes card, on the Topic
page's player card, and as Remove episode in the Podcast Episode page's actions menu, and every one SHALL open the same
confirmation.

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

#### Scenario: A removed Podcast Episode frees the free plan's one

- **GIVEN** a Topic on the free plan whose one Podcast Episode was removed
- **WHEN** its next Scan succeeds with Findings left to narrate
- **THEN** the Scan renders a new Podcast Episode

#### Scenario: Whoever may remove finds the control on the player and the episode page

- **WHEN** an admin opens a Topic page and one of its Podcast Episode pages
- **THEN** the player card shows the remove button, the episode page's actions menu offers Remove episode, and a
  subscriber who does not own the Topic sees neither

#### Scenario: A removed Podcast Episode still counts in spend

- **WHEN** a Podcast Episode that cost $0.40 is removed
- **THEN** the billed user's monthly spend still includes the $0.40

### Requirement: Deleting a Topic deletes its Podcast Episodes' audio

Deleting a Topic SHALL delete every one of its Podcast Episodes' audio objects from object storage and SHALL clear the
Topic on its Podcast Episode rows. A deleted Topic's audio, feed, chapters, and transcript urls SHALL respond as
missing.

#### Scenario: A deleted Topic's audio is gone

- **WHEN** an owner deletes a Topic with three published Podcast Episodes
- **THEN** the three audio objects are deleted, and a request for any of their audio urls responds as missing

### Requirement: A draft names each chapter's Finding in an integer field

The outline call's and the segment calls' schemas SHALL have each chapter name its Finding by the number its prompt
listed it under, in an integer field, so a draft cannot put other text where the number goes. A segment's prompt SHALL
say that its list starts at 1 in every segment, whatever a Finding's place in the whole episode. A number the prompt did
not list SHALL be kept as the draft wrote it and checked as a Finding outside the input set.

#### Scenario: A draft cannot cite a Finding with text

- **WHEN** the outline call writes its chapters
- **THEN** each chapter's Finding is an integer, mapped back to the Finding's stored id before the outline is checked

#### Scenario: A number the prompt did not list is rejected

- **GIVEN** a segment whose prompt lists two Findings as 1 and 2
- **WHEN** a first draft's chapter names 3
- **THEN** the draft is rejected as citing a Finding outside its input, and the call is retried

### Requirement: A sign-off or a goodbye never repeats the goodbye's fixed lines

The goodbye's fixed lines SHALL be Carl's "Well, I've got more reading to do." and Vienna's "You always do.", held once in
the code, and the segment prompt SHALL quote them from there. A segment check SHALL reject a last segment whose sign-off
or goodbye has a turn that repeats one of those lines, ignoring case, end punctuation, and a leading "well", and the call
SHALL be retried with that reason. The last draft's repair SHALL drop such a turn instead of rejecting the draft.

#### Scenario: An earlier draft that repeats a fixed line is retried

- **WHEN** a first draft's goodbye has the turn "I've got more reading to do!"
- **THEN** the draft is rejected for repeating a line that the show adds itself, and the call is retried

#### Scenario: The last draft drops the repeated turn

- **WHEN** the last draft's goodbye repeats a fixed line beside a turn of its own
- **THEN** the repeated turn is left out and the goodbye keeps its own turn

### Requirement: A Podcast Episode picks its Findings by score, with a bonus for a like, a bookmark, and a url Source's page

A Podcast Episode SHALL pick up to fifteen Findings by score with their bonuses, from the triggering Scan's new
Findings and the Topic's other Findings that a user rated thumbs up or bookmarked, or whose page is one of the Topic's
url Sources, narrated or not. A Finding SHALL get a score bonus of 0.2 for a bookmark, 0.2 for a thumbs up, and 0.2 if
its page matches one of the Topic's url Sources by canonical url. The bonuses SHALL add up, and the score SHALL stay at
1 or below.
On a tie a new Finding SHALL be picked first. The picked Findings SHALL be narrated with the Scan's new Findings first,
then the others, each in relevance score order without the bonuses. Any place left SHALL go to the Topic's other
Findings that no published Podcast
Episode of the Topic has narrated, in score order, then to the Topic's other narrated Findings, in score order. A
Finding SHALL count as narrated by its Resource, so a Finding that was filtered out and found again later counts as
narrated, and a removed Podcast Episode's Findings count as not narrated. A Finding that a user rated thumbs down SHALL
never be narrated. If every one of the Topic's Findings that may be narrated counts as narrated, no Podcast Episode
SHALL be made and nothing SHALL be spent.

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

