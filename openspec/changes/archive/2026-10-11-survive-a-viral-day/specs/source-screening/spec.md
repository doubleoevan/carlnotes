## MODIFIED Requirements

### Requirement: A url Source is saved immediately and screened asynchronously

A url Source SHALL be persisted as soon as its Topic saves, so the edit modal stays fast, and SHALL carry an async
screening status and a failure reason. The screen SHALL run in a durable workflow instead of in the save request, and
SHALL be keyed on the Source so a Source never has two screens running at once.

The screen SHALL fetch the page through the same `fetchPublicUrl` a Scan fetches through, which already rejects a
malformed, non-http, or internal url, and SHALL then screen the fetched markdown as page content. A page that screens
clean SHALL become ready. A page that is flagged, or that cannot be fetched at all, SHALL become failed with the reason
recorded on the Source.

A fetch that fails for a reason the next attempt may pass, a rate limit, a server error, a timeout, or a dropped
connection, SHALL be attempted up to three times, and SHALL leave the Source pending for the next sweep to screen again
while the Source is less than a day old, so a crawler's brief rate limit during a burst never fails a good Source. Past
that day the failure SHALL be recorded like any other. A scanner that did not respond SHALL be retried the same way and,
on the last attempt, SHALL let the Source become ready, so a dead scanner never strands a Source.

An unfetchable url SHALL be a rejection instead of a warning. A Source whose page never loads produces nothing on every
future Scan, and this is the only point at which the owner is told so.

A Source of a kind that is not screened SHALL be saved ready, so that no row rests at a status that will never change
and the readiness gate stays independent of Source kind.

#### Scenario: A url that screens clean

- **GIVEN** a Topic saved with a url Source whose page fetches and screens clean
- **WHEN** its screening workflow finishes
- **THEN** the Source is ready with no error recorded

#### Scenario: A url whose page is flagged

- **GIVEN** a Topic saved with a url Source whose fetched page a detector flags
- **WHEN** its screening workflow finishes
- **THEN** the Source is failed and the flagged detectors are recorded as its reason

#### Scenario: A url whose page cannot be fetched

- **GIVEN** a Topic saved with a url Source whose page cannot be fetched at all
- **WHEN** its screening workflow finishes
- **THEN** the Source is failed and the fetch failure is recorded as its reason, instead of being left to yield nothing
  on every future Scan

#### Scenario: A url whose fetch is rate limited

- **GIVEN** a Topic saved an hour ago with a url Source whose fetch gets a 429 on every attempt
- **WHEN** its screening workflow finishes
- **THEN** the Source stays pending, and the next sweep screens it again

#### Scenario: A Source of an unscreened kind

- **WHEN** a Topic is saved with a Source of a kind that is not screened
- **THEN** it is stored ready and no screening workflow is started for it

## ADDED Requirements

### Requirement: Screens run a bounded number at a time per replica

Each worker replica SHALL run at most `SCREEN_CONCURRENCY` screens at once, 8 by default, on each of its attachment and
Source screening Workers, so a burst of new Topics waits in the queue instead of sending every page to one scanner at
once. A Source screen's schedule-to-close timeout SHALL be the queued stage timeout, a day, so a screen that waits its
turn is never failed for the wait, while its start-to-close timeout of two minutes bounds every attempt. The llm-guard
call inside a Source screen SHALL wait up to twenty seconds, longer than an inline screen a user waits on, since nobody
waits on a Source screen and a long page should screen instead of timing out.

#### Scenario: A burst waits its turn

- **WHEN** two hundred Sources are saved in a minute on one worker replica
- **THEN** eight screen at once, the rest wait in the queue, and none fails for the wait
