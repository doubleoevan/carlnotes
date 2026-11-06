## MODIFIED Requirements

### Requirement: A statement that runs past thirty seconds is cancelled

The app's database role SHALL have a `statement_timeout` of 30 seconds in the app's database alone, set by the migration
job, so a runaway query is cancelled instead of holding a pooled connection, and another database the role reaches keeps
its own setting. The connection pooler's server connections take the setting as they open. A migration that needs longer
SHALL set `statement_timeout` to zero locally in its own transaction.

#### Scenario: A runaway query is cancelled

- **WHEN** a query runs for more than 30 seconds
- **THEN** Postgres cancels it and its connection returns to the pool
