## ADDED Requirements

### Requirement: Topic invites are rows keyed by topic and email
The schema SHALL record invite-visibility access in a `topic_invites` table: `topic_id` referencing `topics` with cascade delete, the invited `email`, and an `invited_at` timestamp. `(topic_id, email)` SHALL be the composite primary key so re-inviting the same email is a no-op. Invites reference emails, not user rows, so a Topic can be shared with someone before they have an account.

#### Scenario: An invite is unique per topic and email and follows its topic
- **WHEN** the same email is invited to a Topic twice and the Topic is later deleted
- **THEN** exactly one invite row existed for that pair, and deleting the Topic removed it

### Requirement: Scans carry a manual marker
The `scans` table SHALL carry an `is_manual` boolean, not null, default false. Manually triggered Scans set it true, and scheduled and seeded Scans keep the default. The marker is bookkeeping that records which Scans an owner triggered. It is not a quota input: the per-user daily scan quota counts scheduled and manual runs alike.

#### Scenario: The marker defaults to false
- **WHEN** a Scan row is inserted without the marker
- **THEN** `is_manual` is false

### Requirement: Users carry a platform role
The `users` table SHALL carry a `role` column, not null, defaulting to `user`, with `admin` marking platform operators — the authority axis from the roles-and-plans decision. The column SHALL be plain text (not an enum) to match Better Auth's admin plugin shape. Operator-only data, such as Scan spend, SHALL be gated on this role.

#### Scenario: The role defaults to user
- **WHEN** a user row is inserted without a role
- **THEN** `role` is `user`

### Requirement: Users carry a billing plan
The `users` table SHALL carry a `plan` column, not null, defaulting to `free`, backed by a `plan` enum of `free`, `plus`, and `premium` — the entitlement axis from the roles-and-plans decision. The plan SHALL drive the per-user topic cap and daily scan quota.

#### Scenario: The plan defaults to free
- **WHEN** a user row is inserted without a plan
- **THEN** `plan` is `free`

### Requirement: The change includes its migrations
The change SHALL include generated Drizzle migrations that create `topic_invites` with its composite primary key and cascade, add `is_manual` to `scans` with its default, add `role` to `users` with its default, and add the `plan` enum and `plan` column to `users` with its default. Applying them to a database at the current schema MUST succeed without altering any other table.

#### Scenario: The migrations are additive
- **WHEN** the generated migrations are applied to a database at the current schema
- **THEN** only `topic_invites`, the `scans.is_manual` column, and the `users.role` and `users.plan` columns are added
