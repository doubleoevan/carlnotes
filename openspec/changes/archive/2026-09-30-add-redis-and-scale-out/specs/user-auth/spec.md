## ADDED Requirements

### Requirement: A session is read from Redis and kept in Postgres

Better Auth SHALL be configured with the Redis store as its secondary storage and with sessions still stored in the database. A session SHALL be written to Postgres and to Redis when it is created, read from Redis first on every request, and read from Postgres if Redis has no copy or cannot be reached. A session Better Auth refreshes from Postgres SHALL be written to Redis at that refresh if Redis holds no copy, with its remaining lifetime, so a session that predates Redis or a Redis restart is copied to Redis within a day. Signing out, revoking sessions on a password reset or change, and closing an account SHALL delete the session from both stores. A sign-out or a password reset or change that cannot reach Redis leaves the session's Redis copy in place, and once Redis answers again that copy works until its next daily refresh deletes it. Every session row Better Auth deletes from Postgres SHALL have its token deleted from Redis too, whether or not the user's active-sessions list named it. An account close SHALL revoke the user's Redis sessions explicitly, since the app closes accounts outside Better Auth. It SHALL read the tokens from Postgres, so a token the list missed is deleted too. If Redis is configured and does not answer that revocation, the close SHALL be rejected with nothing deleted. Otherwise the close SHALL revoke again just before the row is deleted, so a session cached while the account was closing is signed out too. A failure of that second revocation SHALL be reported and SHALL NOT stop the close, since the steps before it cannot be repeated. A session cached while the account was closing then works until its next daily refresh. A direct write to the plan, the role, the username, the avatar, or the invite-access setting, each a field the session returns, SHALL rewrite every one of the user's Postgres sessions that Redis still holds with the user's fresh row, so the next request reads the new value, and SHALL never write back a session deleted meanwhile. A session whose Postgres row is gone SHALL stop authenticating at its next daily refresh, which SHALL delete its Redis copy. The Redis reads and writes SHALL go through the Redis store's wrapper, so a Redis failure is a miss and never an error, and a Redis outage or restart SHALL sign nobody out. Better Auth's own sign-in rate limiter, which counts in secondary storage once it is configured, SHALL count in Redis atomically through the Redis store's fixed-window counter and SHALL allow a request while Redis is unreachable. Better Auth's verification values, which hold password reset and email verification links, OAuth sign-in state, and MCP authorization codes, SHALL be written to Postgres and to Redis and read from Redis first with Postgres behind it, so an unreachable or restarted Redis never breaks a sign-in, a reset, or a verification. A password reset SHALL delete the user's other reset links from both stores.

#### Scenario: A request reads no session from Postgres

- **WHEN** a signed-in user's request arrives while Redis holds their session
- **THEN** the session is read from Redis and the request sends no session query to Postgres

#### Scenario: Redis down, still signed in

- **WHEN** Redis is unreachable and a signed-in user's request arrives
- **THEN** the session is read from Postgres and the request is served as signed in

#### Scenario: A Redis restart signs nobody out

- **WHEN** Redis restarts empty while users hold sessions
- **THEN** every session is still read from Postgres, and each is written back to Redis at its next daily refresh

#### Scenario: Signing out clears both stores

- **WHEN** a user signs out while Redis answers
- **THEN** the session is deleted from Redis and from Postgres, and its token authenticates nothing

#### Scenario: Closing an account signs it out everywhere

- **WHEN** a user closes their own account, or an admin closes another user's, while Redis answers
- **THEN** every session of that user is deleted from Redis and from Postgres before the user row is deleted, and the next request with their cookie is served signed out

#### Scenario: Closing an account needs Redis

- **WHEN** Redis is configured and unreachable and a user or an admin closes an account
- **THEN** the close is rejected with a 503 asking to try again, and nothing of the account is deleted

#### Scenario: A revocation reaches a token the list missed

- **WHEN** a user resets their password while one of their sessions is in Redis but missing from their active-sessions list
- **THEN** that session's token is deleted from Redis with its Postgres row, and it authenticates nothing

#### Scenario: A revocation during a Redis outage ends within a day

- **WHEN** a user resets their password while Redis is unreachable, and Redis comes back still holding one of their old sessions
- **THEN** that session authenticates at most until its next daily refresh, which finds no Postgres row, deletes its Redis copy, and serves the request signed out

#### Scenario: A renamed user sees the new name at once

- **WHEN** a user changes their username or avatar, or an admin changes their role, or a Stripe webhook changes their plan
- **THEN** the next request's session returns the new value, from Redis

#### Scenario: The sign-in limiter fails open

- **WHEN** Redis is unreachable and a visitor attempts to sign in
- **THEN** the attempt is not rejected for a rate limit, and the credential check runs as usual

#### Scenario: A reset link survives a Redis restart

- **WHEN** Redis restarts empty after a user requests a password reset
- **THEN** the reset link still works, read from Postgres

#### Scenario: A password reset voids the user's other reset links

- **WHEN** a user resets their password while another reset link of theirs is unused
- **THEN** that link is deleted from Postgres and from Redis, and it resets nothing
