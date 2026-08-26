## RENAMED Requirements

- FROM: `### Requirement: Sent invitations render in their own accordion, only when non-empty`
- TO: `### Requirement: Topic invitations render in their own accordion, received first`

## MODIFIED Requirements

### Requirement: Topic invitations render in their own accordion, received first

An invitations accordion, titled "Your topic invitations", SHALL hold both directions of the user's Topic invitations, and SHALL render only when either list is non-empty. Received invitations render first, each with the Topic, who invited them, when, and accept and decline buttons — accepting does exactly what accepting the invitation's token does, and declining stamps the row, drops it from both directions' lists, and notifies nobody.

The user's sent invitations render below, one row per invitation. Each row SHALL include the topic link, the invitee, the date of the invitation, a Followed column holding the date the invitee subscribed or Pending when they have not, and an Active toggle that withdraws the invitation, in the sent-invitations table the Teams page shares. Sorting by that column SHALL order by date, with every pending row sorting ahead of every date: last when descending and first when ascending. A footer SHALL total how many were invited and how many subscribed. The row identity, the withdraw target, and the query widen to cover username rows; declined rows leave the list while their stamp survives for reputation.

The invitee cell SHALL render the identifier the sender used — the address for an email invitation, the username for a username one — gaining the avatar and profile link whenever the invitee has an account, as invitee cells do today.

Withdrawing a sent invitation SHALL ask for confirmation, and SHALL remove that invitee's subscription along with the invitation, so the invitee loses the access both granted. Owner only.

#### Scenario: The section stays hidden when the user has sent no invitations

- **WHEN** the user has no pending received invitations and has sent none
- **THEN** the invitations accordion does not render

#### Scenario: Received invitations answer from the page

- **WHEN** the user accepts one received invitation and declines another
- **THEN** the accepted one subscribes them exactly as acceptance would, the declined one leaves the section with its row stamped, and the senders are not notified of the decline

#### Scenario: An unanswered invitation reads as pending

- **WHEN** an invited address or user holds no subscription to that Topic
- **THEN** its Subscribed cell reads pending

#### Scenario: An accepted invitation shows the date it subscribed

- **WHEN** an invited address or user holds a subscription to that Topic
- **THEN** its Subscribed cell shows the date they subscribed

#### Scenario: Pending sorts to one end, following the direction

- **WHEN** the user sorts by the Followed column descending
- **THEN** the answered invitations order newest first and every pending row sits below them, and reversing the sort brings the pending rows to the top

#### Scenario: Each row shows the identifier the sender used

- **WHEN** the table holds an email invitation and a username invitation side by side
- **THEN** one renders the address and the other the username, in one table with one column convention

#### Scenario: An invitee without an account is still listed

- **WHEN** an invited address has no user account yet, since an email invite names an address instead of a user
- **THEN** the row still renders, and its Subscribed cell reads pending

#### Scenario: Withdrawing an invitation revokes the subscription too

- **WHEN** the owner deletes an invitation whose invitee had subscribed
- **THEN** the invitation and that invitee's subscription are both removed, and the invitee loses access to the Topic

#### Scenario: Only the Topic owner may withdraw an invitation

- **WHEN** a user who does not own the Topic asks to withdraw one of its invitations
- **THEN** the request is rejected

#### Scenario: The footer totals both counts

- **WHEN** the sent invitations table renders
- **THEN** its footer reports how many invitations were sent and how many of those invitees subscribed

### Requirement: Subscriptions render in their own accordion, only when non-empty

A subscriptions accordion, titled "Your topic subscriptions", SHALL show the Topics the user subscribes to on Topics they do not own, and SHALL render only when that list is non-empty.

A subscription row SHALL persist once created: switching it off deactivates it and cascades its email preference off, instead of deleting the row, and the row SHALL stay listed — active or not — until the user explicitly deletes it.

Each row SHALL include the topic link, the Topic owner, the date the subscription was created, an Active on/off switch (off deactivates and cascades Emails off, on reactivates without changing Emails), an Emails on/off switch independent of Active, and a delete button that asks for confirmation before permanently removing the row.

Switching Active back on for an invite Topic SHALL tell the user that findings appear from the next scan onward, the same disclaimer the Topic page gives on a fresh subscribe, because an invite Topic gates its findings on when the subscription activated.

A Subscription written by a team join is the member's own row and SHALL render editable like any other; leaving the Team is the Teams page's job, not this table's.

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

- **WHEN** the user activates a subscription row's delete button
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
