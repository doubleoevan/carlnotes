## ADDED Requirements

### Requirement: Scheduled Scans run on a task queue of their own

A scheduled Scan's workflow SHALL start on the `topic-scans-scheduled` task queue, chosen by the Scan's trigger, and
a first or a manual Scan's SHALL start on `topic-scans`. A Worker of its own SHALL poll the scheduled queue, with
`SCHEDULED_SCAN_CONCURRENCY` slots per replica, 8 by default. A Scan's ingest and review run on its workflow's queue,
so a first or a manual Scan SHALL never wait behind scheduled Scans, and a Scan running across the deploy SHALL
finish on the queue it started on.

#### Scenario: A manual Scan does not wait behind scheduled Scans

- **GIVEN** two hundred scheduled Scans that wait for a slot
- **WHEN** an owner starts a manual Scan
- **THEN** its ingest and its review each start as soon as a `topic-scans` slot is free

#### Scenario: A Scan from before the deploy finishes where it started

- **GIVEN** a scheduled Scan that started on `topic-scans` before the deploy
- **WHEN** its review is scheduled after the deploy
- **THEN** the review runs on `topic-scans`

#### Scenario: The scheduled slots default to eight

- **WHEN** the worker starts with `SCHEDULED_SCAN_CONCURRENCY` unset
- **THEN** up to eight scheduled scan activities run at once on that replica, beside its `SCAN_CONCURRENCY` slots

### Requirement: Ingest returns only what review reads

The ingest stage's result SHALL hold, for each Resource it found, only the url, the Source credited with it, and
whether a custom Source and whether a Personal source found it. It SHALL hold no title, snippet, or body, because
the review loads those from the stored Resource, and a Scan's result is written into its workflow history three
times. The review and the closing write SHALL accept the earlier, wider result too, so a Scan running across the
deploy completes.

#### Scenario: A wide Scan stays far under the payload limit

- **GIVEN** a Scan that finds 688 Resources whose snippets run to 75,000 characters
- **WHEN** ingest returns
- **THEN** its result is under 100 KB, and the review scores the same pages as it did before

#### Scenario: A Scan ingested before the change completes

- **GIVEN** a Scan whose ingest returned the wider result before the deploy
- **WHEN** its review and its closing write run on the new code
- **THEN** the Scan completes

## MODIFIED Requirements

### Requirement: A stage that spends money is not retried automatically

Ingest MAY be retried, since it dedupes on canonical url and a re-run converges on the same Resources.

The stage that fetches and scores MAY be retried twice, and no more. It is nearly idempotent already: the Resources it
loads exclude every Resource that already carries a Finding for the Topic and every page whose `filtered_findings` row
still holds, a Finding is keyed on Topic and Resource so re-scoring updates rather than duplicates, a persisted
embedding makes re-gating free, and a completed fetch leaves stored content behind for reuse. What a second attempt pays
for again is bounded to the Sources that always re-read, one Topic-context embed, and whatever had been admitted but not
yet scored when the attempt died.

The limit SHALL be two retries, because the stage already isolates its per-Resource failures internally: a failure that
reaches the stage boundary is either systemic, which further attempts will not fix, or a worker that died or shut down,
and two retries cover two deploys close together. A review attempt that a worker shutdown cancelled SHALL fail with that
cancellation, and SHALL NOT return what it had scored, so the stage is tried again and resumes after the pages already
scored. A failure after the last attempt SHALL end the Scan as failed. The write that ends the Scan MAY be retried,
being one idempotent write.

#### Scenario: A dead worker during the paid stage

- **GIVEN** a Scan whose fetch-and-scoring stage was interrupted by its worker dying
- **WHEN** the stage is attempted again
- **THEN** it skips every Resource it already scored, resumes the Scan's recorded spend, and the Scan reaches a terminal
  status with the first attempt's Findings intact

#### Scenario: A failing paid stage ends the Scan

- **WHEN** the fetch-and-scoring stage fails on its last allowed attempt
- **THEN** the Scan ends as failed and the stage is not attempted again

#### Scenario: A deploy during the paid stage

- **GIVEN** a Scan whose review is still scoring two minutes after its worker was told to shut down
- **WHEN** the worker cancels the attempt
- **THEN** the attempt fails, the next attempt skips every page already scored and resumes the Scan's recorded spend,
  and the Scan is not saved as succeeded with part of its pages and no recap

#### Scenario: Two deploys inside one review

- **GIVEN** a review whose first and second attempts were each cancelled by a worker shutdown
- **WHEN** the third attempt runs to its end
- **THEN** the Scan runs to its end, and is not failed for the two deploys

### Requirement: Scan concurrency is configured

The number of scan activities one worker replica runs at once SHALL come from `SCAN_CONCURRENCY`, defaulting to 8 if
unset or not a whole number above zero, read the way `DATABASE_POOL_MAX` is read. Daily capacity for first and manual
Scans is the worker replicas that run scan activities × `SCAN_CONCURRENCY` × 86,400 / the mean scan duration in seconds.
A replica on the films role runs none, and scheduled Scans have slots of their own. `SCAN_CONCURRENCY` SHALL be set from
a scan duration measured in production, never assumed.

#### Scenario: The setting takes effect

- **WHEN** the worker starts with `SCAN_CONCURRENCY=16`
- **THEN** up to sixteen scan activities run at once on that replica

#### Scenario: A bad value falls back

- **WHEN** the worker starts with `SCAN_CONCURRENCY=many`
- **THEN** eight scan activities run at once on that replica, the default

#### Scenario: A films replica adds no scan capacity

- **WHEN** the film service scales from one replica to four
- **THEN** the number of scan activities that run at once does not change
