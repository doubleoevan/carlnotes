## MODIFIED Requirements

### Requirement: A user closes their own account

The account page SHALL offer a control that closes the signed-in user's own account, placed last on the page and styled as the destructive action it is. The control SHALL ask for confirmation before anything is destroyed, and the confirmation SHALL state that the Topics, Findings, Subscriptions, and Chat Turns go with it, that a paid plan is cancelled, and that it cannot be undone.

Closing SHALL require nothing beyond being signed in as the account in question.

On success the browser SHALL leave with a full navigation to the homepage, so no signed-in state survives in memory.

The mobile app's settings screen SHALL offer the same control with the same confirmation words, calling the same route,
and on success SHALL sign the app out and show the sign-in screen, so no signed-in state survives in the app.

#### Scenario: A user closes their own account

- **WHEN** a signed-in user confirms closing their account
- **THEN** the account is closed and the browser lands on the homepage signed out

#### Scenario: The confirmation can be declined

- **WHEN** a user opens the confirmation and declines it
- **THEN** nothing is closed and the account page is unchanged

#### Scenario: A signed-out caller is rejected

- **WHEN** the close route is called without a session
- **THEN** the response is 401 and no account is closed

#### Scenario: A user closes their own account from the app

- **WHEN** a user confirms closing their account on the app's settings screen
- **THEN** the account is closed through the same route, the app signs out, and the sign-in screen shows
