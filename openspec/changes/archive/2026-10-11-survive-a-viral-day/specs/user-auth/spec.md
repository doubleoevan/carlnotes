## MODIFIED Requirements

### Requirement: Password signup requires a passing Turnstile challenge
The email/password signup form SHALL require a Cloudflare Turnstile (Managed mode) token, verified server-side against
Cloudflare before a user is created. A passing check SHALL be sent to the signup in a signed gate cookie that lives five
minutes and passes one signup: the token's nonce is recorded in Redis when it is signed and consumed when it is checked,
so a replayed cookie creates no second account. While Redis is unreachable a token SHALL pass on its signature and
expiry alone, so signups keep working through an outage. OAuth signup SHALL NOT require a Turnstile token.

#### Scenario: Password signup without a valid Turnstile token is rejected
- **WHEN** a password signup request is submitted with a missing or invalid Turnstile token
- **THEN** no `users` row is created and the request is rejected

#### Scenario: A gate cookie passes one signup
- **WHEN** a second password signup is sent with the gate cookie a first signup already used
- **THEN** it is rejected and no second `users` row is created

#### Scenario: OAuth signup does not require Turnstile
- **WHEN** a visitor signs up via Google or GitHub
- **THEN** the signup succeeds without a Turnstile token being collected or verified

### Requirement: The reset request is gated by the existing Turnstile challenge

The reset request SHALL be gated by the same Turnstile challenge and signed gate cookie that protect password signup,
verified server-side, failing closed if the cookie is missing, expired, or already used.

An unauthenticated endpoint that sends email on demand can be pointed at any address repeatedly, and every send costs
money and sender reputation. A challenge stops the automation instead of throttling it. Better Auth's own limiter also
holds the credential paths to ten requests a minute, so the challenge and the limiter back each other up.

#### Scenario: A request without a passing challenge is refused

- **WHEN** a reset request arrives with no gate cookie, an expired one, or one already used
- **THEN** it is refused and no email is sent

#### Scenario: A passing challenge allows the request

- **WHEN** a reset request arrives after a passing Turnstile check
- **THEN** it proceeds, and responds the same way it would for any address

### Requirement: Scan LLM calls bill to the topic owner's virtual key
The Scan pipeline SHALL route every LLM call a Scan makes (the search Source's query generation, embedding, and scoring)
through the Scan owner's LiteLLM virtual key instead of the shared master key: the Topic owner's for a scheduled Scan,
and the key of the user who started a manual Scan. A user's usage is billed against their own per-key budget.

#### Scenario: A scan for a user-owned topic uses that user's key
- **WHEN** a scheduled Scan runs for a Topic owned by a given user
- **THEN** the query generation, embedding, and scoring calls that Scan makes are authenticated with that user's LiteLLM
  virtual key

#### Scenario: A manual Scan bills the user who started it
- **WHEN** a user starts a manual Scan of a Topic they may scan and another user owns
- **THEN** the query generation, embedding, and scoring calls that Scan makes are authenticated with the starting user's
  LiteLLM virtual key

## ADDED Requirements

### Requirement: An auth email never holds the request that asked for it

The reset, verification, and change-of-address emails SHALL be sent in the background, and the request SHALL get its
response at once, so a slow or failing Resend never holds a signup, a reset request, or an address change. A send that
throws SHALL be logged and reported by its kind.

#### Scenario: Resend is slow during a signup burst

- **WHEN** a password signup's verification email waits for a Resend slot
- **THEN** the signup responds without waiting for the email

### Requirement: MCP client registration is limited to six hundred an hour per address

The MCP OAuth server's client registration, which takes no credential and writes a row, SHALL be limited to six hundred
registrations an hour per client address, far above one person's registrations, since a hosted AI app registers its
users' clients from a few shared addresses.

#### Scenario: A registration loop is limited

- **WHEN** one address registers a six hundred and first client inside an hour
- **THEN** the registration is rejected by the rate limit

#### Scenario: A hosted AI app's users connect on a busy day

- **WHEN** fifty users of one hosted AI app add the connector within an hour, all registering from the app's address
- **THEN** every registration succeeds
