## ADDED Requirements

### Requirement: The users table closes an account

Each row of the users table SHALL offer a control that closes that account, gated by `admin:deleteUser` and confirming first. The confirmation SHALL name the account and say what closing it takes with it, including that its Stripe subscription is cancelled and that it cannot be undone.

The control SHALL be absent from the signed-in admin's own row, since an admin closes their own account from the account page. The console SHALL reload after a close, so the closed account's row goes with it.

A close that fails SHALL say so and leave the table as it was.

#### Scenario: An admin closes an account from the table

- **WHEN** an admin confirms the close on another user's row
- **THEN** the account is closed and the console reloads without that row

#### Scenario: An admin's own row offers no close

- **WHEN** an admin views the users table
- **THEN** their own row carries no close control

#### Scenario: A failed close is reported

- **WHEN** closing an account fails
- **THEN** the admin is told it failed and the table is unchanged
