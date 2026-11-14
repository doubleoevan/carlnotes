## Purpose

Every switch an operator reaches for in an emergency is off until it is set, proven by a test, and listed in the
deployment guide's Launch runbook after what to watch and how to add capacity.

## ADDED Requirements

### Requirement: Every emergency switch is off by default and proven by a test

With no value in Doppler and no saved setting, every emergency switch SHALL read its off value: each pause off, the
pinned-only home off, the unverified accounts switch off, each daily spend cutoff and dispatch limit at its built-in
default, podcast recording and film rendering on, and no mobile minimum version. One test SHALL read every switch
with nothing set, and for each switch a test SHALL set it and check the behavior the Launch runbook names for it.

#### Scenario: Nothing set reads every switch as off

- **WHEN** every switch is read with no Doppler value and an empty settings table
- **THEN** both pauses, the pinned-only home, and the unverified accounts switch read off, the cutoffs read 65, 100,
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

### Requirement: Pausing new podcast episodes records none and hides nothing

While the pause on new podcast episodes is on, a Scan SHALL record no new Podcast Episode and write no Podcast
Episode row, whoever it would bill, and SHALL still succeed with its Findings. A recording already under way SHALL
finish. Every published Podcast Episode, its page, the podcast feeds, voice chat, and spoken replies SHALL stay as
they are. The pause SHALL take effect with no restart, and no copy SHALL tell a user that it is on.

#### Scenario: A paused Scan keeps its Findings

- **GIVEN** the pause on new podcast episodes is on
- **WHEN** a Scan of a Topic whose podcast is on succeeds with new Findings
- **THEN** the Findings are kept, the Scan reads succeeded, and no Podcast Episode row is written

#### Scenario: Published podcast episodes stay

- **GIVEN** the pause on new podcast episodes is on
- **WHEN** a visitor opens a public Topic's page and a podcast app reads the Topic's feed
- **THEN** the page shows the Topic's published Podcast Episodes and the feed responds as it did before the pause

#### Scenario: A recording under way finishes

- **GIVEN** a Podcast Episode that is recording
- **WHEN** an admin turns the pause on
- **THEN** that Podcast Episode still publishes

#### Scenario: Turning the pause off needs no restart

- **WHEN** an admin turns the pause off
- **THEN** the next Scan that succeeds with Findings records its Podcast Episode, and no process was restarted

### Requirement: Pausing new films starts none and leaves ready films playing

While the pause on new films is on, a newly published Podcast Episode SHALL start no film. A render already under way
SHALL finish, and every ready film SHALL keep playing. The film backfill and a rebuild of a ready film's intro and
sign-off SHALL run as they did. The pause SHALL take effect with no restart, and no copy SHALL tell a user that it is
on.

#### Scenario: A new podcast episode gets no film

- **GIVEN** the pause on new films is on
- **WHEN** a Podcast Episode publishes
- **THEN** the Podcast Episode plays as audio, and no film row or render is started for it

#### Scenario: A render under way finishes

- **GIVEN** a film that is rendering
- **WHEN** an admin turns the pause on
- **THEN** that film still becomes ready

#### Scenario: A ready film keeps playing

- **GIVEN** the pause on new films is on
- **WHEN** a visitor plays a public Topic's ready film
- **THEN** the film plays as it did before the pause

### Requirement: Zero turns the film backfill and the scan dispatch off

`TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY` set to 0 SHALL start no film backfill, and `SCAN_DISPATCH_LIMIT`
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

### Requirement: The Launch runbook orders its parts and says what to watch

`apps/docs/deployment.md` SHALL hold a Launch runbook after its Deploy alerts section, in this order: a pre-wave
checklist, what to watch, how to add capacity, every switch as a last resort, and a Rollback part. What to watch
SHALL list each minute gauge field and the day's spend line with its alert threshold, its normal range, and the
reading that means add capacity. A normal range SHALL be read from a week of production gauge lines and dated.

#### Scenario: An operator reads what to watch before any switch

- **WHEN** an operator opens the Launch runbook during a wave
- **THEN** what to watch and how to add capacity come before the first switch

#### Scenario: A queue the minute line leaves out

- **WHEN** an operator needs the backlog of a queue other than the scan queue, which is the one queue in the minute
  line
- **THEN** the runbook says where to read it

#### Scenario: A gauge field has a normal range

- **WHEN** an operator looks up the pool's waiting count, the event loop's delay, a Redis count, or the scan queue's
  backlog
- **THEN** the runbook gives its alert threshold, the range a week of production lines showed with the dates they
  were read, and the reading that means add capacity

### Requirement: The runbook says how to add capacity for each service and queue

