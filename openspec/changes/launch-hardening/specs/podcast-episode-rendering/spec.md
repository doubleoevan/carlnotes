## ADDED Requirements

### Requirement: A scheduled Scan's chapters record on a task queue of their own

A scheduled Scan's chapters SHALL record on the `episode-scheduled-chapters` task queue, which an activities-only
Worker polls. Its limit on concurrent chapters SHALL be read from `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY`, the way
`PODCAST_RECORDING_CONCURRENCY` is read, with a default of 32 per worker replica. The plan, the outline, the script,
a standard-tier chapter, and a Topic Post Discussion SHALL never wait behind a scheduled chapter. The queue's backlog
SHALL be gauged.

#### Scenario: A new Topic's first Podcast Episode does not wait behind scheduled chapters

- **GIVEN** every scheduled chapter slot held by a chapter that waits for speech capacity
- **WHEN** a Topic's first Scan succeeds
- **THEN** its Podcast Episode's outline starts as soon as a recording slot is free, and its Scan's email gets the
  title inside its outline wait

#### Scenario: The default is thirty-two

- **WHEN** the worker starts with `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY` unset or at 0
- **THEN** at most thirty-two scheduled chapters record at once on that replica

#### Scenario: A recording from before the move replays

- **GIVEN** a scheduled Scan's Podcast Episode whose chapters were scheduled on `episode-recordings` before the deploy
- **WHEN** its workflow replays on the new code
- **THEN** it replays with no error, and its chapters finish on `episode-recordings`

### Requirement: The audio encode runs on a task queue of its own

The join and encode of a Podcast Episode's audio SHALL run on the `episode-encodes` task queue, with as many slots
per worker replica as the replica has cores, because one join uses about one core. Podcast Episodes that reach their
encode together SHALL wait in that queue, and SHALL NOT slow a script or a chapter. A recording that scheduled its
encode before the move SHALL replay and finish on the queue it used.

#### Scenario: A burst of encodes waits its turn

- **GIVEN** a replica with two cores and sixteen Podcast Episodes ready to encode
- **WHEN** their encodes are scheduled
- **THEN** two encode at once on that replica, the others wait in the queue, and none shares a core with another

#### Scenario: An encode from before the move replays

- **GIVEN** a Podcast Episode whose encode was scheduled on `episode-recordings` before the deploy
- **WHEN** its workflow replays on the new code
- **THEN** it replays with no error, and its encode finishes on `episode-recordings`

### Requirement: A script call waits out a model rate limit

The outline call and each script segment call SHALL be tried again with a backoff that starts at 30 seconds and
doubles, for up to an hour from the time the call was scheduled, in place of three attempts a second or two apart. A
rate limit or an overloaded model SHALL delay a Podcast Episode and SHALL NOT fail it. A draft that fails its schema
on every try and a script call that finds the budget spent SHALL still fail the Podcast Episode with no further
attempt.

#### Scenario: A two-minute rate limit delays the Podcast Episode

- **GIVEN** a model that answers every script call with a 429 for two minutes
- **WHEN** a Podcast Episode's outline is written
- **THEN** the outline is written on a later attempt, and the Podcast Episode records and publishes

#### Scenario: A spent budget still fails with no retry

- **WHEN** an outline call finds the budget spent
- **THEN** no further attempt is made, and the Podcast Episode is saved as failed with that reason

### Requirement: A publish writes only over a row that is still recording

The update that publishes a Podcast Episode SHALL name the `recording` status, and SHALL change nothing and roll
back if the row is no longer recording. The chapter step SHALL make no speech call for a row that is no longer
recording, and the image step SHALL draw nothing for a row that is not published. A workflow that outlives its
row's close-out or removal SHALL therefore never publish over the row or spend on it.

#### Scenario: A late publish never writes over a failed row

- **GIVEN** a Podcast Episode that the sweep's close-out failed while its workflow was still encoding
- **WHEN** the workflow reaches its publish
- **THEN** the row stays failed, and nothing is published

#### Scenario: A chapter of a failed row makes no speech call

- **GIVEN** a Podcast Episode that was failed while one of its chapters waited for a slot
- **WHEN** that chapter's step starts
- **THEN** it makes no speech call and adds no cost

## MODIFIED Requirements

### Requirement: Each chapter renders as one two-speaker request with its own retries

Each chapter SHALL render as one two-speaker speech request. The cold open SHALL be rendered with the first chapter,
each transition with the chapter it leads into, and the sign-off with the last chapter, so the chapters' times cover the
whole Podcast Episode. A scheduled Scan's chapters SHALL use the Flex tier and any other Scan's the standard tier.
Chapters SHALL render in parallel, each with its own retries.

No audio SHALL travel in a workflow payload. The activity that renders a chapter SHALL write its audio to a temporary
prefix in object storage and SHALL return only the chapter's position, the object's key and byte size, and how many
attempts the render took. No activity SHALL rely on a local file that another activity wrote, since the worker runs as
several replicas. Before it calls speech, the activity SHALL look for the chapter's stored audio and SHALL return it if
it is there, so a retry of the activity makes no second speech call and adds no second cost.

