## ADDED Requirements

### Requirement: The auth server trusts the mobile app's origins
The system SHALL add Better Auth's `expo()` plugin, first among the plugins, so a request that sends the app's
`expo-origin` header is checked by that origin. The trusted origins SHALL include the app's scheme, `carlnotes://`, as
one host-less pattern that trusts every url of the scheme, in every environment, and SHALL include `exp://` only when
`DOPPLER_ENVIRONMENT` is `dev`, the way the LAN origins are gated. The scheme SHALL be one constant in
`@carlnotes/contracts/mobileApp.ts` that the app's config and the api both read. A sign-in and a signup from the app
SHALL be reported with `entryPoint: "mobile"`, and a native social sign-in through `/sign-in/social` with an ID token
SHALL be reported with its provider as the method. The scheme SHALL be a redirect for the social sign-in alone: a
`callbackURL`, `redirectTo`, `errorCallbackURL`, or `newUserCallbackURL` on the scheme on any other path SHALL be
rejected, since any installed app can claim a scheme. The Expo plugin's authorization proxy, which sets the oauth
state cookie from its url, SHALL send a browser to a provider's sign-in page alone, and SHALL reject a browser that
already holds a session.

#### Scenario: The app's callback is trusted
- **WHEN** the app starts a social sign-in whose callback is `carlnotes:///`
- **THEN** Better Auth accepts the callback url, and the callback redirect to the app includes the session cookie

#### Scenario: An app request with a cookie passes the origin check
- **WHEN** the app posts to an auth route with its session cookie and `expo-origin: carlnotes://`
- **THEN** the origin check passes

#### Scenario: The development origin is trusted in dev alone
- **WHEN** a request arrives with `expo-origin: exp://192.168.1.5:8081`
- **THEN** it is trusted when `DOPPLER_ENVIRONMENT` is `dev`, and rejected in any other environment

#### Scenario: A native Apple sign-in is reported
- **WHEN** the app signs in through `/sign-in/social` with an Apple ID token
- **THEN** `login_completed` is reported with method `apple` and entry point `mobile`

#### Scenario: A reset link never opens the app
- **WHEN** a password reset request names `carlnotes:///` as its `redirectTo`
- **THEN** the request is rejected, and no reset link opens the scheme

#### Scenario: The authorization proxy sends a browser to a provider alone
- **WHEN** the proxy is asked for a url that is not a provider's sign-in page, or by a browser with a session cookie
- **THEN** the request is rejected, and the oauth state cookie is not set

### Requirement: An app's password signup is gated by device attestation
The system SHALL offer the app a gate beside the web's: `POST /api/signup-gate/app-challenge` returns a signed one-time
challenge that lives five minutes, and `POST /api/signup-gate/app` takes the challenge with a proof for its platform,
consumes the challenge, verifies the proof, and on success sets the same `signup_gate` cookie the web's gate sets, so
the signup route keeps one rule. An iOS proof is an App Attest attestation, verified by Apple's steps: the certificate
chain to Apple's App Attest root, the nonce over the authenticator data and the challenge's hash, the key id, the app
id from `APPLE_TEAM_ID` and the bundle identifier, a zero counter, and the production environment, or the development
environment too in dev. An Android proof is a Play Integrity token, decoded through Google's api with the service
account in `PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY`, whose verdict SHALL name the package, the challenge as its request
hash, a time inside five minutes, a Play-recognized app, and a device that meets device integrity. A `development`
proof SHALL pass only when `DOPPLER_ENVIRONMENT` is `dev`. A replayed challenge, a forged or altered proof, and a
missing proof SHALL be rejected with a 400, and each rejection SHALL be reported with its platform and reason. The
routes SHALL be limited to ten requests a minute per address. The api SHALL start without the Play Integrity key, and
reject Android proofs then. The web's Turnstile gate SHALL be unchanged.

#### Scenario: A valid attestation passes the gate
- **WHEN** a release build sends a fresh challenge with an attestation that verifies for the app id and environment
- **THEN** the response sets the `signup_gate` cookie, and the signup that sends it creates the account

#### Scenario: A replayed challenge is rejected
- **WHEN** a proof arrives with a challenge a previous proof already used
- **THEN** the gate rejects it with a 400 and sets no cookie

#### Scenario: A forged attestation is rejected
- **WHEN** an iOS proof's chain does not reach Apple's root, or its nonce, app id, counter, or environment does not
  match
- **THEN** the gate rejects it with a 400 and sets no cookie

#### Scenario: An unrecognized Android install is rejected
- **WHEN** an Android proof's verdict is not Play-recognized or does not meet device integrity
- **THEN** the gate rejects it with a 400 and sets no cookie

#### Scenario: A missing proof is rejected
- **WHEN** a request reaches the gate with no proof or a proof for an unknown platform
- **THEN** it is rejected with a 400

#### Scenario: The development proof passes in dev alone
- **WHEN** a development build sends the `development` proof
- **THEN** the dev api sets the cookie, and a production api rejects the proof

#### Scenario: The web's gate is unchanged
- **WHEN** the web's signup form passes Turnstile and signs up
- **THEN** the signup succeeds as before, with the same cookie and the same create hook

## MODIFIED Requirements

### Requirement: Password signup requires a passing Turnstile challenge
The email/password signup form SHALL require a Cloudflare Turnstile (Managed mode) token, verified server-side against
Cloudflare before a user is created. A passing check SHALL be sent to the signup in a signed gate cookie that lives five
minutes and passes one signup: the token's nonce is recorded in Redis when it is signed and consumed when it is checked,
so a replayed cookie creates no second account. While Redis is unreachable a token SHALL pass on its signature and
expiry alone, so signups keep working through an outage. The mobile app SHALL pass the same gate cookie from device
attestation instead of a Turnstile token, through the app gate, and the signup route SHALL read the one cookie
whichever gate set it. OAuth signup SHALL NOT require a Turnstile token.

#### Scenario: Password signup without a valid Turnstile token is rejected
- **WHEN** a password signup request is submitted with a missing or invalid Turnstile token
- **THEN** no `users` row is created and the request is rejected

#### Scenario: A gate cookie passes one signup
- **WHEN** a second password signup is sent with the gate cookie a first signup already used
- **THEN** it is rejected and no second `users` row is created

#### Scenario: OAuth signup does not require Turnstile
- **WHEN** a visitor signs up via Google or GitHub
- **THEN** the signup succeeds without a Turnstile token being collected or verified

#### Scenario: The app's gate cookie passes a signup
- **WHEN** a password signup arrives with the gate cookie the app gate set from a verified attestation
- **THEN** the signup succeeds through the same create hook, with no Turnstile token

### Requirement: The Apple provider accepts the iOS app's ID tokens
The Apple provider SHALL accept an ID token whose audience is the iOS app's bundle identifier, `com.carlnotes.app`.
The bundle identifier SHALL be one constant that the mobile app's config and the api both read. A native sign-in SHALL
post the ID token with the raw nonce the app made, whose SHA-256 the app gave Apple's sheet, and with the sheet's name
in the `user` field, which the provider reads as it reads the web callback's `user` field.

#### Scenario: The provider names the bundle identifier as its ID token audience
- **WHEN** the api configures the Apple provider
- **THEN** the provider's ID token audience is the bundle identifier that `apps/mobile/app.config.ts` uses

#### Scenario: A native ID token signs the app in
- **WHEN** the app posts an Apple ID token for the bundle identifier with its nonce and the sheet's name
- **THEN** the token verifies, the nonce matches by its hash, a first sign-in creates the user with that name, and the
  response sets the session cookie
