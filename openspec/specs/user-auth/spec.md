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

A password SHALL be at least 12 characters and SHALL be refused when it appears in a known-breach corpus. No composition rule SHALL be imposed.

The breach check SHALL run only on the paths that set a password: signup, reset, change, and set. It SHALL NOT run on sign-in. Better Auth hashes on its sign-in failure paths purely to spend the time a real verify costs, so refusing a breached password there would answer a stranger differently for an address that is registered than for one that is not, which is a worse leak than the timing it defends.

The breach lookup SHALL fail open: when the corpus is unreachable, a password meeting the length floor is accepted and the failure is logged.

#### Scenario: A breached password is refused

- **WHEN** a user sets a password that appears in the breach corpus
- **THEN** it is refused

#### Scenario: An unreachable corpus does not block the password

- **WHEN** the breach lookup fails
- **THEN** a password meeting the length floor is accepted and the failure is logged

#### Scenario: Sign-in answers the same whether or not the account exists

- **WHEN** a breached password is offered at sign-in, once for a registered address and once for an address with no account
- **THEN** both are refused the same way, and neither reveals which address is registered

### Requirement: One mailbox reaches one account however its address is written

Gmail ignores dots in the local part and everything after a `+`, and treats `googlemail.com` as the same mailbox as `gmail.com`. One mailbox can therefore be written many ways, and matching an incoming address against a stored one is string equality.

The system SHALL canonicalize an email address before Better Auth looks a user up by it or stores it. Canonicalizing SHALL lowercase every address, and for a Gmail-family address SHALL additionally drop the dots, drop everything from the first `+`, and fold `googlemail.com` onto `gmail.com`. No other domain SHALL be treated as dot-insensitive, since that is not a general rule of email.

Canonicalizing SHALL apply on every path carrying an address, both those that look a user up and those that store one, and on the OAuth providers' profiles alike. Canonicalizing only one side would leave a stored address unmatchable by the incoming one.

Because every write stores the canonical form, a stored address SHALL already be canonical, so plain equality matches.

#### Scenario: A dotted variant does not create a second account

- **WHEN** an account exists for a Gmail mailbox and someone signs up with the same mailbox written with different dots
- **THEN** the signup is rejected as already existing and no second account is created

#### Scenario: A +tag variant does not create a second account

- **WHEN** an account exists for a Gmail mailbox and someone signs up with the same mailbox written with a `+tag`
- **THEN** the signup is rejected as already existing and no second account is created

#### Scenario: The googlemail twin does not create a second account

- **WHEN** an account exists for a `gmail.com` mailbox and someone signs up with the same local part at `googlemail.com`
- **THEN** the signup is rejected as already existing and no second account is created

#### Scenario: Any variant signs in

- **WHEN** a user signs in with any way of writing the mailbox their account was created with
- **THEN** they reach that same account

#### Scenario: A non-Gmail address is only lowercased

- **WHEN** an address at any other domain is canonicalized
- **THEN** it is lowercased and its dots and `+` are left alone

### Requirement: A signed-in user can change their email

A signed-in user SHALL be able to change the email on their account from the account page. The change SHALL take two links: one sent to the current address, authorizing the move, and only once that is confirmed does a second link go to the new address, proving it is reachable. Neither link alone SHALL move the account.

The reply to a change request SHALL be the same whether or not the requested address already belongs to another account, so nothing here reveals which addresses are registered.

#### Scenario: Changing an address requires both links

- **WHEN** a signed-in user requests a change and follows only the link sent to their current address
- **THEN** the account's email has not changed until the second link, sent to the new address, is also followed

#### Scenario: A hijacked session cannot silently relocate the account

- **WHEN** a change of address is requested
- **THEN** the confirming link goes to the current address, not the new one, so the account's real owner sees the request before anything moves

#### Scenario: An address already in use answers the same as one that is not

- **WHEN** a change is requested to an address that already belongs to another account
- **THEN** the response is indistinguishable from a request to an address with no account

### Requirement: A Turnstile token is renewed after a failed submission

A Cloudflare Turnstile token is spent the first time it is checked, whether or not the request it accompanied succeeds. A form gated by Turnstile SHALL request a fresh token after any submission that fails for a reason other than the token itself, so the visitor can retry without reloading the page.

#### Scenario: A password rejected for its own reasons still allows a retry

- **WHEN** a signup or reset-request form is submitted with a valid Turnstile token and the request is rejected for an unrelated reason (a weak password, a taken address)
- **THEN** the widget issues a fresh token in place of the spent one, and the form can be resubmitted without a page reload

