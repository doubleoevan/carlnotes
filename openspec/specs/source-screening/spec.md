# source-screening Specification

## Purpose
TBD - created by archiving change scan-async-durability-and-url-screening. Update Purpose after archive.
## Requirements
### Requirement: A url Source is saved immediately and screened asynchronously

A url Source SHALL be persisted as soon as its Topic saves, so the edit modal stays fast, and SHALL carry an async screening status and a failure reason. The screen SHALL run in a durable workflow rather than in the save request, and SHALL be keyed on the Source so a Source never has two screens running at once.

The screen SHALL fetch the page through the same seam a Scan fetches through, which already rejects a malformed, non-http, or internal url, and SHALL then screen the fetched markdown as page content. A page that screens clean SHALL become ready. A page that is flagged, or that cannot be fetched at all, SHALL become failed with the reason recorded on the Source.

An unfetchable url SHALL be a rejection rather than a warning. A Source whose page never loads produces nothing on every future Scan, and this is the only point at which the owner is told so.

A Source of a kind that is not screened SHALL be saved ready, so that no row rests at a status that will never change and the readiness gate stays independent of Source kind.

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
- **THEN** the Source is failed and the fetch failure is recorded as its reason, rather than being left to yield nothing on every future Scan

#### Scenario: A Source of an unscreened kind

- **WHEN** a Topic is saved with a Source of a kind that is not screened
- **THEN** it is stored ready and no screening workflow is started for it

### Requirement: A new Topic's first Scan waits for its screens

A Topic's first Scan SHALL wait for that Topic's pending Sources to reach a verdict before it starts, so the Scan the owner watches on creation reads the urls they just saved instead of skipping them as unchecked. The wait SHALL be bounded, and SHALL NOT hold up the response to the save.

A Source still pending when the bound passes SHALL be left for a later Scan, so a page that never loads delays the first Scan by the bound rather than by the screening workflow's full limit.

Only the first Scan SHALL wait. A manual or scheduled Scan SHALL run when it is asked to, skipping whatever is not ready.

#### Scenario: A Topic created with a url Source

- **GIVEN** a Topic saved with a url Source whose page screens clean within the bound
- **WHEN** its first Scan runs
- **THEN** the Scan reads that Source, rather than skipping it as still pending

#### Scenario: The save is not held up by the wait

- **WHEN** a Topic carrying a url Source is saved
- **THEN** the save responds without waiting for the screen or the Scan

#### Scenario: A screen that outlasts the bound

- **GIVEN** a Topic whose url Source is still being screened when the bound passes
- **WHEN** the first Scan starts
- **THEN** it runs without that Source, and a later Scan picks the Source up once it is ready

### Requirement: A Source that is not ready is invisible to everyone but its owner

A Source that has not passed its screen SHALL be excluded from what a reader who does not own the Topic receives, on every path that returns a Topic's Sources. This gating is the whole protection while the screen runs, so it SHALL apply to a signed-out visitor to a public Topic exactly as it applies to any other non-owner.

The owner and an admin SHALL still receive the Source, along with its status and its failure reason.

#### Scenario: A signed-out visitor to a public Topic

- **GIVEN** a public Topic carrying a url Source that is pending or failed
- **WHEN** a signed-out visitor loads that Topic
- **THEN** the Source is absent from what they receive, so its raw url never renders

#### Scenario: The owner sees what a non-owner does not

- **GIVEN** the same Topic
- **WHEN** its owner loads it
- **THEN** the Source is present along with its status and, if it failed, its reason

#### Scenario: The feed path gates the same way

- **WHEN** a Topic's Sources are returned through the feed path rather than the topic page
- **THEN** the same Sources are hidden from a non-owner as on the topic page

### Requirement: A Source that is not ready is never scanned

Ingest SHALL skip a Source that has not passed its screen, so an unscreened url is never fetched into a Resource and never reaches scoring. A skipped Source SHALL be treated as the ingester registry already treats a Source it cannot run: it stops only itself, and the Scan proceeds on whatever the other Sources found.

#### Scenario: A Scan runs while a url Source is still pending

- **GIVEN** a Topic whose url Source is still being screened
- **WHEN** a manual or scheduled Scan runs
- **THEN** that Source is skipped, no Resource is created from its url, and the Scan completes on its other Sources

#### Scenario: A Scan runs after a url Source failed its screen

- **GIVEN** a Topic whose url Source failed its screen
- **WHEN** a Scan runs
- **THEN** that Source is skipped rather than fetched

### Requirement: The owner sees a Source being checked and why one failed

A Source that is being screened SHALL read to its owner as being checked, on the topic page and in the edit modal. A Source that failed SHALL read as failed with the recorded reason, the way a failed attachment reads as its filename followed by its failure.

A Source that is not ready SHALL NOT render as a live link, since a url that has not been screened is exactly what must not be clickable.

#### Scenario: A Source still being screened

- **WHEN** the owner views a Topic whose url Source is pending
- **THEN** the Source shows a checking state and its url is not a live link

#### Scenario: A Source that failed its screen

- **WHEN** the owner views a Topic whose url Source failed
- **THEN** the Source shows as failed with the recorded reason, in the topic page and in the edit modal alike

### Requirement: A Source whose screen never started is picked back up

A Source row is written before its screening workflow starts, so a failure in that gap can leave a Source pending with nothing behind it. Such a Source SHALL be left pending and picked up again by the existing scheduled sweep, rather than by a recovery path of its own. Because the workflow is keyed on the Source, a restart for a Source whose screen is genuinely running SHALL be rejected rather than duplicating the work.

A start that fails SHALL NOT mark the Source failed. A start fails because the workflow engine is unreachable, which says nothing about the Source, and only a pending Source is ever retried — so failing one here would strand it permanently on a transient outage. The failed status SHALL be reserved for a screen that reached a verdict.

#### Scenario: The screening workflow never starts

- **GIVEN** a Source row written by a process that died before starting its screen
- **WHEN** the next sweep runs
- **THEN** its screening workflow is started

#### Scenario: A restart meets a screen already running

- **GIVEN** a Source whose screening workflow is running
- **WHEN** the sweep tries to start it again
- **THEN** the start is rejected and the running screen is left alone

#### Scenario: The start itself fails

- **WHEN** starting a Source's screening workflow throws at save time because the workflow engine is unreachable
- **THEN** the failure is reported, the Source stays pending and therefore stays not ready, and the next sweep starts it

