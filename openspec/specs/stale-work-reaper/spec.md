# stale-work-reaper Specification

## Purpose
The sweep's reaper reaps work whose workflow is gone: a Podcast Episode stuck recording, a film stuck rendering, a Topic
Post Discussion stuck recording, a pending topic image render, and a pending attachment. Each is started again once
and then failed. The reaper's rules for a Scan stay in `scheduled-scans` and `durable-scans`.

## Requirements

### Requirement: The sweep reaps five kinds of row left in progress

After it reaps stale Scans, each sweep SHALL read the rows still in progress past their limit: a Podcast Episode at
`recording`, a film at `rendering`, a Topic Post Discussion at `recording`, a topic image render at `pending`, and an
attachment at `pending`. One sweep module, the reaper, SHALL reap all five. A row inside its limit SHALL be left alone
and SHALL NOT be reported. The sweep SHALL log how many rows of each kind it started again and how many it failed.

#### Scenario: A row inside its limit is left alone

- **GIVEN** a Podcast Episode that began recording an hour ago
- **WHEN** the sweep runs
- **THEN** the Podcast Episode is left recording, and nothing is reported

#### Scenario: The first sweep after a Temporal loss logs its restarts

- **GIVEN** a Podcast Episode, a film, and a discussion each past its limit with no workflow
- **WHEN** the sweep runs
- **THEN** each is started again, and the sweep's log has the count of each kind

### Requirement: Each reaper limit is derived from its workflow's own timeouts

Each kind's limit SHALL be the longest time its workflow can run, summed from that workflow's activity timeouts,
attempts, and backoffs, plus the 15-minute margin that the reaper uses for a stale Scan. The workflows' timeouts SHALL
live in `packages/pipeline/stageTimeouts.ts`, which the workflows and the sweep both import, so each number has one
copy. A scheduled Scan's Podcast Episode SHALL get a limit that includes its chapters' six-hour wait for speech.

#### Scenario: A scheduled chapter's wait is inside the limit

- **GIVEN** a scheduled Scan's Podcast Episode whose chapters have waited five hours for speech capacity
- **WHEN** the sweep runs
- **THEN** the Podcast Episode is inside its limit and is left recording

#### Scenario: A changed timeout moves the limit

- **WHEN** a workflow's activity timeout is changed in the shared module
- **THEN** that kind's reaper limit changes with it, and no other file holds the number

### Requirement: A row's limit runs from when its work last began

A Podcast Episode's, a discussion's, an image render's, and an attachment's limit SHALL run from the time its row was
written, or from its restart if the reaper started it again. A film's limit SHALL run from its row's last write,
because each attempt of a first render writes the row. A wait for a worker slot counts toward the limit, which is
why the reaper asks Temporal before it acts.

#### Scenario: A film's later attempt starts its limit again

- **GIVEN** a first render whose second attempt wrote its row an hour ago
- **WHEN** the sweep runs
- **THEN** the film is inside its limit, however long ago its first attempt began

#### Scenario: A restarted row gets a full limit

- **GIVEN** a discussion that the reaper started again ten minutes ago
- **WHEN** the next sweep runs
- **THEN** the discussion is inside its limit and is left recording

### Requirement: The reaper asks Temporal whether the workflow still runs

Past a row's limit the sweep SHALL ask Temporal whether the row's workflow still runs before it changes the row,
because a healthy workflow that waits for a slot on a backed-up queue can be older than its limit. A row whose
workflow still runs SHALL be left as it is and reported. A read that fails for any reason but a missing workflow
SHALL leave the row alone.

#### Scenario: A workflow waiting on a backed-up queue is left

- **GIVEN** a Podcast Episode past its limit whose workflow is still running and waits for a recording slot
- **WHEN** the sweep runs
- **THEN** the row stays `recording`, no work is started, and the wait is reported

#### Scenario: Temporal cannot be read

- **GIVEN** a film past its limit
- **WHEN** the sweep's read of its workflow fails because Temporal cannot be reached
- **THEN** the film is left `rendering`, and the next sweep asks again

### Requirement: A row whose workflow is gone is started again once

A row past its limit whose workflow is closed or not found SHALL have its work started again once, on the same row
and under the same workflow id, and the row SHALL record the time in `restarted_at`. The restart SHALL reuse what
the first run stored: a Podcast Episode's saved script and stored chapters, and a film's stored shots. It SHALL
write no second row, so a discussion started again counts as no second regeneration and bills the user who started
it.

#### Scenario: A lost workflow's Podcast Episode records again

- **GIVEN** a Topic's first Podcast Episode at `recording` past its limit, whose workflow was lost with the Temporal
  database
- **WHEN** the sweep runs
- **THEN** its recording starts again on the same row, the row records the restart, and the chapters already stored
  are not recorded again

#### Scenario: A restarted discussion is no second regeneration

- **GIVEN** a Free user who regenerated one discussion this month, which is stuck at `recording` with no workflow
- **WHEN** the sweep starts it again
- **THEN** the post still has one discussion row for that recording, and the control reads 1 of 2 used this month

#### Scenario: A pending attachment is processed again

- **GIVEN** an attachment at `pending` past its limit whose processing workflow is gone
- **WHEN** the sweep runs
- **THEN** its processing starts again on the same row and the same stored file

### Requirement: A row that was already started again is reaped for good

