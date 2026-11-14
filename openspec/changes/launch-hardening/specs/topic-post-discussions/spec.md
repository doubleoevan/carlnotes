## ADDED Requirements

### Requirement: A discussion's speech audio is stored before it is encoded

The recording step SHALL store the speech audio under a key of its own before it encodes it. A retry of the step
SHALL read the stored audio, SHALL make no second speech call, and SHALL add no second cost. The stored speech audio
SHALL be recorded for deletion once the discussion publishes, and once it fails.

#### Scenario: A retry makes no second speech call

- **GIVEN** a discussion whose speech audio was stored before its encode failed
- **WHEN** the recording step is attempted again
- **THEN** it encodes the stored audio, makes no speech call, and the discussion's cost holds one speech call

#### Scenario: A published discussion leaves no speech audio

- **WHEN** a discussion publishes
- **THEN** its stored speech audio is deleted, and its encoded file is the one object left

### Requirement: A discussion's recording reports that it is alive and stops with its attempt

A discussion's recording step SHALL report that it is alive while it runs, and an attempt that stops reporting SHALL
end. Its join SHALL run under a time limit and SHALL stop if the attempt is cancelled, so an encoder never runs
beside its retry.

#### Scenario: A recording on a dead worker is retried soon

- **WHEN** the worker that records a discussion is killed
- **THEN** the attempt ends for a missed report, without waiting out the step's whole time limit

#### Scenario: A cancelled recording stops its encoder

- **WHEN** a recording attempt is cancelled while ffmpeg joins its audio
- **THEN** ffmpeg is stopped before the next attempt starts

### Requirement: A failed discussion is reported

A discussion that fails SHALL be reported to error monitoring with its id and its reason, and SHALL NOT only be
saved as failed.

#### Scenario: A speech outage is reported

- **WHEN** a discussion's speech call fails on every attempt
- **THEN** the discussion is saved as failed, and one report names it and the reason

## MODIFIED Requirements

### Requirement: A later discussion records only through Regenerate, with an optional hint

Apart from the recording a publish starts, and a stuck recording that the sweep's close-out starts again, a discussion
SHALL record only if a user who may publish on the Topic presses Regenerate. The request SHALL take an optional hint of
up to 500 characters that steers the script. The hint SHALL pass the user text classification and SHALL reach the writer
fenced. The new recording SHALL replace the old one once it is stored, and a failed one SHALL leave the old one playing.
A post SHALL have one recording under way at a time. A recording that the close-out starts again SHALL reuse its row, as
the stale-work-close-out capability states, so it counts as no second regeneration.

#### Scenario: A second Regenerate while one records is rejected

- **WHEN** two Regenerate requests for one post arrive together
- **THEN** one starts a recording and the other is rejected as already recording

#### Scenario: A recording that cannot start leaves nothing behind

- **WHEN** a recording's workflow fails to start
- **THEN** the post has no recording under way, and a later Regenerate works

#### Scenario: A new shared Comment needs a Regenerate

- **WHEN** an editor shares a Comment on a Topic Post whose discussion is already recorded
- **THEN** the discussion is unchanged until an editor presses Regenerate

#### Scenario: A failed regeneration keeps the old audio

- **WHEN** a regenerated discussion fails its script check
- **THEN** the page still plays the earlier discussion

#### Scenario: A stuck recording is started again without a Regenerate

- **GIVEN** a discussion at `recording` whose workflow was lost, past its close-out limit
- **WHEN** the sweep runs
- **THEN** the recording starts again on the same row, nobody presses Regenerate, and the month's count of
  regenerations is unchanged
