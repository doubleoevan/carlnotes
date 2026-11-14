## MODIFIED Requirements

### Requirement: Sentry instruments the api and the worker with an environment tag and sampled tracing

When `SENTRY_DSN` is set and `DOPPLER_ENVIRONMENT` is `prd`, `api`, `web`, and `worker` SHALL report unhandled and
logged errors to Sentry, tagged with the environment that the existing `DOPPLER_ENVIRONMENT` value names, with no new
variable, and SHALL enable tracing at a sampled rate that configuration can override. Outside `prd` they SHALL send
nothing, since the Sentry quota is shared across environments. Default PII collection SHALL be off.

With tracing on, each request the api or the web service serves SHALL be sampled for a transaction, as the
`performance-telemetry` capability names and measures it. The health checks, the built assets, the docs site, and the
static files at the site root SHALL be sampled at zero, so the platform's polling spends no quota. The badge polls,
`/api/rooms/mention-count`, `/api/note-badges`, and `/api/invites/topics/pending`, SHALL be sampled at a tenth of the
configured rate, since they are the most frequent requests and the least varied. Every other request SHALL be sampled
at the configured rate.

#### Scenario: An error carries its environment

- **WHEN** the worker reports an error while running with `DOPPLER_ENVIRONMENT=prd`
- **THEN** the Sentry event is tagged with that environment, and a `dev` run sends nothing, so the shared quota is
  spent on production alone

#### Scenario: Traces are sampled, not complete

- **WHEN** requests and Scans run with tracing enabled
- **THEN** only the configured fraction of traces is sent, and the sample rate is configurable without a code change

#### Scenario: The platform's polling is not sampled

- **WHEN** Northflank polls `/api/health` every few seconds with tracing on
- **THEN** no transaction is sent for those requests, and the sampled share applies only to requests that do work

#### Scenario: A badge poll is sampled at a tenth of the rate

- **WHEN** the rate is 0.1 and open tabs poll `/api/rooms/mention-count`
- **THEN** one poll in a hundred is traced, while one feed request in ten is

#### Scenario: The web service reports like the api

- **WHEN** a page render fails on the `web` service while it runs with `DOPPLER_ENVIRONMENT=prd`
- **THEN** the Sentry event is tagged with that environment, and the service's page renders are sampled at the
  configured rate

### Requirement: One stage's repeated error is reported ten times an hour

A failure the app reports with its stage SHALL be sent to Sentry at most ten times an hour per process for the same
stage and message, and the reports past that SHALL be counted and skipped. The first report of the next hour SHALL
include how many the hour before skipped. A distinct error SHALL have its own count, and the counts SHALL be bounded at
a thousand errors per process, the oldest dropped first, so an incident that repeats one error thousands of times spends
little of the Sentry quota and hides no new error. The report that reaches the limit SHALL also send one `error-loop`
threshold warning naming the stage, as the performance-telemetry capability states, so a looping error notifies through
the alert on threshold warnings, where the ten reports alone stay under an error rate alert. The sweep is a new process
on every run, so a report from the sweep SHALL first take a one-hour slot in Redis for its stage and message. It SHALL
be sent only if it takes the slot or if Redis cannot say.

#### Scenario: An incident repeats one error

- **WHEN** one stage reports the same error five hundred times in an hour
- **THEN** ten reports reach Sentry, and the next hour's first report of it says 490 were skipped

#### Scenario: A new error still reports

- **WHEN** a different error is reported in the same stage during that hour
- **THEN** it reaches Sentry

#### Scenario: A looping error sends one threshold warning

- **WHEN** one stage's tenth report of the same error in an hour reaches Sentry from one process
- **THEN** that process also sends one `error-loop` warning naming the stage, and no second one that hour

#### Scenario: The sweep reports one failure once an hour

- **WHEN** sixty sweeps in one hour each fail the same stage with the same message
- **THEN** the sweep that takes the hour's slot reports it, and the other fifty-nine report nothing

#### Scenario: Redis down does not silence the sweep's report

- **WHEN** a sweep stage fails while Redis is unreachable
- **THEN** the sweep reports the failure

## ADDED Requirements

### Requirement: A failed sweep stage is reported and the later stages still run

Each stage of the sweep SHALL run in its own try. A stage that throws SHALL be reported with its stage, and the sweep
SHALL go on to the stages after it, so one failure never skips the viewer counts, the daily count save, the deletion
retries, the emails, or the spend report.

#### Scenario: A failed scheduled scan stage does not skip the counts

- **WHEN** the sweep's scheduled scan stage throws on a database error
- **THEN** the failure is reported, and the same sweep still copies the viewer counts, saves the daily counts, retries
  the deletions, sends the emails, and reports the day's spend

#### Scenario: Two failed stages are two reports

- **WHEN** two stages of one sweep throw different errors
- **THEN** each is reported with its own stage, and every other stage runs
