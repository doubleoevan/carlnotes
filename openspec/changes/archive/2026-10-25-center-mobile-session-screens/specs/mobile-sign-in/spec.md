## MODIFIED Requirements

### Requirement: The session screens show the web's logo

Every session screen SHALL draw its content in the web's session column: at most 24rem wide, centered across the
screen, with the web's padding, and centered down the screen while the content is shorter than the screen, scrolling
from its top when taller. Every session screen SHALL open with the web's sign-in logo, centered: the steaming coffee
mug at the web's 40 points beside the CarlNotes name in the `logo` type role. The mug SHALL be drawn from
`@carlnotes/nightshift/coffeeMug`, and its steam SHALL move as the web's does: still at its resting opacity on a screen
narrower than 48rem, as on a phone, and under reduced motion, and rising on a wider screen. The Google button SHALL
show Google's logo before its label, and the Apple button on Android SHALL show Apple's logo, both drawn from
`@carlnotes/nightshift/oauthProviderIcons`. The mug, the name, and the provider logos SHALL grow with the system text
size up to double, the 200 percent the web is built for, so the logo fits the column's width at every text size.
Switching between the sign-in and sign-up screens SHALL replace the screen instead of stacking a new one.

#### Scenario: The logo matches the web

- **WHEN** a visitor opens the sign-in screen at the default text size
- **THEN** the mug and the name show side by side as on the web's login page, and the Google button shows Google's
  logo before "Continue with Google"

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
- **THEN** the logo and the buttons sit in a column 24rem wide at most, centered across and down the screen, as on the
  web's login page at the same width