A row that the reaper already started again, and that passes its limit again with no workflow, SHALL be reaped
for good and reported, not only logged. A Podcast Episode, a film, a discussion, and an attachment SHALL be
marked failed through the path that their own workflow fails them by. A topic image render's row SHALL be deleted,
which returns its regeneration to the month's count. A Podcast Episode whose Scan was deleted has no workflow id to
start, and SHALL be failed with no restart.

#### Scenario: A second loss fails the Podcast Episode

- **GIVEN** a short Podcast Episode that the reaper started again, past its limit again with no workflow
- **WHEN** the sweep runs
- **THEN** it is failed with the reaper's reason, its chapter audio is deleted, its shared Comments are released,
  the failure is reported, and the Topic's next Scan records a short Podcast Episode

#### Scenario: A discussion failed by the reaper allows a Regenerate

- **GIVEN** a discussion that the reaper started again, past its limit again with no workflow
- **WHEN** the sweep runs
- **THEN** the discussion is failed, the earlier discussion still plays, and a later Regenerate is accepted

#### Scenario: A reaped image render gives its regeneration back

- **GIVEN** a `regenerate` render at `pending` that the reaper started again, past its limit again with no workflow
- **WHEN** the sweep runs
- **THEN** the render row is deleted, the Topic keeps its current image, and the editor counts one regeneration fewer
  this month

#### Scenario: A Podcast Episode with no Scan is failed with no restart

- **GIVEN** a Podcast Episode at `recording` past its limit whose Scan was deleted
- **WHEN** the sweep runs
- **THEN** it is failed, and no recording is started for it

### Requirement: A workflow still running a day past its limit is terminated

The reaper SHALL never cancel or terminate a workflow at its row's limit. If a row's workflow still runs a day
past the limit, the sweep SHALL terminate the workflow and reap the row for good, the way a row that was
already started again is reaped, so a workflow that can no longer finish stops spending on that row.

#### Scenario: A workflow that a deploy broke is terminated

- **GIVEN** a Podcast Episode whose workflow has been running for a day past its limit
- **WHEN** the sweep runs
- **THEN** the workflow is terminated, the Podcast Episode is failed, and no further speech call is made for it

#### Scenario: A running workflow is not stopped at the limit

- **GIVEN** a film whose render workflow is still running an hour past its limit
- **WHEN** the sweep runs
- **THEN** the workflow keeps running, and the film stays `rendering`

### Requirement: A finished row is never reaped

The reaper SHALL read only rows still in progress. A published, failed, or removed Podcast Episode, a ready or
failed film, a published or failed discussion, a finished image render, and a ready or failed attachment SHALL
never be changed by it. A re-render keeps its film's row `ready`, so a film that is re-rendering SHALL never be
reaped.

#### Scenario: A re-rendering film is left alone

- **GIVEN** a ready film whose re-render has run for thirteen hours
- **WHEN** the sweep runs
- **THEN** the film's row is unchanged, and its stored film keeps playing

#### Scenario: A published Podcast Episode is left alone

- **GIVEN** a scheduled Scan's Podcast Episode that published nine hours after it began recording
- **WHEN** the sweep runs
- **THEN** the Podcast Episode is unchanged

### Requirement: A film started again bills the platform if its row's cost is zero

A film that the reaper starts again SHALL bill the platform if its row's cost is zero, which is how a first
render by the backfill reads, and SHALL bill the Podcast Episode's owner otherwise. An owner's render whose workflow
was lost before its first paid step also reads zero, so its restart bills the platform. It SHALL render at the version
that new films render at, as a later attempt of a render does, so it reuses the images and clips its first run stored
and pays for none of them twice.

#### Scenario: A backfill's stuck film stays on the platform's bill

- **GIVEN** a film at `rendering` with a cost of zero, left by a cancelled backfill
- **WHEN** the sweep starts it again
- **THEN** the render and its image draws bill the platform, and the owner's monthly spend does not change

#### Scenario: An owner's stuck film bills its owner

- **GIVEN** a film at `rendering` whose row holds the cost of its own image
- **WHEN** the sweep starts it again
- **THEN** the render bills the Podcast Episode's owner

#### Scenario: A restarted animated film pays for no clip twice

- **GIVEN** a version 4 film at `rendering` whose lost workflow had stored two animated clips
- **WHEN** the sweep starts it again
- **THEN** the render reuses both clips, and generates no clip that the first run had not stored

### Requirement: The reaper reads a film only while its first render can be started again

The reaper SHALL read a film at `rendering` only if it has no stored film, which is a first render. A ready film that
was marked `rendering` because its image was removed keeps its stored film for its rebuild, and SHALL be left to that
rebuild. While films are off or new films are paused, the reaper SHALL read no film, so a film stuck at `rendering`
is neither started again nor failed until films render again.

#### Scenario: A film waiting on its rebuild is left alone

- **GIVEN** a film marked `rendering` after its image was rejected, with its stored film, past the reaper's limit
- **WHEN** the sweep runs
- **THEN** the film's row is unchanged, and no render is started for it

#### Scenario: Paused films are neither started again nor failed

- **GIVEN** new films are paused and a first render has been stuck at `rendering` past its limit
- **WHEN** the sweep runs
- **THEN** the film stays `rendering`, and the first sweep after films resume starts it again
