## ADDED Requirements

### Requirement: A film's row is written as soon as its render is queued

The film workflow's first step SHALL write the film's `rendering` row on a short-write task queue, before the render
waits for a film slot. A queued film SHALL therefore show its filming card, be read by the sweep's close-out, and
never be listed by the backfill as a Podcast Episode with no film. A render that started before this step existed
SHALL replay as it began.

#### Scenario: A queued film has its row before a slot is free

- **GIVEN** every film slot busy
- **WHEN** a Podcast Episode publishes and its film is queued
- **THEN** the film's row reads `rendering` at once, and the podcast episode page shows the filming card while the
  film waits

#### Scenario: The backfill never lists a queued film

- **GIVEN** a Topic whose latest Podcast Episode's film waits for a slot
- **WHEN** the backfill lists the Podcast Episodes with no film
- **THEN** that Podcast Episode is not listed

### Requirement: A new Podcast Episode's film renders ahead of the backfill

A new Podcast Episode's film and the backfill's renders SHALL keep their two task queues. Before each render the
backfill SHALL read the new films' queue and SHALL wait while that queue has a backlog, so a person's film never
waits behind the platform's own re-renders. A backfill render that is already running SHALL finish.

#### Scenario: A burst of new films goes first

- **GIVEN** a backfill with 60 films left and twenty Podcast Episodes that publish together
- **WHEN** the backfill finishes its running render
- **THEN** it starts no further render until the new films' queue has no backlog

#### Scenario: The backfill goes on once the queue is clear

- **GIVEN** a backfill that waits behind a backlog of new films
- **WHEN** the last of them has a slot
- **THEN** the backfill starts its next render

### Requirement: A retry resumes from the shots it stored

A render SHALL store each encoded shot under its render version, keyed by a hash of the shot's ffmpeg arguments with
each still's content hash in place of its path. A retry SHALL list the stored shots once and SHALL encode only the
shots that are not stored. A stored shot that fails to download SHALL count as not stored. The stored shots SHALL be
deleted once the film is saved, once the render fails for good, and once its Podcast Episode is removed.

#### Scenario: A second attempt encodes only what is missing

- **GIVEN** a render interrupted after it stored 180 of its 300 shots
- **WHEN** its next attempt runs
- **THEN** it encodes the other 120 shots and joins all 300

#### Scenario: A changed still is encoded again

- **GIVEN** a stored shot whose still was drawn again with different content
- **WHEN** the next attempt plans that shot
- **THEN** the shot's key differs from the stored one, and the shot is encoded again

#### Scenario: A saved film leaves no shots

- **WHEN** a film is saved as ready
- **THEN** no stored shot of that render is left

### Requirement: An attempt that a worker shutdown cancelled is not counted

An attempt that a worker shutdown cancelled SHALL report its own failure type, and the workflow SHALL schedule the
render again without counting that attempt toward its three. An attempt that ends for a missed heartbeat or at its
time limit SHALL still count, so a film that kills its replica every time fails. A render that started before this
rule shipped SHALL replay as it began.

#### Scenario: Three deploys do not fail a film

- **GIVEN** a first render whose attempts were cancelled by three worker shutdowns
- **WHEN** a worker is up again
- **THEN** the render runs again from its stored shots, and the film is not marked failed

#### Scenario: A killed replica still counts

- **WHEN** a render's replica is killed and the attempt ends for a missed heartbeat
- **THEN** the attempt counts as one of the render's three

### Requirement: A render stops if its Podcast Episode is removed

A running render SHALL check, on its 30-second heartbeat timer, whether its Podcast Episode was removed. If it was,
the render SHALL stop its encoder between shots, upload nothing further, delete its stored shots, and end as
skipped, not failed.

#### Scenario: A removal mid-render ends the render

- **GIVEN** a film half encoded
- **WHEN** its Topic's owner removes the Podcast Episode
- **THEN** within about 30 seconds the render stops, ends as skipped, and leaves no stored object

### Requirement: The failure mark and rebuilds never wait behind a render

The step that marks a film failed SHALL run on the short-write task queue that the film's row is written on, polled
by a Worker with no workflow bundle on the worker's main role, so a mark is written even if no film Worker runs. A
rebuild SHALL run on a task queue and a slot of its own on the films role. A mark or a rebuild that was scheduled on
`episode-videos` before the move SHALL still run there.

#### Scenario: A rebuild runs beside a full render

- **GIVEN** a replica whose render slot is held by a 40-minute render
- **WHEN** an editor regenerates another film's image
- **THEN** that film's rebuild starts at once on the rebuild slot

