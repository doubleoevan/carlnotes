## ADDED Requirements

### Requirement: Better Auth's sign-in tables persist alongside the domain schema
The schema SHALL define `sessions`, `accounts`, and `verifications` tables shaped to Better Auth's Drizzle adapter conventions, using the same plural-table naming as the existing `users` table. These tables SHALL be treated as sign-in identity infrastructure, not content-domain entities: they are exempt from the domain noun list the same way `users` already is.

#### Scenario: Schema exposes the Better Auth tables
- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a Drizzle table for each of `sessions`, `accounts`, and `verifications`, named consistently with the plural `users` table

### Requirement: A user's LiteLLM virtual key is stored on the user row
The `users` table SHALL carry a nullable column recording the user's provisioned LiteLLM virtual key. The column SHALL only ever be null before signup completes; a fully created user row SHALL always carry a non-null key.

#### Scenario: A created user always has a key
- **WHEN** a `users` row exists that was created through the signup flow
- **THEN** its LiteLLM virtual key column is non-null

### Requirement: Better Auth's `accounts` table is distinct from Integration
`accounts` (Better Auth-managed) SHALL represent only sign-in identity: the credential or OAuth grant a user authenticates with. The existing `Integration` entity SHALL remain the sole representation of a connected external account used for sourcing or delivery (e.g. Composio-managed Gmail). Neither SHALL substitute for the other: a Source or Subscription MUST NOT resolve credentials through `accounts`, and sign-in MUST NOT be implemented through `integrations`.

#### Scenario: A source's credentials never reference accounts
- **WHEN** a Source with credentials is inspected
- **THEN** it resolves them through `integration_id`, never through the `accounts` table

#### Scenario: Sign-in never reads Integration
- **WHEN** a user authenticates via password or OAuth
- **THEN** the session is established through Better Auth's `users`/`accounts`/`sessions` tables, and no `integrations` row is read or written
