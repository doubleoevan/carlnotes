## ADDED Requirements

### Requirement: A forgotten password can be reset over email

The login form SHALL offer a way to reset a forgotten password. Submitting an address SHALL send a reset link to it through the existing Resend sender, carrying a token that is single-use and short-lived.

Opening the link SHALL let the user set a new password and SHALL establish an authenticated session, so recovery ends where the user wanted to be rather than back at a login form.

The new password SHALL be held to the same minimum the signup form enforces, so the three ways a password can be set cannot drift apart.

The reset link's route segment SHALL be added to the username blocklist before it ships, since usernames occupy the root namespace and would otherwise shadow it.

#### Scenario: A reset link sets a new password and signs the user in

- **WHEN** a user opens a valid reset link and submits a new password
- **THEN** their password credential is replaced, they are signed in, and the link no longer works

#### Scenario: A used link is refused

- **WHEN** a reset link is opened a second time
- **THEN** it is refused and no password is changed

#### Scenario: An expired link is refused

- **WHEN** a reset link is opened after its lifetime has passed
- **THEN** it is refused and no password is changed

#### Scenario: The new password meets the signup minimum

- **WHEN** a user submits a new password shorter than the signup minimum
- **THEN** it is refused, by the same rule the signup form applies

### Requirement: The reset request never reveals whether an account exists

The reset request endpoint SHALL respond identically whether or not the submitted address has an account, and the UI SHALL say that a link is on its way rather than confirming anything about the address.

A form that answers differently for a known and an unknown address is an account-enumeration oracle, and knowing who has an account here is the first step in credential stuffing and targeted phishing.

This SHALL hold for an address that has an account with no password credential — one created through Google or GitHub — which additionally SHALL NOT be told which provider it uses.

#### Scenario: An unknown address gets the same answer

- **WHEN** a reset is requested for an address with no account
- **THEN** the response is indistinguishable from one for an address that has an account, and no email is sent

#### Scenario: An OAuth-only account gets the same answer

- **WHEN** a reset is requested for an address that signed up with Google or GitHub and has no password
- **THEN** the response is the same again, and nothing names the provider

### Requirement: A signed-in user can change their password with their current one

The account page SHALL offer a change-password form. It SHALL require the current password alongside the new one.

Without that, anyone reaching an unlocked session takes the account outright rather than merely browsing it, which turns a session compromise into an account compromise.

#### Scenario: A correct current password changes it

- **WHEN** a signed-in user submits their current password and a new one
- **THEN** the password credential is replaced

#### Scenario: A wrong current password changes nothing

- **WHEN** a signed-in user submits an incorrect current password
- **THEN** the request is refused and the stored credential is unchanged

### Requirement: Resetting or changing a password revokes other sessions

Both a reset and a change SHALL revoke the account's other sessions. A password is changed because it may be known to someone else, and a session already held by that person is the risk the change exists to remove.

A change SHALL leave the acting session alive, so the user is not thrown out of the page they are on, and the UI SHALL say that other sessions were ended rather than leaving it to be discovered on another device.

#### Scenario: A change ends other sessions and keeps this one

- **WHEN** a signed-in user changes their password while signed in elsewhere
- **THEN** the other session no longer authenticates and the acting session still does

#### Scenario: A reset ends every prior session

- **WHEN** a user completes a reset
- **THEN** every session established before it stops authenticating

#### Scenario: The user is told

- **WHEN** a password change succeeds
- **THEN** the UI says that other sessions were signed out

### Requirement: The reset request is gated by the existing Turnstile challenge

The reset request SHALL be gated by the same Turnstile challenge and signed gate cookie that protect password signup, verified server-side, failing closed when the cookie is missing or expired.

An unauthenticated endpoint that sends email on demand can be pointed at any address repeatedly, and every send costs money and sender reputation. A challenge stops the automation rather than throttling it. Better Auth's own limiter also holds the credential paths to ten requests a minute, so the challenge and the limiter back each other up.

#### Scenario: A request without a passing challenge is refused

- **WHEN** a reset request arrives with no gate cookie or an expired one
- **THEN** it is refused and no email is sent

#### Scenario: A passing challenge allows the request

- **WHEN** a reset request arrives after a passing Turnstile check
- **THEN** it proceeds, and answers the same way it would for any address

### Requirement: A password is long enough and not already leaked

A password SHALL be at least 12 characters and SHALL be refused when it appears in a known-breach corpus. Both checks run in the password hasher, the one point signup, reset, and change all pass through, so the three cannot drift. No composition rule SHALL be imposed.

The breach lookup SHALL fail open: when the corpus is unreachable, a password meeting the length floor is accepted and the failure is logged.

#### Scenario: A breached password is refused

- **WHEN** a user sets a password that appears in the breach corpus
- **THEN** it is refused

#### Scenario: An unreachable corpus does not block the password

- **WHEN** the breach lookup fails
- **THEN** a password meeting the length floor is accepted and the failure is logged
