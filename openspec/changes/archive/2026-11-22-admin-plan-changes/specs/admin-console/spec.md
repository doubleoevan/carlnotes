## ADDED Requirements

### Requirement: Admins change a user's plan from the users table

The users table's plan cell SHALL be a select of free, plus, and premium, like the role's. Picking a plan SHALL open a
dialog asking for a required reason and an optional end date, and saving SHALL change the plan through the gate. A plan
an admin set SHALL show a Set by admin badge with its end date, or no end, and its reason in a tooltip.

#### Scenario: An admin changes a plan

- **WHEN** an admin picks premium for a user, enters a reason, and saves
- **THEN** the row shows premium with a Set by admin badge and its end date

#### Scenario: A billed user shows an error

- **WHEN** an admin changes the plan of a user with an active Stripe subscription
- **THEN** the api responds 409 and the table shows its reason, and the plan is unchanged

#### Scenario: The api rejects an empty reason or a bad end date

- **WHEN** an admin saves an admin plan change with an empty reason, an end date in the past, or an end date on the free
  plan
- **THEN** the api responds 400 and nothing is written

#### Scenario: Picking free ends the admin plan change

- **WHEN** an admin picks free for a user with an admin plan change
- **THEN** the dialog asks for a reason only and its button reads Return to free

#### Scenario: The badge reopens the dialog

- **WHEN** an admin clicks a row's Set by admin badge
- **THEN** the dialog opens on the same plan

## MODIFIED Requirements

### Requirement: A user row links into that user's own pages

In the admin users table, the username and avatar SHALL open that user's profile, the email SHALL open their Activity page, tooltip `<username>'s activity`, and the cost against the budget SHALL open their Account page, tooltip `<username>'s account`. The plan cell is the admin plan change select, not a link.

The api SHALL serve another user's activity and billing state to an admin who names them by id, behind the same gate as the console, answering forbidden to anyone else and not-found for an id matching nobody.

The budget override input SHALL be four digits wide, since an override is a small whole-dollar figure.

#### Scenario: The username opens the user's activity

- **WHEN** an admin clicks a row's email
- **THEN** that user's Activity page opens, read-only, with their identity row under the heading

#### Scenario: The email and plan open the user's account

- **WHEN** an admin clicks a row's cost against the budget
- **THEN** that user's Account page opens, read-only and without the settings

#### Scenario: A non-admin cannot read another user's activity

- **WHEN** a signed-in non-admin requests activity or billing state naming another user
- **THEN** the api answers forbidden
