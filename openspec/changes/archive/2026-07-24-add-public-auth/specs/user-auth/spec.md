## ADDED Requirements

### Requirement: Users sign up and log in with email and password
The system SHALL support email/password signup and login through Better Auth, persisting users and sessions in Neon via the Drizzle adapter. A session SHALL be issued on successful signup or login and SHALL authenticate subsequent requests.

#### Scenario: A new user signs up with email and password
- **WHEN** a visitor submits a valid email and password on the signup form and passes the Turnstile check (see below)
- **THEN** a `users` row and a password `accounts` row are created, and the response establishes an authenticated session

#### Scenario: An existing user logs in
- **WHEN** a user submits the email and password of an existing account
- **THEN** an authenticated session is established without creating a new `users` row

### Requirement: Users sign in with Google or GitHub
The system SHALL support OAuth sign-in via Google and GitHub through Better Auth's social provider configuration. Each environment (dev, prd) SHALL use its own OAuth app registration (client id, secret, redirect URI), sourced from that environment's Doppler config.

#### Scenario: A new user signs up via Google
- **WHEN** a visitor completes the Google OAuth consent flow for the first time
- **THEN** a `users` row and a Google `accounts` row are created, and an authenticated session is established

#### Scenario: A new user signs up via GitHub
- **WHEN** a visitor completes the GitHub OAuth consent flow for the first time
- **THEN** a `users` row and a GitHub `accounts` row are created, and an authenticated session is established

### Requirement: An OAuth identity links to an existing user only on a verified matching email
When an OAuth sign-in's email matches an existing user's email, the OAuth provider asserts that email is verified, AND the existing user's own `emailVerified` is true, the system SHALL link the new `accounts` row to the existing `users` row rather than creating a second user. The system SHALL NOT link when either side's email is unverified.

#### Scenario: A password user who has verified their email later signs in with Google using the same verified email
- **WHEN** a user who signed up with email and password, and has since verified that email, later completes Google OAuth using the same email, and Google asserts that email is verified
- **THEN** the Google `accounts` row links to the existing `users` row and no second user is created

#### Scenario: An unverified matching email does not link
- **WHEN** an OAuth sign-in's email matches an existing user's email but the provider does not assert it verified
- **THEN** the system does not link the new identity to the existing user

#### Scenario: A password user who has not yet verified their email does not link on a race
- **WHEN** a user signs up with email and password and, before clicking their verification email, completes Google OAuth with the same email
- **THEN** the system does not link the new identity to the existing (still-unverified) user

### Requirement: A password signup triggers a non-blocking email verification
The system SHALL send a verification email when a user signs up with email and password, and SHALL mark that user's `emailVerified` true when they follow its link. The system SHALL NOT require a verified email to sign in or use the app.

#### Scenario: Signup sends a verification email
- **WHEN** a user completes email/password signup
- **THEN** a verification email is sent to their address

#### Scenario: Following the link verifies the email
- **WHEN** a user follows the link from their verification email
- **THEN** their `users` row has `emailVerified` set to true

#### Scenario: An unverified user can still use the app
- **WHEN** a user has signed up with email and password but has not yet followed the verification link
- **THEN** they can still log in and use the app; only implicit OAuth account linking (above) waits on verification

### Requirement: Password signup requires a passing Turnstile challenge
The email/password signup form SHALL require a Cloudflare Turnstile (Managed mode) token, verified server-side against Cloudflare before a user is created. OAuth signup SHALL NOT require a Turnstile token.

#### Scenario: Password signup without a valid Turnstile token is rejected
- **WHEN** a password signup request is submitted with a missing or invalid Turnstile token
- **THEN** no `users` row is created and the request is rejected

#### Scenario: OAuth signup does not require Turnstile
- **WHEN** a visitor signs up via Google or GitHub
- **THEN** the signup succeeds without a Turnstile token being collected or verified

### Requirement: Each user is provisioned a budgeted LiteLLM virtual key at signup
The system SHALL provision a LiteLLM virtual key with a per-key spend budget for every new user as part of signup, and SHALL persist that key on the user's row. If provisioning fails, signup SHALL fail and no user SHALL be created.

#### Scenario: A successful signup carries a virtual key
- **WHEN** a new user completes signup by any path
- **THEN** their `users` row has a non-null LiteLLM virtual key with a configured spend budget

#### Scenario: Key provisioning failure blocks signup
- **WHEN** the LiteLLM proxy is unreachable or rejects key creation during a signup attempt
- **THEN** no `users` row is created and the signup fails

### Requirement: Scan LLM calls bill to the topic owner's virtual key
The Scan pipeline SHALL route its LLM calls (embedding and scoring) through the owning user's LiteLLM virtual key rather than the shared master key, so a user's usage is billed against their own per-key budget.

#### Scenario: A scan for a user-owned topic uses that user's key
- **WHEN** a Scan runs for a Topic owned by a given user
- **THEN** the embedding and scoring calls that Scan makes are authenticated with that user's LiteLLM virtual key
