## MODIFIED Requirements

### Requirement: Sentry instruments the api and the worker with an environment tag and sampled tracing

When `SENTRY_DSN` is set and `DOPPLER_ENVIRONMENT` is `prd`, `api`, `web`, and `worker` SHALL report unhandled and
logged errors to Sentry, tagged with the environment that the existing `DOPPLER_ENVIRONMENT` value names, with no new
variable, and SHALL enable tracing at a sampled rate that configuration can override. Outside `prd` they SHALL send
nothing, since the Sentry quota is shared across environments. Default PII collection SHALL be off.

With tracing on, each request the api or the web service serves SHALL be sampled for a transaction, as the
`performance-telemetry` capability names and measures it. The health checks, the built assets, the docs site, and the
static files at the site root SHALL be sampled at zero, so the platform's polling spends no quota. The badge polls,
`/api/badges`, `/api/rooms/mention-count`, `/api/note-badges`, and `/api/invites/topics/pending`, SHALL be sampled at a
tenth of the configured rate, since they are the most frequent requests and the least varied. Every other request SHALL
be sampled at the configured rate.

#### Scenario: An error carries its environment

- **WHEN** the worker reports an error while running with `DOPPLER_ENVIRONMENT=prd`
- **THEN** the Sentry event is tagged with that environment, and a `dev` run sends nothing, so the shared quota is spent
  on production alone

#### Scenario: Traces are sampled, not complete

- **WHEN** requests and Scans run with tracing enabled
- **THEN** only the configured fraction of traces is sent, and the sample rate is configurable without a code change

#### Scenario: The platform's polling is not sampled

- **WHEN** Northflank polls `/api/health` every few seconds with tracing on
- **THEN** no transaction is sent for those requests, and the sampled share applies only to requests that do work

#### Scenario: A badge poll is sampled at a tenth of the rate

- **WHEN** the rate is 0.1 and open tabs poll `/api/badges`
- **THEN** one poll in a hundred is traced, while one feed request in ten is

#### Scenario: The web service reports like the api

- **WHEN** a page render fails on the `web` service while it runs with `DOPPLER_ENVIRONMENT=prd`
- **THEN** the Sentry event is tagged with that environment, and the service's page renders are sampled at the
  configured rate

#### Scenario: A shipped build's badge polls keep the tenth

- **WHEN** the rate is 0.1 and a shipped mobile build polls `/api/rooms/mention-count`
- **THEN** one poll in a hundred is traced
