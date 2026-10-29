# Spec Delta

## MODIFIED Requirements

### Requirement: A visitor signs in to the app with Apple, Google, or email and password

The mobile app SHALL offer four ways to sign in, each ending in the same Better Auth session the web issues: Apple,
Google, GitHub, and email and password, in the web's order with GitHub between Google and Apple. On iOS, Apple SHALL
open the native Sign in with Apple sheet through `expo-apple-authentication` and send the sheet's ID token and the
request's nonce to `signIn.social`, which the api verifies against the app's bundle identifier. On Android, Apple SHALL
open Apple's web sign-in in the system browser through `expo-web-browser`. Google and GitHub SHALL open the system
browser on both platforms. A browser sign-in SHALL return to the app on the `carlnotes://` scheme with the session set.
Email and password SHALL sign in natively through `signIn.email`. A first sign-in with Apple, Google, or GitHub SHALL
create the account, as it does on the web, through the same profile mapping and account linking. A name that Apple's
sheet returns on the first authorization SHALL be sent in the sign-in's `idToken.user` field, which the provider reads
as it reads the web callback's `user` field, since Apple's ID token never holds it. **Forgot password** SHALL open the
web's reset page in the system browser. The sign-in screen SHALL say so when a sign-in did not open or did not
complete, in the words the web uses.

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

#### Scenario: GitHub signs in through the browser

- **WHEN** a visitor presses **Continue with GitHub** on either platform and authorizes the app
- **THEN** the browser returns to `carlnotes://` and the visitor is signed in, with a first sign-in's username proposed
  from the GitHub login as on the web

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

### Requirement: The router shows the sign-in screen to a visitor

Expo Router's `Stack.Protected` SHALL guard account-only screens on the session. Visitors SHALL reach Home, Search,
Plans, and public Topic, Profile, Team, Podcast Episode, invitation, and permitted note pages through the same native
routes as signed-in people. Account, Activity, personal Teams, Settings, and chat SHALL require a session, and a
visitor's link to one of them SHALL open sign-in and return to it after sign-in. Visitor reading SHALL use an isolated
memory-only query client, and a retiring session SHALL clear before public reading mounts. Creation and
account-dependent writes SHALL lead a visitor to sign-up with the web's prompt for that action and return them to
their screen. Server permissions SHALL remain authoritative. The public homepage SHALL begin with the web hero and
Featured Topics and hide per-account Finding actions.

#### Scenario: A visitor sees the sign-in screen

- **WHEN** a visitor chooses Log in or opens an account-only route
- **THEN** the native sign-in screen is available, account-only data remains guarded, and the route they opened shows
  after sign-in

#### Scenario: A visitor reads public pages

- **WHEN** the app opens without a session or the session logo is pressed
- **THEN** public reading is available, Plans included, and no account-only screen is reachable
- **AND** the menu offers Log in and Sign up

#### Scenario: A visitor attempts an account action

- **WHEN** a visitor presses New Topic, Follow, Join, or another account-dependent action
- **THEN** the app opens sign-up with the web's prompt for that action instead of sending the write, and the screen
  they left shows after sign-up

#### Scenario: An account leaves the app

- **WHEN** the account signs out or its session retires
- **THEN** visitor content cannot access its private cache, and session exit clears that cache
- **AND** visitor reading uses a separate memory-only cache

#### Scenario: A user sees the home screen

- **WHEN** the app opens with a session
- **THEN** Home shows the account's Feed and account-only routes become available
