## ADDED Requirements

### Requirement: A user closes their own account

The account page SHALL offer a control that closes the signed-in user's own account, placed last on the page and styled as the destructive action it is. The control SHALL ask for confirmation before anything is destroyed, and the confirmation SHALL state that the Topics, Findings, Subscriptions, and Chat Turns go with it, that a paid plan is cancelled, and that it cannot be undone.

Closing SHALL require nothing beyond being signed in as the account in question.

On success the browser SHALL leave with a full navigation to the homepage, so no signed-in state survives in memory.

#### Scenario: A user closes their own account

- **WHEN** a signed-in user confirms closing their account
- **THEN** the account is closed and the browser lands on the homepage signed out

#### Scenario: The confirmation can be declined

- **WHEN** a user opens the confirmation and declines it
- **THEN** nothing is closed and the account page is unchanged

#### Scenario: A signed-out caller is rejected

- **WHEN** the close route is called without a session
- **THEN** the response is 401 and no account is closed

### Requirement: An admin closes another account from the console

The admin console's users table SHALL offer a control that closes any listed account, requiring the `admin:deleteUser` capability. The control SHALL ask for confirmation first, naming the account and what closing it takes with it.

The console SHALL NOT offer the control on the signed-in admin's own row, and the route SHALL refuse a request whose target is the caller, since an admin closes their own account from the account page like anyone else.

#### Scenario: An admin closes someone else's account

- **WHEN** an admin confirms closing another user's account
- **THEN** the account is closed and the console reloads without that row

#### Scenario: A non-admin is rejected

- **WHEN** a signed-in user without `admin:deleteUser` calls the console's close route
- **THEN** the response is 403 and no account is closed

#### Scenario: An admin cannot close their own account from the console

- **WHEN** an admin calls the console's close route with their own user id
- **THEN** the response is 409 and the account is untouched

#### Scenario: Closing an account that is already gone

- **WHEN** the console's close route names a user id that does not exist
- **THEN** the response is 404

### Requirement: Closing an account takes everything it owns

Closing SHALL retire everything that can still spend money before anything is destroyed: the user's Stripe subscription and their LiteLLM key. A failure retiring either SHALL abort the close and leave the account whole, since an abort is recoverable while a key the deleted row was the only record of is not. A user on the free plan has no subscription row and nothing to cancel.

Closing SHALL then delete each owned Topic through the Topic delete, so the stored objects and the featured position behind it are released rather than merely orphaned. It SHALL delete the stored objects behind everything the user kept in Chat, including on Topics they do not own, and their uploaded avatar. These SHALL be best-effort, since a stored object left behind costs storage and nothing else.

Closing SHALL then delete the `users` row, and every table referencing it SHALL cascade.

The system SHALL record who closed the account as an analytics event, since the row that would otherwise say so is gone.

#### Scenario: A paid account stops being billed

- **WHEN** an account holding an active Stripe subscription is closed
- **THEN** that subscription is cancelled outright before any row is deleted

#### Scenario: Billing that cannot be cancelled aborts the close

- **WHEN** cancelling the Stripe subscription throws
- **THEN** the close aborts and the account is still whole

#### Scenario: A key that cannot be retired aborts the close

- **WHEN** retiring the LiteLLM key throws
- **THEN** the close aborts with the key's row still naming it, so it can be retried

#### Scenario: Owned Topics and their stored objects go

- **WHEN** an account owning Topics is closed
- **THEN** each Topic is deleted through the Topic delete, and its attachments and featured position are released

#### Scenario: Nothing referencing the user survives

- **WHEN** an account is closed
- **THEN** its sessions, accounts, subscriptions, bookmarks, chat turns, and audiences are gone with it

### Requirement: A closed account frees its address and its session at once

The system SHALL retain nothing that would keep a closed account's email address from being used again, so the same address SHALL be able to sign up afresh. The new account is a new account: a new user id and a newly assigned Username, with nothing of the closed one restored.

The session cookie a closed account's browser still holds SHALL resolve to nobody on the very next request, with no cached window in which it still reads as signed in.

#### Scenario: The same address signs up again

- **WHEN** an account is closed and the same email address is used to sign up
- **THEN** the signup succeeds and creates a new account with a new user id

#### Scenario: The old session cookie is dead

- **WHEN** a request carries the session cookie of an account that was just closed
- **THEN** the session resolves to nobody
