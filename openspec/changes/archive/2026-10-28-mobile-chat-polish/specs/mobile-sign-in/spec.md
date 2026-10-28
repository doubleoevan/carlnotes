## MODIFIED Requirements

### Requirement: The router shows the sign-in screen to a visitor

Expo Router's `Stack.Protected` SHALL guard account-only screens on the session. Visitors SHALL reach Home, Search,
and public Topic, Profile, Team, and permitted note pages through the same native routes as signed-in people.
Account, Activity, personal Teams, Plans, Settings, and chat SHALL require a session. Visitor reading SHALL use
an isolated memory-only query client, and a retiring session SHALL clear before public reading mounts.
Creation and account-dependent writes SHALL lead a visitor to sign-up. Server permissions SHALL remain authoritative.
The public homepage SHALL begin with Featured Topics and hide per-account Finding actions.

#### Scenario: A visitor sees the sign-in screen

- **WHEN** a visitor chooses Log in or opens an account-only route
- **THEN** the native sign-in screen is available and account-only data remains guarded

#### Scenario: A visitor reads public pages

- **WHEN** the app opens without a session or the session logo is pressed
- **THEN** public reading is available and no account-only screen is reachable
- **AND** the menu offers Log in and Sign up

#### Scenario: A visitor attempts an account action

- **WHEN** a visitor presses New Topic, Follow, Join, or another account-dependent action
- **THEN** the app opens sign-up instead of sending the write

#### Scenario: An account leaves the app

- **WHEN** the account signs out or its session retires
- **THEN** visitor content cannot access its private cache, and session exit clears that cache
- **AND** visitor reading uses a separate memory-only cache

#### Scenario: A user sees the home screen

- **WHEN** the app opens with a session
- **THEN** Home shows the account's Feed and account-only routes become available

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
The logo SHALL link to the public homepage. Session screens SHALL omit the global footer. The form-switch prompt and link SHALL share a centered, wrapping row.
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

#### Scenario: The session logo opens public reading

- **WHEN** a visitor presses the CarlNotes logo on sign-in or sign-up
- **THEN** the native public homepage opens without asking for credentials

#### Scenario: Session navigation fits the phone

- **WHEN** the sign-in or sign-up form renders
- **THEN** its form-switch prompt and link align on the same row where space permits and wrap together on narrower screens
- **AND** the global footer is absent