#### Scenario: A failed film is marked while every film slot is busy

- **GIVEN** every film render slot busy
- **WHEN** a first render fails its last attempt
- **THEN** its film is marked failed at once, without waiting for a render slot

### Requirement: The platform's render cost is recorded apart from the film's cost

A render that bills the platform SHALL leave its film row's cost unchanged and SHALL write the platform's cost to the
`spends` table as rows with no user: the render's minutes, each generated chapter image, and the film's own image.
Each row SHALL carry the time its cost was incurred, so a re-render of an old film counts in that day's total. The
rows SHALL count in the day's total spend, and SHALL never count in a user's monthly spend or the free-plan spend.

#### Scenario: A re-render's cost reaches the day's total

- **GIVEN** a film created last week that the backfill re-renders today with six generated images
- **WHEN** the day's spend is read
- **THEN** it includes the six images and the render's minutes as the platform's spend, and the film row's cost has
  not risen

#### Scenario: A free owner's film moves no cutoff

- **GIVEN** a free owner whose film the backfill re-renders
- **WHEN** the free-plan spend is read
- **THEN** the re-render's cost is not in it

### Requirement: The main role still starts a new Podcast Episode's film

A worker on the `main` role hosts no film Worker, as the deploy-mechanics capability states, and SHALL still start a
published Podcast Episode's film workflow, which a worker on the `films` role renders. The film concurrency setting
SHALL stay above 0 on the main role, because 0 there turns new films off.

#### Scenario: A recording on the main role starts its film

- **WHEN** a Podcast Episode publishes on a worker whose role is `main`
- **THEN** its film's workflow is started, its `rendering` row is written, and a films replica renders it

#### Scenario: Film concurrency 0 on the main role starts no film

- **WHEN** a Podcast Episode publishes on a main worker whose film concurrency is 0
- **THEN** no film workflow is started for it

## MODIFIED Requirements

### Requirement: The backfill gives each Topic's latest Podcast Episode a film

One backfill workflow under a fixed id SHALL render a film for each Topic's latest published Podcast Episode that has no
film row. It SHALL also render once more each first render that failed and was never started again, and SHALL give no
other Podcast Episode its first film. It SHALL also re-render every ready film below the current render version. A
second start SHALL join the one running. It SHALL list public Topics first, then private and team Topics, a page at a
time. A worker that hosts the film Workers SHALL start it on boot in every environment, unless the backfill concurrency
is 0, and `bun run films:backfill` SHALL start or join it by hand. Each backfill render SHALL run as a child workflow
under the film's own workflow id, so Temporal rejects a second render of a film whose render is queued or running, and
the backfill SHALL count a rejected render as skipped. A backfill that was running before this rule shipped SHALL finish
its page as it began.

#### Scenario: Only the latest Podcast Episode is backfilled

- **GIVEN** a Topic whose two Podcast Episodes were published before films shipped, neither with a film
- **WHEN** the worker boots
- **THEN** the backfill renders a film for the later Podcast Episode only

#### Scenario: A second boot finds nothing

- **GIVEN** a backfill that ended with every Topic's latest Podcast Episode rendered or skipped, every failed first
  render already rendered once more, and every film at the current render version
- **WHEN** the worker boots again
- **THEN** the backfill lists no Podcast Episode and ends with zero counts

#### Scenario: A second start joins the running backfill

- **GIVEN** the backfill running after a boot
- **WHEN** an operator runs `bun run films:backfill`
- **THEN** the script waits for the running backfill and prints its counts

#### Scenario: A film whose render is already queued is not rendered twice

- **GIVEN** a Podcast Episode whose film's workflow is queued or running
- **WHEN** the backfill starts a render for the same film
- **THEN** Temporal rejects the start, the backfill counts the film as skipped, and one render writes the film's files

### Requirement: The backfill runs apart, bills nobody, and never loops

The backfill SHALL run on its own task queue at a concurrency of 1 by default, raised by a setting, so it never takes
slots from scans, recordings, or new films. A concurrency of 0 SHALL be accepted: the worker then starts no backfill and
hosts no backfill Worker, and a backfill already running waits on its queue until a Worker polls it again. Before each
render the backfill SHALL wait while the new films' queue has a backlog. A Podcast Episode it cannot render SHALL be
skipped and logged, and one whose render fails SHALL be marked failed. A skipped one SHALL NOT be listed again. A first
render that failed SHALL be listed once more, by a row that is failed and was never started again, and never after that.
A backfilled film SHALL count against no user's plan, and the platform's cost of it SHALL be recorded in the `spends`
table. The backfill SHALL log its counts so far, the films left across every Topic, and its estimated cost of the films
left, at its start and after each batch of renders. It SHALL return and log its counts at its end.

