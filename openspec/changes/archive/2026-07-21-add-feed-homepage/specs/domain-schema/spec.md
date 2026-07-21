## ADDED Requirements

### Requirement: Consumed state is a per-user record, not a Finding column
The schema SHALL record consumed state in a `consumptions` table rather than on `findings`, so a user's read state is private to that user. Each row SHALL reference a `users` row and a `findings` row and cascade on delete of either, and `(user_id, finding_id)` MUST be unique so a Finding is consumed at most once per user. A row's presence means the Finding is consumed for that user; unmarking SHALL delete the row. No consumed or seen column SHALL be added to `findings`.

#### Scenario: A consumption references a user and a finding uniquely
- **WHEN** a user marks a Finding consumed twice
- **THEN** exactly one `consumptions` row exists for that (user, Finding), and it is deleted if either the user or the Finding is deleted

#### Scenario: Consumed state stays off the Finding
- **WHEN** the schema is inspected
- **THEN** `findings` has no consumed or seen column, and consumed state lives only in `consumptions`

### Requirement: The change includes the consumptions migration
The change SHALL include a generated Drizzle migration that creates the `consumptions` table with its foreign keys and its `(user_id, finding_id)` unique constraint. Applying it to a database at the current schema MUST succeed without altering any other table.

#### Scenario: Migration adds only the consumptions table
- **WHEN** the generated migration is applied to a database at the current schema
- **THEN** the `consumptions` table and its `(user_id, finding_id)` unique constraint exist and no other table is modified
