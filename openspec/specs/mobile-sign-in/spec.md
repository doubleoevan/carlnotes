# mobile-sign-in Specification

## Purpose
TBD - created by archiving change add-mobile-sign-in. Update Purpose after archive.
## Requirements
### Requirement: A visitor signs in to the app with Apple, Google, or email and password

The mobile app SHALL offer three ways to sign in, each ending in the same Better Auth session the web issues: Apple,
Google, and email and password. On iOS, Apple SHALL open the native Sign in with Apple sheet through
`expo-apple-authentication` and send the sheet's ID token and the request's nonce to `signIn.social`, which the api
verifies against the app's bundle identifier. On Android, Apple SHALL open Apple's web sign-in in the system browser
through `expo-web-browser`. Google SHALL open the system browser on both platforms. A browser sign-in SHALL return to
the app on the `carlnotes://` scheme with the session set. Email and password SHALL sign in natively through
`signIn.email`. A first sign-in with Apple or Google SHALL create the account, as it does on the web, through the same
profile mapping and account linking. A name that Apple's sheet returns on the first authorization SHALL be sent in the
sign-in's `idToken.user` field, which the provider reads as it reads the web callback's `user` field, since Apple's ID
token never holds it. **Forgot password** SHALL open the web's reset page in the system browser. The sign-in screen
SHALL say so when a sign-in did not open or did not complete, in the words the web uses.

#### Scenario: Apple signs in through the native sheet on iOS

- **WHEN** a visitor presses **Continue with Apple** on an iPhone and completes Apple's sheet
- **THEN** the app sends the ID token and nonce to `signIn.social`, the api verifies the token for `com.carlnotes.app`,
  and the visitor is signed in without leaving the app

#### Scenario: Apple signs in through the browser on Android

- **WHEN** a visitor presses **Continue with Apple** on Android and completes Apple's web sign-in
- **THEN** the browser returns to `carlnotes://` and the visitor is signed in

#### Scenario: Google signs in through the browser

- **WHEN** a visitor presses **Continue with Google** on either platform and completes Google's consent
- **THEN** the browser returns to `carlnotes://` and the visitor is signed in

#### Scenario: Email and password sign in natively

- **WHEN** a visitor enters the email and password of an existing account and presses **Log in**
- **THEN** the app signs in through `signIn.email` with no browser

#### Scenario: A first Apple sign-in keeps the name

- **WHEN** a visitor signs in with Apple on iOS for the first time and the sheet returns their name
- **THEN** the new user's name is the name the sheet returned

#### Scenario: A sign-in that did not complete says so

- **WHEN** a visitor closes the browser before finishing, or the request fails
- **THEN** the screen says the sign-in didn't open, and the visitor can try another method

#### Scenario: A cancelled Apple sheet says nothing

- **WHEN** a visitor cancels Apple's sheet
- **THEN** the screen shows no line, and the visitor can try again or another method

#### Scenario: Forgot password opens the web

- **WHEN** a visitor presses **Forgot password?**
- **THEN** the web's reset page opens in the system browser

### Requirement: A visitor creates an account by email in the app

The app SHALL offer a native sign-up form that asks for what the web's signup form asks for, in the same order: email,
then password. The password SHALL be held to the signup minimum of 12 characters before the request, and the api's own
rules after it, with the api's message shown. Before the sign-up request, the app SHALL pass the app signup gate: it
asks the api for a one-time challenge, attests the install against it through `@expo/app-integrity`, and sends the
attestation to the gate route, which returns the signed gate token. The app SHALL send that token to the signup request
in the `signup_gate` cookie, which the signup route already reads, so the signup route keeps one rule. The visitor SHALL
see no challenge. A release build whose attestation is unsupported or rejected SHALL say that Carl could not verify this
install and offer the web's sign-up page in the system browser, where Turnstile gates it. A development build SHALL send
the development proof, which only the dev api accepts. A succeeded sign-up SHALL leave the user signed in and show the
web's verification notice copy.

#### Scenario: A visitor signs up by email on a release build

- **WHEN** a visitor enters an email and a password of 12 characters or more and presses **Sign up** on an App Store or
  Play Store install
- **THEN** the app attests the install, passes the gate, creates the account, and shows the home screen signed in, with
  no visible challenge

#### Scenario: A short password is caught before the request

- **WHEN** a visitor presses **Sign up** with a password shorter than 12 characters
- **THEN** the form says so and sends nothing

#### Scenario: An install that cannot attest is sent to the web

