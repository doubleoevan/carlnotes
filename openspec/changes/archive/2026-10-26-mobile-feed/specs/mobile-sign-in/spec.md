# Spec Delta

## MODIFIED Requirements

### Requirement: The app opens signed in and leaves on a revoked session

The Expo client SHALL cache the session in secure storage, so the app opens on the home screen with no authentication
loading state while the session is current. `configureApiClient` SHALL take `onUnauthorized`, which the client calls
once for a response with status 401 from any typed call or plain fetch. A revoked session SHALL return the user to
the sign-in screen and clear the previous user's live and persisted Feed data. The sign-in screen SHALL make no
signed-in request, so a revoked session returns the user to it once and never loops. Signing out SHALL clear the
stored cookie, cached session, and account-bound Feed cache.

#### Scenario: The app opens signed in

- **WHEN** a user quits the app and opens it again
- **THEN** Home shows without an authentication loading state, restores any compatible saved Feed, and makes the user's name and avatar available in Settings

#### Scenario: A password reset on the web signs the app out

- **WHEN** a user resets their password on the web while signed in on the app, then opens a screen that requests the api
- **THEN** the request's 401 ends the revoked session, clears its Feed caches, and shows the sign-in screen once

### Requirement: The router shows the sign-in screen to a visitor

Expo Router's `Stack.Protected` SHALL guard the app's screens on the session: a visitor sees the sign-in screen and its
sign-up path, and a user sees the Home Feed, Settings tab, and Topic screens. Settings SHALL show the user's name and
avatar from the session through `useAvatar`. The screens SHALL be built from Nightshift tokens through Uniwind and
meet the accessibility bar. Apple's button SHALL follow Apple's Human Interface Guidelines for Sign in with Apple:
the Apple logo, the **Continue with Apple** wording, and a height and corner radius that match the other buttons.

#### Scenario: A visitor sees the sign-in screen

- **WHEN** the app opens with no session
- **THEN** the sign-in screen shows, and no guarded screen is reachable

#### Scenario: A user sees the home screen

- **WHEN** the app opens with a session
- **THEN** Home shows the Feed, Settings shows the user's name and avatar, and opening a Topic stays inside the guarded navigation

### Requirement: A user signs out or closes their account from the settings screen

The settings screen SHALL offer **Sign out** and **Close account**. Sign out SHALL call `signOut` in one press, as the
web does, and a failure SHALL show the web's line. Session exit SHALL stop account-bound query persistence and clear
the account's live and saved Feed data. Close account SHALL confirm with the web's words, call the existing
`DELETE /api/users/me` through `sendDeleteAccount`, and return the user to the sign-in screen signed out. A close that
fails SHALL show the web's line and leave the user signed in. A successful close SHALL clear Feed data even if its
subsequent sign-out request fails.

#### Scenario: Sign out returns to the sign-in screen

- **WHEN** a user presses **Sign out** and the request succeeds
- **THEN** the session ends, its stored cookie and Feed caches are cleared, and the sign-in screen shows

#### Scenario: Close account confirms, then closes

- **WHEN** a user presses **Close account** and confirms
- **THEN** the account is closed through `DELETE /api/users/me`, its Feed caches are cleared, and the sign-in screen shows

#### Scenario: The confirmation can be declined

- **WHEN** a user presses **Close account** and declines
- **THEN** nothing is closed and the settings screen is unchanged

#### Scenario: Account deletion fails

- **WHEN** the account deletion request fails
- **THEN** the user stays signed in, their Feed cache remains usable, and the existing failure line is shown

### Requirement: The session screens show the web's logo

The sign-in and sign-up screens SHALL draw their content in the web's session column: at most 24rem wide, centered
across the screen, with the web's padding, and centered down the screen while the content is shorter than the screen,
scrolling from its top when taller. Each form SHALL open with the web's sign-in logo, centered: the steaming coffee
mug at the web's 40 points beside the CarlNotes name in the `logo` type role. The mug SHALL be drawn from
`@carlnotes/nightshift/coffeeMug`, and its steam SHALL move as the web's does: still at its resting opacity on a screen
narrower than 48rem, as on a phone, and under reduced motion, and rising on a wider screen. The Google button SHALL
show Google's logo before its label, and the Apple button on Android SHALL show Apple's logo, both drawn from
`@carlnotes/nightshift/oauthProviderIcons`. The mug, the name, and the provider logos SHALL grow with the system text
size up to double, the 200 percent the web is built for, so the logo fits the column's width at every text size.
Switching between the sign-in and sign-up screens SHALL replace the screen instead of stacking a new one.
Authenticated Settings SHALL use the shared application header instead of a second centered sign-in logo.

#### Scenario: The logo matches the web

- **WHEN** a visitor opens the sign-in screen at the default text size
- **THEN** the mug and the name show side by side as on the web's login page, and the Google button shows Google's logo before "Continue with Google"

#### Scenario: The logo fits at the largest text size

- **WHEN** the system text size is the largest accessibility size and a visitor opens the sign-in screen
- **THEN** the mug and the whole CarlNotes name show on one line inside the screen, each at double its size

#### Scenario: The steam holds still under reduced motion

- **WHEN** the system's reduce motion setting is on and a visitor opens the sign-in screen
- **THEN** the steam wisps show at their resting opacity and do not move

#### Scenario: The steam holds still on a phone

- **WHEN** a visitor opens the sign-in screen on a phone, narrower than 48rem
- **THEN** the steam wisps hold still at their resting opacity, as the web's do on a phone-width screen

#### Scenario: Switching forms replaces the screen

- **WHEN** a visitor taps Sign up on the sign-in screen and then swipes back from the edge
- **THEN** the sign-up screen stays, since it replaced the sign-in screen instead of stacking on it

#### Scenario: A tablet shows the web's column

- **WHEN** a visitor opens the sign-in screen on an iPad
- **THEN** the logo and the buttons sit in a column 24rem wide at most, centered across and down the screen, as on the web's login page at the same width

#### Scenario: Settings shows the application header once

- **WHEN** a user opens Settings
- **THEN** the compact shared header appears once above the account identity and settings controls
