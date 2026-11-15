## MODIFIED Requirements

### Requirement: Zero turns the film backfill and the scan dispatch off

`TOPIC_VIDEO_BACKFILL_CONCURRENCY` set to 0 SHALL start no film backfill, and `SCAN_DISPATCH_LIMIT`
set to 0 SHALL start no scheduled Scan in a sweep. Unset, empty, or invalid, each SHALL read its default, 1 and 100.

#### Scenario: A backfill concurrency of zero starts no backfill

- **WHEN** the worker boots with the film backfill concurrency set to 0
- **THEN** no film backfill starts, and a new Podcast Episode's film still renders

#### Scenario: A scan dispatch limit of zero starts no scheduled Scan

- **GIVEN** 40 Topics that are scheduled for a Scan
- **WHEN** a sweep runs with `SCAN_DISPATCH_LIMIT` set to 0
- **THEN** it starts none of them, every Topic stays scheduled, and Waiting Scans still start under the first Scan
  dispatch limit

#### Scenario: An unset limit reads its default

- **WHEN** a sweep runs with `SCAN_DISPATCH_LIMIT` unset
- **THEN** it starts at most 100 scheduled Scans

### Requirement: Every emergency switch is off by default and proven by a test

With no value in Doppler and no saved setting, every emergency switch SHALL read its off value: each pause off, the
featured-only home off, the unverified accounts switch off, each daily spend cutoff and dispatch limit at its built-in
default, podcast recording and film rendering on, and no mobile minimum version. One test SHALL read every switch
with nothing set, and for each switch a test SHALL set it and check the behavior the Launch runbook names for it.

#### Scenario: Nothing set reads every switch as off

- **WHEN** every switch is read with no Doppler value and an empty settings table
- **THEN** both pauses, the featured-only home, and the unverified accounts switch read off, the cutoffs read 65, 100,
  and 150 dollars, the first Scan dispatch limit reads 5, the scan dispatch limit reads 100, the speech model reads
  its default, the film concurrency and the film backfill concurrency read 1, the generated chapter image limit reads
  40, and no mobile minimum version is stored

#### Scenario: A deploy turns nothing on

- **WHEN** this change's migration has run and the new build serves
- **THEN** every new setting holds its off value, and nothing a person sees has changed

#### Scenario: The empty speech model has a test

- **WHEN** a test sets `PODCAST_SPEECH_MODEL` empty and a Scan succeeds with Findings to narrate
- **THEN** no Podcast Episode is recorded and no Podcast Episode row is written

#### Scenario: The film concurrency has a test

- **WHEN** a test reads the film concurrency unset, at 0, and at 2
- **THEN** unset reads 1, 0 starts no film for a new Podcast Episode, and 2 reads 2

### Requirement: The runbook lists every switch as a last resort

For every emergency switch the runbook SHALL say where it is set, whether it needs a restart, what it stops, what
keeps working, what a person sees while it is on, how to undo it, and which test proves it. It SHALL state the whole
effect of `PODCAST_SPEECH_MODEL` set empty: every published podcast episode hidden, every feed responding 404, and
voice off. Every setting the runbook names SHALL exist in the code.

#### Scenario: Every switch has its row

- **WHEN** an operator opens the runbook's switches
- **THEN** the three daily spend cutoffs, the first Scan dispatch limit, the unverified accounts switch, both pauses,
  the featured-only home, the generated chapter image limit, the film concurrency, the film backfill concurrency, the
  scan dispatch limit, the empty speech model, the mobile minimum version, and the edge purge each have a row with
  those facts

#### Scenario: The empty speech model is not the way to stop recording

- **WHEN** an operator looks for the way to stop new podcast episodes
- **THEN** the runbook names the pause on new podcast episodes, and names the empty speech model as the last step
  with everything it hides

#### Scenario: A setting the runbook names exists

- **WHEN** each setting name in the runbook is searched for in the code
- **THEN** every one is found