- **WHEN** a release build's attestation throws or the gate rejects it
- **THEN** the form says Carl could not verify this install and offers the web's sign-up page, and no account is created
  from the app

#### Scenario: A development build passes in dev

- **WHEN** a development build signs up against the dev api
- **THEN** it sends the development proof, the dev api accepts it, and the account is created

### Requirement: Every api request from the app sends the session

The Expo client SHALL keep the session cookie in `expo-secure-store` and send it as a `Cookie` header on every request
the auth client makes. `configureApiClient` SHALL take `headers`, a function whose headers every request sends, which
the typed `hc` client applies through its `headers` option and `fetchApi`, the one plain fetch every client module uses,
applies to its request. The app SHALL configure `headers` to return the stored session cookie, and no client module
SHALL read or send a cookie itself. Every plain fetch in `@carlnotes/client` SHALL go through `fetchApi`, including the
six that send a bare path today, so each reaches the configured base url. The web SHALL configure no `headers` and keep
its same-origin cookies.

#### Scenario: A typed call sends the session cookie

- **WHEN** the app calls a typed `hc` route while signed in
- **THEN** the request has the stored session cookie in its `Cookie` header

#### Scenario: A plain fetch sends the session cookie

- **WHEN** the app calls a client function that fetches through `fetchApi` while signed in
- **THEN** the request has the stored session cookie in its `Cookie` header and goes to the configured base url

#### Scenario: The web sends no header of its own

- **WHEN** the web app makes a typed call or a plain fetch
- **THEN** the request has no header the client added, and the browser sends its same-origin cookies as before

#### Scenario: A bare path reaches the base url

- **WHEN** the app posts a chat message or a chat room message, or sends a voice request
- **THEN** the request goes to the configured api base url, not to a relative path

### Requirement: The app opens signed in and leaves on a revoked session

The Expo client SHALL cache the session in secure storage, so the app opens on the home screen with no loading state
while the session is current. `configureApiClient` SHALL take `onUnauthorized`, which the client calls once for a
response with status 401 from any typed call or plain fetch. The app SHALL configure it to re-read the session, which a
revoked session returns as signed out, so the router shows the sign-in screen. The sign-in screen SHALL make no
signed-in request, so a revoked session returns the user to it once and never loops. Signing out SHALL clear the stored
cookie and the cached session.

#### Scenario: The app opens signed in

- **WHEN** a user quits the app and opens it again
- **THEN** the home screen shows at once with their name and avatar, with no loading state before it

#### Scenario: A password reset on the web signs the app out

- **WHEN** a user resets their password on the web while signed in on the app, then opens a screen that requests the api
- **THEN** the request's 401 re-reads the session, the session is signed out, and the sign-in screen shows once

### Requirement: The router shows the sign-in screen to a visitor

Expo Router's `Stack.Protected` SHALL guard the app's screens on the session: a visitor sees the sign-in screen and its
sign-up path, and a user sees the home screen with their name and avatar from the session through `useAvatar`, and the
settings screen. The screens SHALL be built from Nightshift tokens through Uniwind and meet the accessibility bar.
Apple's button SHALL follow Apple's Human Interface Guidelines for Sign in with Apple: the Apple logo, the **Continue
with Apple** wording, and a height and corner radius that match the other buttons.

#### Scenario: A visitor sees the sign-in screen

- **WHEN** the app opens with no session
- **THEN** the sign-in screen shows, and no guarded screen is reachable

#### Scenario: A user sees the home screen

- **WHEN** the app opens with a session
- **THEN** the home screen shows the user's name and avatar, and the settings screen is reachable

### Requirement: A user signs out or closes their account from the settings screen

The settings screen SHALL offer **Sign out** and **Close account**. Sign out SHALL call `signOut` in one press, as the
web does, and a failure SHALL show the web's line. Close account SHALL confirm with the web's words, call the existing
`DELETE /api/users/me` through `sendDeleteAccount`, and return the user to the sign-in screen signed out. A close that
fails SHALL show the web's line and leave the user signed in.

#### Scenario: Sign out returns to the sign-in screen

- **WHEN** a user presses **Sign out**
- **THEN** the session ends, the stored cookie is cleared, and the sign-in screen shows

#### Scenario: Close account confirms, then closes

- **WHEN** a user presses **Close account** and confirms
- **THEN** the account is closed through `DELETE /api/users/me`, and the sign-in screen shows

#### Scenario: The confirmation can be declined

- **WHEN** a user presses **Close account** and declines
- **THEN** nothing is closed and the settings screen is unchanged

