## ADDED Requirements

### Requirement: A user's avatar decode reports reach monitoring five times a day

The decode failure reports a signed-in user's browser sends SHALL be counted per user in Redis, in a day that starts at
the user's first report, and only the first five in that day SHALL be reported to monitoring. Every report SHALL still
get a 204, as taken, so the browser has nothing to retry.

#### Scenario: A browser reporting in a loop

- **WHEN** one user's browser sends twenty decode failure reports in a day
- **THEN** five reach monitoring and all twenty get a 204
