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
The email/password signup form SHALL require a Cloudflare Turnstile (Managed mode) token, verified server-side against
Cloudflare before a user is created. A passing check SHALL be sent to the signup in a signed gate cookie that lives five
minutes and passes one signup: the token's nonce is recorded in Redis when it is signed and consumed when it is checked,
so a replayed cookie creates no second account. While Redis is unreachable a token SHALL pass on its signature and
expiry alone, so signups keep working through an outage. OAuth signup SHALL NOT require a Turnstile token.

#### Scenario: Password signup without a valid Turnstile token is rejected
- **WHEN** a password signup request is submitted with a missing or invalid Turnstile token
- **THEN** no `users` row is created and the request is rejected

#### Scenario: A gate cookie passes one signup
- **WHEN** a second password signup is sent with the gate cookie a first signup already used
- **THEN** it is rejected and no second `users` row is created

#### Scenario: OAuth signup does not require Turnstile
- **WHEN** a visitor signs up via Google or GitHub
- **THEN** the signup succeeds without a Turnstile token being collected or verified

### Requirement: Scan LLM calls bill to the topic owner's virtual key
The Scan pipeline SHALL route every LLM call a Scan makes (the search Source's query generation, embedding, and scoring)
through the Scan owner's LiteLLM virtual key instead of the shared master key: the Topic owner's for a scheduled Scan,
and the key of the user who started a manual Scan. A user's usage is billed against their own per-key budget.

#### Scenario: A scan for a user-owned topic uses that user's key
- **WHEN** a scheduled Scan runs for a Topic owned by a given user
- **THEN** the query generation, embedding, and scoring calls that Scan makes are authenticated with that user's LiteLLM
  virtual key

#### Scenario: A manual Scan bills the user who started it
- **WHEN** a user starts a manual Scan of a Topic they may scan and another user owns
- **THEN** the query generation, embedding, and scoring calls that Scan makes are authenticated with the starting user's
  LiteLLM virtual key

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

The reset request SHALL be gated by the same Turnstile challenge and signed gate cookie that protect password signup,
verified server-side, failing closed if the cookie is missing, expired, or already used.

An unauthenticated endpoint that sends email on demand can be pointed at any address repeatedly, and every send costs
money and sender reputation. A challenge stops the automation instead of throttling it. Better Auth's own limiter also
holds the credential paths to ten requests a minute, so the challenge and the limiter back each other up.

#### Scenario: A request without a passing challenge is refused

- **WHEN** a reset request arrives with no gate cookie, an expired one, or one already used
- **THEN** it is refused and no email is sent

#### Scenario: A passing challenge allows the request

- **WHEN** a reset request arrives after a passing Turnstile check
- **THEN** it proceeds, and responds the same way it would for any address

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

### Requirement: A session is read from Redis and kept in Postgres

Better Auth SHALL be configured with the Redis store as its secondary storage and with sessions still stored in the
database. A session SHALL be written to Postgres and to Redis when it is created, read from Redis first on every
request, and read from Postgres if Redis has no copy or cannot be reached. A session Better Auth refreshes from Postgres
SHALL be written to Redis at that refresh if Redis holds no copy, with its remaining lifetime, so a session that
predates Redis or a Redis restart is copied to Redis within a day. Signing out, revoking sessions on a password reset or
change, and closing an account SHALL delete the session from both stores. A sign-out or a password reset or change that
cannot reach Redis leaves the session's Redis copy in place, and once Redis answers again that copy works until its next
daily refresh deletes it. Every session row Better Auth deletes from Postgres SHALL have its token deleted from Redis
too, whether or not the user's active-sessions list named it. An account close SHALL revoke the user's Redis sessions
explicitly, since the app closes accounts outside Better Auth. It SHALL read the tokens from Postgres, so a token the
list missed is deleted too. If Redis is configured and does not answer that revocation, the close SHALL be rejected with
nothing deleted. Otherwise the close SHALL revoke again just before the row is deleted, so a session cached while the
account was closing is signed out too. A failure of that second revocation SHALL be reported and SHALL NOT stop the
close, since the steps before it cannot be repeated. A session cached while the account was closing then works until its
next daily refresh. A direct write to the plan, the role, the username, the avatar, or the invite-access setting, each a
field the session returns, SHALL rewrite every one of the user's Postgres sessions that Redis still holds with the
user's fresh row, so the next request reads the new value, and SHALL never write back a session deleted meanwhile. A
session whose Postgres row is gone SHALL stop authenticating at its next daily refresh, which SHALL delete its Redis
copy. The Redis reads and writes SHALL go through the Redis store's wrapper, so a Redis failure is a miss and never an
error, and a Redis outage or restart SHALL sign nobody out. Better Auth's own sign-in rate limiter, which counts in
secondary storage once it is configured, SHALL count in Redis atomically through the Redis store's fixed-window counter,
and while Redis is unreachable SHALL count in each replica's memory through the same counter, so a credential endpoint
is bounded at its limit per replica during an outage and never rejects every attempt. Better Auth's verification values,
which hold password reset and email verification links, OAuth sign-in state, and MCP authorization codes, SHALL be
written to Postgres and to Redis and read from Redis first with Postgres behind it, so an unreachable or restarted Redis
never breaks a sign-in, a reset, or a verification. A password reset SHALL delete the user's other reset links from both
stores.

#### Scenario: A request reads no session from Postgres

- **WHEN** a signed-in user's request arrives while Redis holds their session
- **THEN** the session is read from Redis and the request sends no session query to Postgres

#### Scenario: Redis down, still signed in

- **WHEN** Redis is unreachable and a signed-in user's request arrives
- **THEN** the session is read from Postgres and the request is served as signed in

#### Scenario: A Redis restart signs nobody out

- **WHEN** Redis restarts empty while users hold sessions
- **THEN** every session is still read from Postgres, and each is written back to Redis at its next daily refresh

#### Scenario: Signing out clears both stores

- **WHEN** a user signs out while Redis answers
- **THEN** the session is deleted from Redis and from Postgres, and its token authenticates nothing

#### Scenario: Closing an account signs it out everywhere

- **WHEN** a user closes their own account, or an admin closes another user's, while Redis answers
- **THEN** every session of that user is deleted from Redis and from Postgres before the user row is deleted, and the
  next request with their cookie is served signed out

#### Scenario: Closing an account needs Redis

- **WHEN** Redis is configured and unreachable and a user or an admin closes an account
- **THEN** the close is rejected with a 503 asking to try again, and nothing of the account is deleted

#### Scenario: A revocation reaches a token the list missed

- **WHEN** a user resets their password while one of their sessions is in Redis but missing from their active-sessions
  list
- **THEN** that session's token is deleted from Redis with its Postgres row, and it authenticates nothing

#### Scenario: A revocation during a Redis outage ends within a day

- **WHEN** a user resets their password while Redis is unreachable, and Redis comes back still holding one of their old
  sessions
- **THEN** that session authenticates at most until its next daily refresh, which finds no Postgres row, deletes its
  Redis copy, and serves the request signed out

#### Scenario: A renamed user sees the new name at once

- **WHEN** a user changes their username or avatar, or an admin changes their role, or a Stripe webhook changes their
  plan
- **THEN** the next request's session returns the new value, from Redis

#### Scenario: The sign-in limiter fails open

- **WHEN** Redis is unreachable and a visitor attempts to sign in inside the limit
- **THEN** the attempt is not rejected for a rate limit, and the credential check runs as usual, with the attempt
  counted in the replica's memory

#### Scenario: The sign-in limiter bounds one replica without Redis

- **WHEN** Redis is unreachable and one address sends an eleventh sign-in attempt inside a minute to one replica
- **THEN** the eleventh attempt is rejected for the rate limit

#### Scenario: A reset link survives a Redis restart

- **WHEN** Redis restarts empty after a user requests a password reset
- **THEN** the reset link still works, read from Postgres

#### Scenario: A password reset voids the user's other reset links

- **WHEN** a user resets their password while another reset link of theirs is unused
- **THEN** that link is deleted from Postgres and from Redis, and it resets nothing

### Requirement: Each user gets a budgeted LiteLLM virtual key at signup or before their first model call
The system SHALL try to create a LiteLLM virtual key for every new user during signup, with a per-key spend budget equal to the user's effective monthly budget: their plan's monthly backstop, or their per-user override if one is set, sourced from the plans catalog. Every call to the proxy's admin API SHALL time out after five seconds. If the proxy responds to a key creation or deletion with a failure, the thrown error SHALL name the response status and leave out the proxy's response body. If the key creation fails or times out, signup SHALL still create the user, with no key, and SHALL report the failure. Before any model call made for a user, the system SHALL load the user's key, and SHALL first create and store one at the user's effective monthly budget if the user has none. If the key cannot be created, the model call SHALL fail, and a user's model call SHALL NEVER be billed to the master key. The search Source's query generation during ingest is ingest spend, so it stays on the master key. If two first model calls race, one key SHALL be stored and the other created key SHALL be deleted. A Scan SHALL create its owner's missing key before any of its Sources run. The key's budget SHALL be resized when the user's plan changes or their budget override changes.

#### Scenario: A successful signup stores a virtual key
- **WHEN** a new user completes signup by any path and the proxy creates their key
- **THEN** their `users` row has a LiteLLM virtual key whose spend budget equals their effective monthly budget

#### Scenario: A proxy failure does not block signup
- **WHEN** the LiteLLM proxy is unreachable, takes longer than five seconds, or rejects key creation during a signup
- **THEN** the user is created with no key, the signup succeeds, and the failure is reported

#### Scenario: A missing key is created before the first model call
- **WHEN** a user with no key sends a chat turn
- **THEN** a key at their effective monthly budget is created and stored before the model call, and the call is billed to that key

#### Scenario: A key that cannot be created fails the call
- **WHEN** a user with no key makes a model call while the proxy cannot create a key
- **THEN** the call fails, and nothing is billed to the master key

#### Scenario: A Scan whose owner's key cannot be created fails before ingest
- **WHEN** a Scan starts for an owner with no key and the key cannot be created
- **THEN** the Scan fails before any of its Sources run

#### Scenario: A plan or override change resizes the budget
- **WHEN** a user's plan changes through billing, or an admin sets or clears their budget override
- **THEN** their LiteLLM key budget is resized to the new effective monthly budget

### Requirement: A key created before a first model call is stored at the user's current budget
When the system creates a missing LiteLLM key before a user's model call, it SHALL store the key only if the user's row still has no key and still has the role, plan, and budget override that the key's budget was computed from. If the row no longer matches, the system SHALL delete the created key from the proxy and SHALL load the user's key again, which creates a key at the user's current budget if the row still has none.

A store can throw an error after the key is stored. If the store throws an error, the system SHALL read the user's row again. It SHALL keep the key if the row has that key, and SHALL otherwise delete the key from the proxy and throw the store's error. The monthly key replacement SHALL follow the same rule.

#### Scenario: A plan change during key creation
- **WHEN** a user's plan or budget override changes after a first model call read the user's budget and before that call stored its new key
- **THEN** the key at the older budget is deleted, and the key that is stored has the user's current budget

#### Scenario: A store that throws an error after the key was stored
- **WHEN** the store of a new key throws an error, and the user's row has that key
- **THEN** the key is kept at the proxy and returned

#### Scenario: An unchanged budget stores the key
- **WHEN** a first model call creates a key and the user's role, plan, and budget override have not changed
- **THEN** the key is stored on the user's row with its creation time

### Requirement: An auth email never holds the request that asked for it

The reset, verification, and change-of-address emails SHALL be sent in the background, and the request SHALL get its
response at once, so a slow or failing Resend never holds a signup, a reset request, or an address change. A send that
throws SHALL be logged and reported by its kind.

#### Scenario: Resend is slow during a signup burst

- **WHEN** a password signup's verification email waits for a Resend slot
- **THEN** the signup responds without waiting for the email

### Requirement: MCP client registration is limited to six hundred an hour per address

The MCP OAuth server's client registration, which takes no credential and writes a row, SHALL be limited to six hundred
registrations an hour per client address, far above one person's registrations, since a hosted AI app registers its
users' clients from a few shared addresses.

#### Scenario: A registration loop is limited

- **WHEN** one address registers a six hundred and first client inside an hour
- **THEN** the registration is rejected by the rate limit

#### Scenario: A hosted AI app's users connect on a busy day

- **WHEN** fifty users of one hosted AI app add the connector within an hour, all registering from the app's address
- **THEN** every registration succeeds

### Requirement: The signup page says what an action a visitor tried needs
Every gated action that sends a signed-out visitor to the signup page SHALL name its call to action in the `cta`
parameter through one shared helper, and the signup page SHALL toast what that call to action needs, from one map:
- `chat`: "Sign up to chat", for a chat question, the chat panel's sign-up, and an attachment
- `chat-voice`: "Sign up to speak with Carl", for the chat mic
- `podcast-question`: "Sign up to speak with Carl and Vienna", for the podcast player's mic
- `new-topic`: "Sign up to create a topic"
- `subscribe`: "Sign up to follow this topic"
- `team-join`: "Sign up to join this team"
- `profile-team-up`: "Sign up to team up"
- `note`: "Sign up to add a note"

A sign-up link the visitor picks on purpose, such as the header's, the menu's, the pricing page's, the login page's,
and a gate's, SHALL show no toast, and a `cta` value outside the map, which such a link may pass for the signup event,
SHALL show none either. The signup page SHALL show one toast however often it renders, through the one toast host that
the root route mounts for every page. The `cta` SHALL still be saved for the signup event as before.

#### Scenario: A visitor taps the podcast mic
- **WHEN** a signed-out visitor taps the podcast player's mic
- **THEN** the signup page opens with `cta=podcast-question` and toasts "Sign up to speak with Carl and Vienna"

#### Scenario: The header's sign-up shows no toast
- **WHEN** a visitor opens the signup page from the header
- **THEN** no toast shows

### Requirement: A single-use value is read and deleted from Redis in one command
Better Auth's secondary storage SHALL read a value it uses once, such as an authorization code, and delete it from
Redis in one command, so two requests never both read it. The read SHALL go through the Redis store's wrapper, so a
Redis failure is a miss and never an error.

#### Scenario: A value read once is gone
- **WHEN** Better Auth reads a single-use value from Redis
- **THEN** the value is returned and the key no longer exists

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

