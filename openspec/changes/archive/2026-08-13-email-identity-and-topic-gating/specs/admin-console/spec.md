## ADDED Requirements

### Requirement: A user row links into that user's own pages

In the admin users table, the username and avatar SHALL open that user's Activity page, tooltip `<username>'s activity`. The email and the plan SHALL each open that user's Account page, tooltip `<username>'s account`, with the full address still shown by the truncated email cell's tooltip. The user's profile stays one click away through the identity row on either page.

The api SHALL serve another user's activity and billing state to an admin who names them by id, behind the same gate as the console, answering forbidden to anyone else and not-found for an id matching nobody.

The budget override input SHALL be four digits wide, since an override is a small whole-dollar figure.

#### Scenario: The username opens the user's activity

- **WHEN** an admin clicks a row's username
- **THEN** that user's Activity page opens, read-only, with their identity row under the heading

#### Scenario: The email and plan open the user's account

- **WHEN** an admin clicks a row's email or plan
- **THEN** that user's Account page opens, read-only and without the settings

#### Scenario: A non-admin cannot read another user's activity

- **WHEN** a signed-in non-admin requests activity or billing state naming another user
- **THEN** the api answers forbidden
