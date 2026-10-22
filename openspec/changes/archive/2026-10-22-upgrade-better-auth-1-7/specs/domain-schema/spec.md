## MODIFIED Requirements

### Requirement: Better Auth's OAuth provider tables persist beside the sign-in tables
The schema SHALL hold `jwks`, `oauth_clients`, `oauth_resources`, `oauth_client_resources`, `oauth_refresh_tokens`,
`oauth_access_tokens`, `oauth_consents`, and `oauth_client_assertions`, shaped to the models of Better Auth's `mcp`,
`jwt`, and `cimd` plugins, with the same plural naming and plain timestamps without time zone as `sessions`, `accounts`,
and `verifications`, text arrays and jsonb where the models hold lists and JSON, and every row a user or a client owns
deleted with it. They are identity plumbing like those tables, and no Source or Subscription SHALL reference them.

#### Scenario: A registered client's token resolves to its user
- **WHEN** a client registers dynamically and a user consents
- **THEN** a row exists in `oauth_clients` and in `oauth_consents`, the access token is a JWT the server verifies
  against a key in `jwks`, and it resolves to the user

### Requirement: The change includes the prompt version and OAuth migration
The migrations SHALL create `topic_prompt_versions` and the OAuth provider tables, applied on deploy. The 1.6 tables
`oauth_applications`, `oauth_access_tokens`, and `oauth_consents` SHALL be dropped before the 1.7 tables are created.

#### Scenario: The migration creates the tables
- **WHEN** the migrations run against an empty schema
- **THEN** `topic_prompt_versions` and every OAuth provider table exist with their references and indexes, and
`oauth_applications` does not