#### Scenario: An unrenderable Podcast Episode is skipped once

- **GIVEN** a Topic's latest Podcast Episode with no chapters
- **WHEN** the backfill reaches it
- **THEN** it is counted as skipped, a warning names it, it has no film, and the next run does not list it

#### Scenario: The backfill reports what it did

- **WHEN** the backfill ends
- **THEN** it returns and logs how many films it rendered, skipped, and failed, how many generated images it drew, the
  total render time, and the stored bytes

#### Scenario: A backfilled film bills nobody

- **WHEN** the backfill renders a film for an owner past the podcast episode spend cutoff
- **THEN** the film renders, its row's cost is zero, and the platform's cost of the render is recorded in `spends` rows
  with no user

#### Scenario: The backfill logs its progress

- **GIVEN** a backfill with 78 films to re-render
- **WHEN** it finishes its twelfth
- **THEN** the worker's log has a line with the counts so far, the 66 films left, and the estimated cost of the 66

#### Scenario: A concurrency of 0 starts no backfill

- **WHEN** a worker boots with the backfill concurrency at 0
- **THEN** no backfill starts, no Worker polls the backfill's queue, and a new Podcast Episode's film still renders

#### Scenario: The films left count every Topic

- **GIVEN** 250 Topics whose latest Podcast Episode has no film, and 40 ready films below the current render version
- **WHEN** the backfill logs its progress after its first batch
- **THEN** the films left are counted across all 250 Topics and the 40 films, not across the current page of 100

#### Scenario: A failed first render is listed once more

- **GIVEN** a first render that failed its third attempt and was never started again
- **WHEN** the backfill next lists its work
- **THEN** the film is listed and rendered once more, and a second failure leaves it out of every later run

### Requirement: An imagined image is drawn from the Finding's public words alone

An imagined image SHALL be drawn by the film image's scene writer, house style prompt, and image model, at the film's
frame size. Its scene SHALL be written from the Finding's title and public relevance explanation alone, fenced as
untrusted text, and never from a private annotation, a Personal sources item or summary, a Note, or a Comment. A drawn
image SHALL pass the image moderation that an uploaded image passes before it is stored under the key that the api
serves, or shown. Before the check, the image SHALL be stored under a key that the api never serves, so a retry checks
the stored image and draws nothing. A rejection SHALL be remembered, so no later attempt or render in the same film
house style draws that image again.

#### Scenario: Only public words reach the scene writer

- **GIVEN** a Finding with a private annotation from a sender's Personal sources
- **WHEN** an imagined image is drawn for its chapter
- **THEN** the scene writer is sent the Finding's title and public relevance explanation, and nothing else of the Topic

#### Scenario: A flagged image is never shown

- **WHEN** the image moderation flags a drawn image, cannot read it, or fails
- **THEN** the image is never stored under the key that the api serves, and the chapter shows the podcast card

#### Scenario: A skipped check lets the image through

- **GIVEN** an environment with no moderation key
- **WHEN** an imagined image is drawn
- **THEN** the image is stored and shown, as an uploaded image is there

#### Scenario: A rejected image is drawn once

- **GIVEN** a chapter's generated image that the image moderation flagged in a film's first render attempt
- **WHEN** the render's next attempt and a later re-render in the same style reach that image
- **THEN** neither draws it again, and the chapter shows the podcast card

#### Scenario: An image whose check could not run is checked again

- **GIVEN** a drawn image whose moderation call failed
- **WHEN** the render's next attempt reaches it
- **THEN** the stored image is checked again with no new draw, and it is shown once it passes

### Requirement: A render that stalls or is cancelled stops and is tried again

A render SHALL get three attempts of at most four hours each before its film is marked failed, or before a re-render is
recorded as failed at its render version. An attempt that a worker shutdown cancelled SHALL NOT count as one of the
three. A running render SHALL report that it is alive every 30 seconds, and an attempt that reports nothing for two
minutes SHALL end. An attempt that is cancelled or times out SHALL stop its encoder, upload no part of the film, and
remove its work folder. The shots that it already stored SHALL stay for the next attempt.

#### Scenario: A long chapter on a one-core worker keeps rendering

- **WHEN** a chapter of six minutes takes eighteen minutes to encode
- **THEN** the render keeps reporting that it is alive, and the attempt goes on

