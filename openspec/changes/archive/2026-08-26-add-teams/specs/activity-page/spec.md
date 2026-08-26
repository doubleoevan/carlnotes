## MODIFIED Requirements

### Requirement: Subscriptions render in their own accordion, only when non-empty

A subscriptions accordion, titled "Your subscriptions", SHALL show the Topics the user subscribes to on Topics they do not own, and SHALL render only when that list is non-empty.

A subscription row SHALL persist once created: switching it off deactivates it and cascades its email preference off, instead of deleting the row, and the row SHALL stay listed — active or not — until the user explicitly deletes it.

Each row SHALL include the topic link, the Topic owner, the date the subscription was created, an Active on/off switch (off deactivates and cascades Emails off, on reactivates without changing Emails), an Emails on/off switch independent of Active, and a delete button that asks for confirmation before permanently removing the row.

Switching Active back on for an invite Topic SHALL tell the user that findings appear from the next scan onward, the same disclaimer the Topic page gives on a fresh subscribe, because an invite Topic gates its findings on when the subscription activated.

A Subscription written by a team join is the member's own row and SHALL render editable like any other; leaving the Team is the teams index's job, not this table's.

#### Scenario: The section stays hidden when there are no subscriptions

- **WHEN** the user subscribes to no Topics they do not own
- **THEN** the subscriptions accordion does not render

#### Scenario: Each row names the Topic owner

- **WHEN** the subscriptions table renders
- **THEN** every row shows the name of the user who owns that Topic

#### Scenario: Deactivating cascades Emails off but keeps the row

- **WHEN** the user switches a subscription row's Active off
- **THEN** the subscription endpoint deactivates the row and turns its Emails switch off, and the row stays in the table

#### Scenario: Reactivating does not restore Emails

- **WHEN** the user switches a deactivated row's Active back on
- **THEN** the row reactivates and its Emails switch stays off until the user turns it on separately

#### Scenario: Delete asks first, and is the only thing that removes a row

- **WHEN** the user activates a subscription row's Delete control
- **THEN** a confirmation dialog appears, and the row is permanently removed only on confirming — unlike switching Active off, which only deactivates it

#### Scenario: Reactivating an invite subscription says findings start from the next scan

- **WHEN** the user switches Active back on for a subscription to an invite Topic
- **THEN** they are told findings appear after the Topic's next scan

#### Scenario: Reactivating a public subscription says nothing extra

- **WHEN** the user switches Active back on for a subscription to a public Topic
- **THEN** no next-scan disclaimer appears, since a public Topic's existing findings are already visible

#### Scenario: A team-held subscription stays the member's own

- **WHEN** a row's subscription was written by a team join
- **THEN** its switches work like any other row's, and deleting it does not remove the member from the Team