A rate-limited or overloaded speech call SHALL be retried with backoff. A standard-tier chapter SHALL be tried again,
with a backoff that starts at 30 seconds and doubles, until an hour after it was scheduled, in place of five attempts. A
scheduled Podcast Episode MAY wait hours for Flex capacity and SHALL NOT move to the standard tier. Any other rejection
SHALL NOT be retried. A chapter whose speech is rejected, or still fails once its time runs out, SHALL be left out,
together with the turns that render with it, and the Podcast Episode SHALL publish the chapters that rendered, with its
saved script and transcript matching them. A Podcast Episode with no chapter rendered SHALL fail, and a failed Podcast
Episode SHALL publish nothing.

#### Scenario: Chapters render in parallel

- **WHEN** a Podcast Episode with eight chapters renders
- **THEN** its chapters are requested concurrently, within the limit of the queue that its chapters record on

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

#### Scenario: A standard chapter waits out a rate limit

- **GIVEN** a manual Scan's chapter whose speech calls get a 429 for eight minutes
- **WHEN** the provider answers again
- **THEN** the chapter records on a later attempt, and the Podcast Episode publishes with it

#### Scenario: A retried chapter reuses its stored audio

- **GIVEN** a chapter whose audio was stored before its step's attempt ended in an error
- **WHEN** the step is attempted again
- **THEN** it returns the stored audio, makes no speech call, and adds no cost

### Requirement: ffmpeg joins the chapters on temp files into one normalized MP3

The chapters' audio SHALL be joined by ffmpeg working on temp files, never held in memory. The join SHALL run under a
time limit shorter than its step's own and SHALL stop if its attempt is cancelled, so an encoder never runs beside its
retry. The encode SHALL report that it is alive while it runs, and an attempt that stops reporting SHALL end. The theme
clips that exist SHALL be mixed with the joined talk at 44.1 kHz in the same ffmpeg pass, before the loudness filter, so
the Podcast Episode is encoded once and normalized as a whole. The joined audio SHALL be normalized to podcast loudness
and encoded as MP3 at 64 kbps mono, about 14 MB for 30 minutes. With neither theme clip, the ffmpeg arguments SHALL be
the ones that joined a Podcast Episode before the theme music. The file SHALL be stored in object storage through the
existing S3 path, with its byte size and duration recorded on the Podcast Episode. Each chapter's start and end times
SHALL come from the rendered chapters' durations, shifted by the intro's lead if the intro clip is mixed in. The
duration SHALL include the outro clip's tail past the last word if the outro clip is mixed in. The temp files SHALL be
deleted once the Podcast Episode's file is stored. The per-chapter audio SHALL stay for a retried join until the Podcast
Episode publishes, and SHALL be deleted then, and a failed Podcast Episode's per-chapter audio SHALL be deleted when it
fails.

#### Scenario: Chapter times follow the rendered audio

- **GIVEN** chapters that rendered at 155, 143, and 142 seconds, and no theme clip
- **WHEN** the Podcast Episode is encoded
- **THEN** the chapters start at 0, 155, and 298 seconds, and the Podcast Episode's duration is 440 seconds

#### Scenario: The theme music shifts the chapter times and lengthens the duration

- **GIVEN** chapters that rendered at 155, 143, and 142 seconds, and both 60 second theme clips
- **WHEN** the Podcast Episode is encoded
- **THEN** the chapters start at 40, 195, and 338 seconds, and the Podcast Episode's duration is 520 seconds

#### Scenario: The file is a 64 kbps mono MP3

- **WHEN** a Podcast Episode is encoded
- **THEN** its stored file is an MP3 at 64 kbps with one channel

#### Scenario: Nothing is left behind

- **WHEN** a Podcast Episode publishes
- **THEN** its temp files and its per-chapter audio objects are deleted

#### Scenario: A failed Podcast Episode leaves no audio

- **WHEN** a Podcast Episode fails after three of its chapters rendered
- **THEN** the three chapter objects are deleted

#### Scenario: A timed-out join never runs beside its retry

- **WHEN** a join reaches its time limit while ffmpeg is still running
- **THEN** ffmpeg is stopped before the encode's next attempt starts

#### Scenario: An encode on a dead worker is retried soon

- **WHEN** the worker that runs an encode is killed
- **THEN** the attempt ends for a missed report, without waiting out the encode's whole time limit

### Requirement: Recordings run on their own task queue with a configured limit

Podcast Episode recordings SHALL run on their own Temporal task queue, `episode-recordings`, with their own Worker, the
way Scans and scan emails do. A scheduled Scan's chapters and the audio encode SHALL run on task queues of their own, as
their requirements state. Every other recording step and a Topic Post Discussion's steps SHALL run on
`episode-recordings`. The limit on concurrent recording activities SHALL be read from `PODCAST_RECORDING_CONCURRENCY`,
the way `SCAN_CONCURRENCY` is read, with a default of 16 per worker replica. A burst of recordings after the scheduled
sweep SHALL wait in these queues, SHALL never take a scan slot, and SHALL stay within the speech provider's rate limits.

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

#### Scenario: A scheduled chapter takes no recording slot

- **GIVEN** a scheduled Scan's Podcast Episode with fifteen chapters
- **WHEN** its chapters record
- **THEN** none of them holds one of the replica's sixteen recording slots