How to add capacity SHALL name each service and each queue with the replica count or the setting that raises it, and
SHALL put the connection pool count first, because every new replica takes a pool. It SHALL say which settings a
restart applies and what a worker restart costs the work in progress.

#### Scenario: The pool count comes first

- **WHEN** an operator follows the steps to add a replica
- **THEN** the first step raises `DATABASE_POOL_COUNT` and restarts, before any replica is added

#### Scenario: A worker concurrency is raised by replicas during a wave

- **WHEN** an operator looks up how to add scan or recording capacity during a wave
- **THEN** the runbook says to add worker replicas, because a Worker's slots are fixed at its start

### Requirement: The runbook lists every switch as a last resort

For every emergency switch the runbook SHALL say where it is set, whether it needs a restart, what it stops, what
keeps working, what a person sees while it is on, how to undo it, and which test proves it. It SHALL state the whole
effect of `PODCAST_SPEECH_MODEL` set empty: every published podcast episode hidden, every feed responding 404, and
voice off. Every setting the runbook names SHALL exist in the code.

#### Scenario: Every switch has its row

- **WHEN** an operator opens the runbook's switches
- **THEN** the three daily spend cutoffs, the first Scan dispatch limit, the unverified accounts switch, both pauses,
  the pinned-only home, the generated chapter image limit, the film concurrency, the film backfill concurrency, the
  scan dispatch limit, the empty speech model, the mobile minimum version, and the edge purge each have a row with
  those facts

#### Scenario: The empty speech model is not the way to stop recording

- **WHEN** an operator looks for the way to stop new podcast episodes
- **THEN** the runbook names the pause on new podcast episodes, and names the empty speech model as the last step
  with everything it hides

#### Scenario: A setting the runbook names exists

- **WHEN** each setting name in the runbook is searched for in the code
- **THEN** every one is found

### Requirement: The runbook opens with a pre-wave checklist

Before its other parts the runbook SHALL hold a pre-wave checklist: the launch-day values of the three cutoffs and
the first Scan dispatch limit, the Sentry alert rules, the IP policy on the origin, each service's termination grace,
each plan and quota to read in its dashboard, and the deploy freeze. Each line SHALL say where to look and what value
is wanted. A fact only a dashboard knows SHALL be marked as the owner's and never invented.

#### Scenario: The cutoffs are sized for the wave

- **WHEN** the owner reads the checklist's first step
- **THEN** it says to set the three cutoffs and the first Scan dispatch limit in the admin console's Limits section
  from the expected signups times a new free user's first-day cost, because at their defaults the wave's own first
  Scans wait and chat pauses for every free user

#### Scenario: The alert rules are listed

- **WHEN** the owner reads the checklist's alert step
- **THEN** it lists three Sentry rules, one for every event tagged `alert: performance`, one for an issue seen more
  than five times in fifteen minutes, and one for the missing Temporal worker issue, and says to set
  `GLOBAL_DAILY_SPEND_ALERT_USD`

#### Scenario: The quotas the app does not own are listed

- **WHEN** the owner reads the checklist's quota step
- **THEN** it names Sentry, PostHog, Langfuse, Resend, Fireworks, Gemini speech and images, Exa, Firecrawl, YouTube,
  Google Maps, the moderation endpoint, Redis `maxmemory` and its eviction policy, the Neon compute's maximum, and
  the Temporal server's store, each with where to read it

#### Scenario: The app's store links are checked

- **WHEN** the owner reads the checklist's last step
- **THEN** it says to check that the docs' Get the app page links to the live store listings

#### Scenario: What nothing guards is named

- **WHEN** the owner reads the checklist
- **THEN** it names what this work leaves open: text moderation that lets text through if its check cannot run, a
  generated image that gets no image check, and an unset `OPENAI_API_KEY`, which skips every image check with no
  report

### Requirement: The runbook has a Rollback part

The Rollback part SHALL say that a request-serving service is rolled back by deploying the previous build to that
service alone, that the worker is never rolled back past a `patched` workflow change, that a migration adds in one
release and removes in a later one, that taking the push trigger off `release-main` freezes deploys,
that a docs commit also deploys, and that every deploy purges the edge.

#### Scenario: An operator rolls one service back

- **WHEN** a release breaks page renders and the operator opens the Rollback part
- **THEN** it gives the steps to deploy the previous build to that service alone, and says the schema stays at the
  new release's

#### Scenario: The worker stays past a patch

- **WHEN** the operator considers rolling the worker back past a release that added a `patched` change
- **THEN** the Rollback part says not to, because workflows that recorded the patch would no longer replay

#### Scenario: A deploy freeze is one step

- **WHEN** the owner wants no deploy during the wave
- **THEN** the Rollback part names the push trigger to take off `release-main` and how to put it back
