## MODIFIED Requirements

### Requirement: The budget reset runs as its own scheduled job

The monthly budget reset SHALL run as its own script, `bun run reset:monthly-budgets`, on a platform cron once a day
shortly after midnight UTC, under its own database claim, the same kind the sweep uses, so an overlapping reset exits
without doing the work. It SHALL NOT run inside the scheduled sweep. The README's process table SHALL name the job
beside the scheduler. Every other process Northflank starts, the Temporal worker, the sweep, the migrate, edge purge,
and docs embed jobs, SHALL likewise start through a root script, as the workspace-structure capability states.

#### Scenario: The reset runs apart from the sweep

- **WHEN** the reset job and a sweep run in the same minute
- **THEN** the sweep dispatches its Scans without waiting for a single key to be replaced, and the reset replaces keys
  without a sweep in its process

#### Scenario: A second reset exits

- **WHEN** a reset starts while another reset holds the claim
- **THEN** the second exits at once having replaced nothing
