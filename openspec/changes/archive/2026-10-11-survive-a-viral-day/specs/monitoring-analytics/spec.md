## ADDED Requirements

### Requirement: One stage's repeated error is reported ten times an hour

A failure the app reports with its stage SHALL be sent to Sentry at most ten times an hour per process for the same
stage and message, and the reports past that SHALL be counted and held. The first report of the next hour SHALL include
how many the hour before held. A distinct error SHALL have its own count, and the counts SHALL be bounded at a
thousand errors per process, the oldest dropped first, so an incident that repeats one error thousands of times spends
little of the Sentry quota and hides no new error.

#### Scenario: An incident repeats one error

- **WHEN** one stage reports the same error five hundred times in an hour
- **THEN** ten reports reach Sentry, and the next hour's first report of it says 490 were held

#### Scenario: A new error still reports

- **WHEN** a different error is reported in the same stage during that hour
- **THEN** it reaches Sentry
