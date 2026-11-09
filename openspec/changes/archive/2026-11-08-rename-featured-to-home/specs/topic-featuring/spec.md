## MODIFIED Requirements

### Requirement: Dropping a pin asks first

The X on a pinned Topic's or Podcast Episode's row in a Rank dialog SHALL first ask the admin to confirm, naming the
row. Confirming SHALL clear that row's home order at once and keep the dialog open without the row. Cancelling SHALL
send nothing. The X on the page's own row that is not pinned yet SHALL drop it without asking.

#### Scenario: An admin cancels a drop

- **WHEN** an admin presses the X on a pinned row and cancels the confirmation
- **THEN** no home order changes and the row stays in the Rank dialog

#### Scenario: An admin confirms a drop

- **WHEN** an admin presses the X on a pinned row and confirms
- **THEN** that row's home order clears, the rows below it move up, and the dialog stays open without the row

### Requirement: The admin console lists both pin lists

The admin console SHALL show a Home card listing the Home topics and the Home podcasts pins in order, each row with a
step up, a step down, and an X that clears the pin after a confirmation.

#### Scenario: An admin clears a pin from the console

- **WHEN** an admin presses the X on a pinned Topic's row in the Home card and confirms
- **THEN** the Topics below move up by one and the home page is purged at the edge