#### Scenario: A timed-out attempt never renders beside its retry

- **WHEN** an attempt ends at its time limit while its encoder is running
- **THEN** the encoder stops before the next attempt starts, and the attempt's work folder is removed

#### Scenario: Three failed attempts mark the film failed

- **WHEN** a first render fails its third attempt
- **THEN** the film is marked failed, and the backfill lists it once more and never after that

#### Scenario: A deploy does not use up an attempt

- **WHEN** a worker shutdown cancels a render's attempt
- **THEN** the render is scheduled again, and it still has three attempts

#### Scenario: A killed replica's render is retried within minutes

- **WHEN** a replica is killed while it renders a film
- **THEN** the attempt ends two minutes after its last report, and the next attempt skips the shots already stored

### Requirement: The backfill re-renders every film below the current render version

The backfill SHALL re-render every ready film below the current render version, including a film it rendered itself, on
the platform's bill. It SHALL fetch the images of a film's Resources before it renders the film. A Podcast Episode with
no film SHALL get none from the re-render. A second run SHALL list no film that is already current. A backfill that is
cancelled SHALL mark a first render in progress failed, and SHALL leave a re-render's ready row as it is with no failed
render version, so the next backfill lists that film again.

#### Scenario: Every existing film is re-rendered

- **GIVEN** 78 ready films at version 1
- **WHEN** the backfill runs
- **THEN** each of the 78 is re-rendered with chapter montages and stored at the current render version

#### Scenario: A film the backfill rendered is re-rendered too

- **GIVEN** a film that the backfill rendered for a Topic's latest Podcast Episode before this capability shipped
- **WHEN** the backfill runs
- **THEN** that film is re-rendered

#### Scenario: A second run does nothing

- **GIVEN** a backfill that ended with every film at the current render version
- **WHEN** the backfill runs again
- **THEN** it lists no film and renders nothing

#### Scenario: A Podcast Episode with no film stays without one

- **GIVEN** a Topic's older Podcast Episode that has no film
- **WHEN** the backfill runs
- **THEN** that Podcast Episode still has no film

#### Scenario: A re-render bills nobody

- **WHEN** the backfill re-renders a film and draws six generated images for it
- **THEN** the draws run on the platform's key, and the film's cost does not rise
- **AND** the six draws and the render's minutes are recorded as the platform's spend

#### Scenario: A cancelled backfill leaves a re-render for the next run

- **GIVEN** a backfill cancelled while it re-renders a ready film
- **WHEN** the next backfill lists its work
- **THEN** the film is listed again, its row holds no failed render version, and its old film played throughout

#### Scenario: A cancelled backfill fails a first render in progress

- **GIVEN** a backfill cancelled while it renders a Topic's first film
- **WHEN** the cancellation is handled
- **THEN** that film's row is marked failed, and is not left at `rendering`

### Requirement: A re-render never takes the playing film away

While a film re-renders, its stored film SHALL keep playing. The new film SHALL be stored under new keys, and SHALL
replace the old one in one step once every file is stored. The replaced files SHALL be deleted after a grace period. A
re-render that fails SHALL leave the old film in place and delete what it uploaded. A re-render that fails its last
attempt SHALL NOT be listed again at that render version. An attempt that a worker shutdown cancelled, and a re-render
that its backfill's cancellation ended, SHALL NOT count as such a failure.

#### Scenario: The old film plays during the re-render

- **GIVEN** a film whose re-render is half encoded
- **WHEN** a visitor opens the Podcast Episode
- **THEN** the film section shows, and the old film plays

#### Scenario: The new film replaces the old in one step

- **GIVEN** a visitor who started the old film's url a minute before its re-render finished
- **WHEN** the re-render stores its last file
- **THEN** the next play gets the new film, and the visitor's old url keeps playing until it expires

#### Scenario: A failed re-render leaves the old film

- **WHEN** a re-render fails while it encodes
- **THEN** the old film still plays, its row is unchanged, and nothing the re-render uploaded is left

#### Scenario: A film that cannot be re-rendered is tried once a version

- **GIVEN** a film whose re-render failed its third attempt
- **WHEN** the worker boots and the backfill runs again
- **THEN** the film is not listed, and its old film still plays

#### Scenario: A deploy during a re-render records no failed version

- **GIVEN** a re-render whose attempt a worker shutdown cancelled
- **WHEN** the render is scheduled again and finishes
- **THEN** the film is stored at the current render version, and no failed render version was recorded
