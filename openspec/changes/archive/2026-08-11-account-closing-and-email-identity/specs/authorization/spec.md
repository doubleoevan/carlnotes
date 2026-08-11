## ADDED Requirements

### Requirement: Closing another user's account is a gated admin capability

The gate SHALL answer an `admin:deleteUser` capability, and SHALL grant it to an admin only. Like every other `admin:` capability it SHALL be rejected for a non-admin regardless of plan, and no route SHALL decide it by comparing a role itself.

Closing one's own account SHALL NOT be gated by this capability, since it needs nothing beyond being signed in as the account in question.

#### Scenario: An admin may close another account

- **WHEN** `isAllowed(admin, "admin:deleteUser")` is asked
- **THEN** the gate allows it

#### Scenario: A non-admin may not

- **WHEN** `isAllowed(user, "admin:deleteUser")` is asked for a user whose role is not admin
- **THEN** the gate refuses it, whatever their plan

#### Scenario: Closing your own account asks no capability

- **WHEN** a signed-in user closes their own account
- **THEN** the route requires only their session, and does not ask the gate for `admin:deleteUser`
