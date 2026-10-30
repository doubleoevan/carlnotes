# ui-test-workflow Specification

## Purpose
Run the visual and functional UI checks after a push to main, every night, and on demand, as reports that never block
a push, the gate, a deploy, or a release.

## Requirements

### Requirement: The UI checks run in their own workflow

The visual and functional UI checks SHALL run in one GitHub Actions workflow of their own. It SHALL be triggered by a
push to main, by a nightly schedule, and by manual dispatch. Its web, MCP, Android, iOS, and functional checks SHALL
each run as their own job, and a report job SHALL merge their results.

#### Scenario: A push starts the UI checks

- **WHEN** a commit is pushed to main
- **THEN** the UI tests workflow starts beside CI, and its jobs appear in its own run

#### Scenario: A dispatch runs one platform

- **WHEN** a developer dispatches the workflow for web only
- **THEN** only the selection, web, and report jobs run

### Requirement: No UI check gates a push, the gate, or a deploy

No UI check SHALL run in `scripts/preflight.sh`, the pre-push hook, or `.github/workflows/ci.yml`. No UI test job SHALL
be a required status check. The Smoke and Evals workflows, Northflank's deploy trigger, and EAS builds and updates SHALL
not wait on, read, or change because of the UI tests workflow. The unit tests of the UI test tooling SHALL run in
`bun test` like any module's tests, and SHALL open no browser or device, and capture nothing.

#### Scenario: A visual failure leaves the deploy alone

- **WHEN** a push to main fails a UI test job
- **THEN** the CI gate's result is unchanged, and Northflank deploys the commit as it would have without the workflow

#### Scenario: The pre-push hook stays as fast as before

- **WHEN** a developer pushes
- **THEN** the pre-push hook runs preflight and the Git LFS upload, with no image capture, comparison, or flow

### Requirement: A failure shows as a failure

A job SHALL fail when its checks find a changed, error, or unstable image capture, or a failed flow, or when its own
setup fails. No check step SHALL continue on error or mask a failed command. A job that captured nothing from a
non-empty selection SHALL fail. Each failure SHALL be annotated with its platform, story or flow, and status. New and
removed baselines SHALL be annotated as warnings.

#### Scenario: A changed image capture fails its job with an annotation

- **WHEN** the web job finds a changed Button image capture
- **THEN** the web job fails, and an error annotation names the platform, the story id, the palette, the size, and the
  differing pixel ratio

#### Scenario: An image capture tool that exits early fails the job

- **WHEN** the capture command crashes after 10 of 40 selected image captures
- **THEN** the job fails, and the summary names the 30 image captures that were not taken

#### Scenario: Zero image captures is never green

- **WHEN** a job is given 40 selected image captures and takes none
- **THEN** the job fails instead of reporting that every image capture passed

### Requirement: The summary states every result

The report job SHALL write the run's summary even if other jobs failed. It SHALL show:

- the selection
- each platform's counts by status
- the first 50 failures and the first 50 image captures waiting for approval, with a count of the rest
- the accessibility violations
- the flows that failed
- each skipped job, with the reason it was skipped

It SHALL link the artifacts that hold the images, reports, traces, and logs.

#### Scenario: A skipped native job says why

- **WHEN** a push selects no native story
- **THEN** the summary lists the Android and iOS jobs as skipped because nothing native was selected

### Requirement: The workflow holds no secret and reads no production data

The workflow SHALL read the repository and its own past runs, and nothing more. It SHALL reference no repository
secret and no Doppler config. Its functional checks SHALL run only against the disposable stack it starts on the
runner. Every action it uses SHALL name a full commit SHA, and every image it uses SHALL name a digest.

#### Scenario: The workflow file names no secret

- **WHEN** a test reads the UI tests workflow
- **THEN** it finds no `secrets.` reference and no Doppler step, and every `uses:` line names a commit SHA

### Requirement: A superseded push run is cancelled and its changes are not lost

A newer push to main SHALL cancel the UI tests run in progress for an earlier push, as CI already does for its own
runs. Scheduled and dispatched runs SHALL never be cancelled by a push. The workflow's guide SHALL state that CI's gate
cancels a superseded run, and that the UI tests selection still covers a cancelled run's commits.

#### Scenario: Two quick pushes run once

- **WHEN** two pushes arrive a minute apart
- **THEN** the first push's UI tests run is cancelled, and the second run's selection covers both pushes

#### Scenario: A push leaves the nightly run alone

- **WHEN** a push arrives while the nightly run is capturing
- **THEN** the nightly run keeps going

### Requirement: Runner time is bounded

Every job SHALL have a timeout. A push SHALL run a capture job only for a platform with selected image captures, and
SHALL run only the smoke subset of the flows. Every image capture and every flow SHALL run nightly and on dispatch.

#### Scenario: A web-only push starts no simulator

- **WHEN** a push changes a web-only component
- **THEN** the Android and iOS jobs are skipped

### Requirement: Evidence is kept as short-lived artifacts

The run SHALL upload its evidence as artifacts kept for 7 days:

- the current and diff images
- the JSON and HTML reports
- the parity report
- the selection
- Playwright traces, videos, and screenshots
- Maestro output
- device, api, and Metro logs

An upload SHALL run even if its job failed.

#### Scenario: A failed flow keeps its trace

- **WHEN** a flow fails on a push
- **THEN** its trace, video, and api log are in the run's artifacts for 7 days

### Requirement: A native job names its environment and fails visibly when it cannot run

Each native job SHALL write its environment to the summary and the report:

- the runner image
- Xcode, the simulator runtime, and the device for iOS
- the emulator system image, API level, and device profile for Android

A job that cannot install, boot, build, or open the app SHALL fail with the step that stopped it. It SHALL never be
reported as skipped or passed.

#### Scenario: A missing simulator runtime fails the iOS job

- **WHEN** the runner image no longer has the pinned iOS runtime
- **THEN** the iOS job fails, naming the missing runtime, and no iOS image capture is reported as passed

### Requirement: The guide records what has actually run

The UI tests guide SHALL keep a status table with one row per check and platform. Each row SHALL say whether the check
is operational, being proven, or not yet run, and SHALL link the last workflow run that proved it. A check SHALL be
marked operational only after a workflow run on GitHub-hosted runners has proved it.

#### Scenario: An unproven iOS check is labeled

- **WHEN** the iOS capture job has not yet completed a run on a GitHub-hosted runner
- **THEN** the status table marks it not yet run, with no claim that it works
