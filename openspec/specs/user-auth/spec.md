# user-auth Specification

## Purpose
TBD - created by archiving change add-public-auth. Update Purpose after archive.
## Requirements
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
The system SHALL provision a LiteLLM virtual key with a per-key spend budget for every new user as part of signup, and SHALL persist that key on the user's row. The budget SHALL be the user's effective monthly budget — their plan's monthly backstop, or their per-user override when set — sourced from the plans catalog rather than a hardcoded constant. The key budget SHALL be resized when the user's plan changes or their budget override changes. If provisioning fails, signup SHALL fail and no user SHALL be created.

#### Scenario: A successful signup carries a virtual key
- **WHEN** a new user completes signup by any path
- **THEN** their `users` row has a non-null LiteLLM virtual key whose spend budget equals their effective monthly budget (the free plan's backstop for a new user with no override)

#### Scenario: Key provisioning failure blocks signup
- **WHEN** the LiteLLM proxy is unreachable or rejects key creation during a signup attempt
- **THEN** no `users` row is created and the signup fails

#### Scenario: A plan or override change resizes the budget
- **WHEN** a user's plan changes through billing, or an admin sets or clears their budget override
- **THEN** their LiteLLM key budget is resized to the new effective monthly budget

### Requirement: Scan LLM calls bill to the topic owner's virtual key
The Scan pipeline SHALL route its LLM calls (embedding and scoring) through the owning user's LiteLLM virtual key rather than the shared master key, so a user's usage is billed against their own per-key budget.

#### Scenario: A scan for a user-owned topic uses that user's key
- **WHEN** a Scan runs for a Topic owned by a given user
- **THEN** the embedding and scoring calls that Scan makes are authenticated with that user's LiteLLM virtual key

### Requirement: The session forms lead with the path that can succeed in the current browser

The login and signup forms SHALL detect an in-app browser from the user agent and, when one is found, present the email path first with its fields already open, rather than folded behind a link.

Google rejects OAuth inside an embedded webview and answers `403 disallowed_useragent`, so leading with a provider button there offers a path that cannot complete. Ordering by what can succeed is the whole of this requirement: the forms, their submit handlers, and the signup Turnstile check SHALL be unchanged.

In an ordinary browser the order SHALL stay as it is, with the provider buttons first and the email path revealed on request.

#### Scenario: A visitor arrives from a social app

- **GIVEN** a visitor opening the signup or login route inside an in-app browser
- **WHEN** the form renders
- **THEN** the email fields are already visible and come before the provider buttons

#### Scenario: A visitor arrives in an ordinary browser

- **GIVEN** a visitor opening the same route in a browser that is not embedded
- **WHEN** the form renders
- **THEN** the provider buttons come first and the email path stays behind its reveal, unchanged from today

#### Scenario: Both routes behave alike

- **WHEN** either the login or the signup route renders inside an in-app browser
- **THEN** both lead with email, since they share one layout and neither route decides this for itself

### Requirement: Provider buttons stay available inside an in-app browser

The provider buttons SHALL remain visible and enabled inside an in-app browser, below the email path. They SHALL NOT be hidden or disabled.

Detection reads a user agent, which is a guess rather than a fact: a webview we fail to recognize would otherwise lose a working button, and a visitor who knows their own browser keeps the choice. Not every provider fails either — the rejection is Google's, and other providers may complete in the same webview.

#### Scenario: The buttons survive the reorder

- **GIVEN** a visitor in an in-app browser
- **WHEN** the form renders with email first
- **THEN** the provider buttons are still present, still enabled, and still submit to the same handlers

### Requirement: The reorder explains itself in Carl's voice

A short notice SHALL accompany the reordered form, saying why email is being offered first, so the demotion reads as help rather than a page that is broken or arbitrary.

The notice SHALL be shown only when an in-app browser is detected.

#### Scenario: The notice appears with the reorder

- **WHEN** the form leads with email because an in-app browser was detected
- **THEN** a short notice explains why, in the product's own voice

#### Scenario: No notice in an ordinary browser

- **WHEN** the form renders in a browser that is not embedded
- **THEN** no notice is shown

### Requirement: Android offers a way back to a real browser, iOS names one

Inside an in-app browser on Android, the notice SHALL offer a link that reopens the current page in Chrome through an `intent://` url.

iOS offers no equivalent, so on iOS the notice SHALL instead tell the visitor to open the page from the in-app browser's own menu. The copy SHALL differ by platform rather than offering a link that cannot work.

#### Scenario: Android gets a link out

- **GIVEN** a visitor in an in-app browser on Android
- **WHEN** the notice renders
- **THEN** it offers a link that reopens the current page in Chrome

#### Scenario: iOS is told where to look

- **GIVEN** a visitor in an in-app browser on iOS
- **WHEN** the notice renders
- **THEN** it names the in-app browser's own menu as the way out, and offers no link that would fail

#### Scenario: The escape hatch never strands the visitor

- **WHEN** a visitor stays in the in-app browser rather than taking either route out
- **THEN** the email path in front of them still completes a signup or login on its own

