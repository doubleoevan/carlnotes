## ADDED Requirements

### Requirement: A succeeded Scan starts its podcast episode workflow

Once a Scan's closing write saves it as `succeeded`, the Scan's workflow SHALL start an episode workflow as a child that
outlives it, with a workflow id that names the Scan, on the episode render task queue. This holds for a scheduled Scan,
a manual Scan, and a Topic's first Scan. A failed Scan and a Scan that the user stopped SHALL start none. The Scan's
workflow SHALL wait only for the child to start and then complete, so the Topic's next Scan is never rejected as running
while a Podcast Episode renders, and stopping that next Scan never cancels the render. A Scan that resumed after an
interruption SHALL still start its episode workflow at most once. A child that already exists SHALL be left alone, and
any other failure to start SHALL be reported. Nothing the episode workflow does SHALL change the Scan's recorded status
or its stored outputs.

The Scan's workflow SHALL start the email workflow before the episode workflow, and SHALL tell the email workflow that
an episode workflow follows, so the Scan's email can wait for the Podcast Episode's title. On an instance with no speech
model configured, the episode workflow SHALL end at its first step with nothing rendered and nothing spent.

#### Scenario: A scheduled Scan starts a render

- **WHEN** a scheduled Scan is saved as succeeded
- **THEN** a podcast episode workflow named for the Scan starts, and the Scan's workflow completes without waiting for
  it

#### Scenario: A stopped Scan starts no render

- **WHEN** the user stops a Scan
- **THEN** no podcast episode workflow starts

#### Scenario: A render never holds up the next Scan

- **GIVEN** a Scan that completed while its Podcast Episode is still rendering
- **WHEN** the owner asks for a manual Scan of the same Topic
- **THEN** the manual Scan starts, and the render continues

#### Scenario: A failed render leaves the Scan as it ended

- **GIVEN** a Scan that succeeded
- **WHEN** its podcast episode workflow fails
- **THEN** the Scan is still recorded as `succeeded`, and its email is still sent

#### Scenario: The email workflow starts first

- **WHEN** a scheduled Scan is saved as succeeded
- **THEN** its email workflow is started before its podcast episode workflow, and is told that an episode workflow
  follows

#### Scenario: No speech model, nothing rendered

- **WHEN** a Scan succeeds on an instance with the speech model set empty
- **THEN** its podcast episode workflow ends at its first step, no model is called, and the digest is sent without an
  episode section
