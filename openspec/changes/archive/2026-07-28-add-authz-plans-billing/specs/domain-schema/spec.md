## MODIFIED Requirements

### Requirement: Users carry a platform role
The `users` table SHALL carry a `role` column, not null, defaulting to `user`, with `admin` marking platform operators — the authority axis from the roles-and-plans decision. The column SHALL be plain text (not an enum) to match Better Auth's admin plugin shape. This role SHALL be the authority input to the `isAllowed` gate: an `admin` bypasses entitlement checks and may act on any Topic, while a non-admin's Topic authority stays its `owner_id`. Operator-only data, such as Scan spend and the admin console, SHALL be gated on this role through the gate.

#### Scenario: The role defaults to user
- **WHEN** a user row is inserted without a role
- **THEN** `role` is `user`

#### Scenario: The role drives the gate
- **WHEN** the `isAllowed` gate evaluates authority or an entitlement for a user
- **THEN** it reads this `role`, allowing an `admin` to bypass entitlement checks and override Topic authority

### Requirement: Users carry a billing plan
The `users` table SHALL carry a `plan` column, not null, defaulting to `free`, backed by a `plan` enum of `free`, `plus`, and `premium` — the entitlement axis from the roles-and-plans decision. The plan SHALL drive the per-user entitlements resolved by the gate. The column SHALL be a projection of the user's active Billing Subscription, kept in sync from Stripe webhooks: a user with no active billing subscription SHALL read `free`.

#### Scenario: The plan defaults to free
- **WHEN** a user row is inserted without a plan
- **THEN** `plan` is `free`

#### Scenario: The plan projects the active billing subscription
- **WHEN** a user's active Billing Subscription changes or is cleared
- **THEN** the webhook updates `users.plan` to the derived plan, `free` when no active row remains

## ADDED Requirements

### Requirement: Billing Subscription is a Stripe-backed row distinct from the topic Subscription
The schema SHALL define a `billing_subscriptions` table carrying the owning user (cascade on delete), the Stripe customer id, the Stripe subscription id, the plan, the subscription status, and the current period end, with timestamps. It SHALL model at most one active row per user and SHALL be distinct from the topic `subscriptions` table (subscriber ↔ Topic): the two SHALL never be conflated in schema or code.

#### Scenario: The schema exposes billing_subscriptions
- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a `billing_subscriptions` Drizzle table with the user, Stripe customer id, Stripe subscription id, plan, status, and current period end

#### Scenario: Billing Subscription is not the topic Subscription
- **WHEN** the two tables are inspected
- **THEN** `billing_subscriptions` carries Stripe billing state while `subscriptions` carries the topic subscriber join, and neither references the other

### Requirement: Users carry a per-user budget override
The `users` table SHALL carry a nullable `budget_override_cents` column. When null, the user's effective monthly budget SHALL be their plan's monthly backstop; when set, the override SHALL take precedence in both directions. The effective budget SHALL be what the user's LiteLLM key budget is provisioned and resized to.

#### Scenario: A null override means the plan value
- **WHEN** `budget_override_cents` is null
- **THEN** the effective budget is the plan's monthly backstop

#### Scenario: A set override takes precedence
- **WHEN** `budget_override_cents` holds a value
- **THEN** the effective budget is that value, whether above or below the plan backstop

### Requirement: The change includes the authorization and billing migrations
The change SHALL include generated Drizzle migrations that create `billing_subscriptions` with its user cascade and add `budget_override_cents` to `users`. Applying them to a database at the current schema MUST succeed without altering any other table.

#### Scenario: The migrations are additive
- **WHEN** the generated migrations are applied to a database at the current schema
- **THEN** only the `billing_subscriptions` table and the `users.budget_override_cents` column are added
