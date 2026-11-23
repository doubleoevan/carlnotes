## ADDED Requirements

### Requirement: Admins set a user's plan from the users table

The users table's plan cell SHALL be a select of free, plus, and premium, like the role's. Picking a plan SHALL set it
through the gate at once, with no dialog, and SHALL show a toast naming the user's new plan.

#### Scenario: An admin sets a plan

- **WHEN** an admin picks premium for a user
- **THEN** the row shows premium and a toast says the user is now on premium

#### Scenario: A billed user shows an error

- **WHEN** an admin picks a plan for a user with an active Stripe subscription
- **THEN** the api responds 409, an error toast shows its reason, and the plan is unchanged

### Requirement: Each saved row change shows a toast

A role change and a budget override in the admin users table SHALL each show a toast once they save, and an error
toast if they fail.

#### Scenario: A role change shows a toast

- **WHEN** an admin makes a user an admin from the role select
- **THEN** a toast says the user is now an admin

#### Scenario: A budget override shows a toast

- **WHEN** an admin saves a budget override
- **THEN** a toast says the user's budget is saved

## REMOVED Requirements

### Requirement: Admins change a user's plan from the users table

**Reason**: The dialog, the reason, the end date, and the Set by admin badge are gone. The plan select saves on pick.

**Migration**: See "Admins set a user's plan from the users table".
