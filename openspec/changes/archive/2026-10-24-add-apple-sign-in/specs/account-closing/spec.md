## ADDED Requirements

### Requirement: Closing an account revokes its Sign in with Apple tokens
Closing an account that signed in with Apple SHALL post each Apple refresh token that its `accounts` rows hold to
Apple's revoke endpoint, `https://appleid.apple.com/auth/revoke`, before the `users` row is deleted. The revoke SHALL
sign with the Apple provider's current client secret, and the revokes SHALL run at once, so a slow Apple holds the close
for one timeout at most. The close SHALL NOT send a stored access token, since a native client can store one unchecked.
Revoking spends no money, so a revoke that fails or times out SHALL be reported with Apple's reason and SHALL NOT abort
the close. While Apple is off, the close SHALL skip the revoke.

#### Scenario: A closed account's Apple tokens are revoked
- **WHEN** an account with an Apple `accounts` row is closed
- **THEN** its refresh token is posted to Apple's revoke endpoint with the Services ID and the current client secret,
  before the `users` row is deleted

#### Scenario: An Apple account without a refresh token sends nothing
- **WHEN** a closing account's Apple row holds no refresh token
- **THEN** the close sends no revoke for that row

#### Scenario: A failed revoke does not stop the close
- **WHEN** Apple rejects the revoke or does not answer in time
- **THEN** the failure is reported, and the account still closes

#### Scenario: No revoke while Apple is off
- **WHEN** an account is closed while the Apple provider is off
- **THEN** the close sends no revoke and reads no Apple tokens
