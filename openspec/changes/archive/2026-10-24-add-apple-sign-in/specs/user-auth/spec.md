## ADDED Requirements

### Requirement: Users sign in with Apple
The system SHALL support Sign in with Apple through Better Auth's `apple` provider, beside Google and GitHub, with a
**Continue with Apple** button on the login and signup pages. Each environment (dev, prd) SHALL use its own Services ID
from that environment's Doppler config. The provider SHALL map Apple's profile through the same canonical address
mapping as Google's. The system SHALL trust `https://appleid.apple.com` as an origin, since Apple posts its callback.

#### Scenario: A new user signs up via Apple
- **WHEN** a visitor completes the Apple consent flow for the first time
- **THEN** a `users` row and an Apple `accounts` row are created, and an authenticated session is established

#### Scenario: The name from the first authorization is kept
- **WHEN** Apple's first authorization posts the user's name in the callback's `user` field
- **THEN** the `users` row created in that request holds the name

#### Scenario: A returning user whose ID token has no email signs in
- **WHEN** a user who signed up with Apple signs in again and Apple's ID token has no email
- **THEN** the sign-in uses the email of the user who holds that Apple account, and the user signs in

#### Scenario: A later sign-in has no name
- **WHEN** a later Apple sign-in posts no `user` field
- **THEN** the name is empty, and the user's stored name does not change

#### Scenario: A Hide My Email user signs up
- **WHEN** a visitor signs up through Apple and chooses to hide their email
- **THEN** the user is created with the private relay address as their email, on `@privaterelay.appleid.com` or on
  `@private.icloud.com`, Apple's domain for new addresses from late 2026

#### Scenario: A verified matching email links
- **WHEN** a user who has verified their email later completes Apple sign-in with the same email, and Apple asserts
  that email is verified
- **THEN** the Apple `accounts` row links to the existing `users` row and no second user is created

#### Scenario: An unverified Apple email does not link
- **WHEN** Apple sign-in arrives with an email that matches an existing user, and Apple does not assert it is verified
- **THEN** the Apple `accounts` row does not link to that user

#### Scenario: The posted callback ends signed in
- **WHEN** Apple posts the callback from `https://appleid.apple.com`
- **THEN** the origin check passes, the browser follows the redirect to the app's own callback with the Lax state
  cookie, and the session cookie is set

#### Scenario: A posted callback from another origin is rejected
- **WHEN** a callback is posted with a cookie from any origin that is not trusted
- **THEN** the origin check rejects it

#### Scenario: A redirect to Apple is never trusted
- **WHEN** a request names a url on `https://appleid.apple.com` as its redirect, as a password reset's `redirectTo`
- **THEN** Better Auth rejects the url, since Apple's origin is trusted only for Apple's posted callback

#### Scenario: A provider sign-in that will not open says so
- **WHEN** a visitor presses a provider's button and the sign-in does not open, as when Apple is off
- **THEN** the page says the sign-in didn't open under the provider buttons

#### Scenario: Apple sign-in works inside an in-app browser
- **WHEN** a visitor opens the sign-in page inside another app's embedded browser
- **THEN** the **Continue with Apple** button is enabled

### Requirement: Apple's client secret is signed at runtime from four values
The system SHALL sign Apple's client secret at runtime as an ES256 JWT with the `.p8` key, from `APPLE_CLIENT_ID`,
`APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`, valid for 30 days, well under Apple's limit of 15,777,000
seconds. The system SHALL NOT store a client secret. A running api SHALL sign a new secret every week. Apple sign-in
SHALL be optional: the api SHALL start in every environment with any of the four values unset, and with a key that will
not sign, and register no Apple provider then.

#### Scenario: The secret is signed from the four values
- **WHEN** the api starts with all four values set
- **THEN** the client secret is a JWT whose header names ES256 and the key id, whose claims name the team id as issuer,
  the Services ID as subject, and `https://appleid.apple.com` as audience, and whose expiry is 30 days after it was
  issued

#### Scenario: A key pasted on one line still signs
- **WHEN** `APPLE_PRIVATE_KEY` has literal `\n` sequences where the `.p8` file's line breaks were
- **THEN** the key's line breaks are restored and the secret signs

#### Scenario: The api starts without the values
- **WHEN** the api starts in any environment with any of the four values unset
- **THEN** the api starts and registers no Apple provider

#### Scenario: A key that will not sign leaves Apple off
- **WHEN** the four values are set and the key will not sign
- **THEN** the api starts, registers no Apple provider, and reports the error

#### Scenario: A running api signs a new secret
- **WHEN** a week has passed since the last secret was signed
- **THEN** the provider uses a newly signed secret with a later issue time, and keeps the current one if signing fails

### Requirement: The Apple provider accepts the iOS app's ID tokens
The Apple provider SHALL accept an ID token whose audience is the iOS app's bundle identifier, `com.carlnotes.app`.
The bundle identifier SHALL be one constant that the mobile app's config and the api both read.

#### Scenario: The provider names the bundle identifier as its ID token audience
- **WHEN** the api configures the Apple provider
- **THEN** the provider's ID token audience is the bundle identifier that `apps/mobile/app.config.ts` uses
