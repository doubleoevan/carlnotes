## ADDED Requirements

### Requirement: Prompt Version is an append-only history of a Topic's prompt
The schema SHALL hold `topic_prompt_versions`: a Topic reference that cascades on delete, the prompt text, a nullable reference to the user who saved it, cleared when that account closes, an origin of `editor`, `chat`, or `mcp`, and a creation time, indexed by Topic and time. Rows SHALL never be updated. There is no version number column. The time order is the history.

#### Scenario: A deleted Topic takes its history with it
- **WHEN** a Topic is deleted
- **THEN** its Prompt Version rows are gone

#### Scenario: The Topic keeps its history when an account closes
- **WHEN** a user who saved a version closes their account
- **THEN** the version row stays with its user reference cleared

### Requirement: Better Auth's OAuth provider tables persist beside the sign-in tables
The schema SHALL hold `oauth_applications`, `oauth_access_tokens`, and `oauth_consents` shaped to Better Auth's `mcp` plugin models, with the same plural naming and plain timestamps without time zone as `sessions`, `accounts`, and `verifications`. They are identity plumbing like those tables, and no Source or Subscription SHALL reference them.

#### Scenario: A registered client's token resolves to its user
- **WHEN** a client registers dynamically and a user consents
- **THEN** a row exists in each of `oauth_applications`, `oauth_consents`, and `oauth_access_tokens`, and the token lookup resolves to the user

### Requirement: The change includes the prompt version and OAuth migration
The change SHALL include one generated migration creating the four tables, applied on deploy.

#### Scenario: The migration creates the tables
- **WHEN** the migration runs against an empty schema
- **THEN** `topic_prompt_versions`, `oauth_applications`, `oauth_access_tokens`, and `oauth_consents` exist with their references and indexes
