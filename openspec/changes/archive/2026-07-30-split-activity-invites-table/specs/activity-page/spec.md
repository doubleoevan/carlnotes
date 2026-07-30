## REMOVED Requirements

### Requirement: Subscriptions and pending invites render in one accordion, only when non-empty

**Reason**: A subscription and a pending invite are different things, and sharing one table forced every subscription column to render a placeholder on invite rows. The behavior is preserved and extended across the two requirements added below, one per table.

**Migration**: The Activity payload's single `subscriptions` array splits into `subscriptions` and `invites`, and the `kind` discriminator is dropped. Only the Activity page reads it.

## ADDED Requirements

### Requirement: A row is deleted with a labelled icon control

The delete control on a subscription row and on an invitation row SHALL be an icon rather than a text button, and SHALL carry a tooltip and an accessible label naming what it deletes: "Delete subscription" and "Delete invitation" respectively.

#### Scenario: The control names what it removes

- **WHEN** the user points at a row's delete icon
- **THEN** a tooltip names whether it deletes a subscription or an invitation

### Requirement: The owned-topics table reports subscribers

The topics accordion SHALL carry a Subscribers column holding each Topic's active subscriber count, and its footer SHALL total that column. The count SHALL match how the feed and Topic page already count subscribers: only active subscriptions count, and the owner's own subscription to their Topic never counts.

#### Scenario: A Topic reports its active subscribers

- **WHEN** other users hold active subscriptions to a Topic the user owns
- **THEN** its Subscribers cell shows how many, and the footer adds it to the total

#### Scenario: The owner's own subscription is not a subscriber

- **WHEN** the owner holds a subscription to their own Topic and nobody else does
- **THEN** its Subscribers cell reads zero

#### Scenario: A deactivated subscription does not count

- **WHEN** a subscriber switches their subscription off rather than deleting it
- **THEN** the Topic's Subscribers count drops by one, and the row remains in that subscriber's own table

### Requirement: Subscriptions render in their own accordion, only when non-empty

A subscriptions accordion, titled "Your subscriptions", SHALL show the Topics the user subscribes to on Topics they do not own, and SHALL render only when that list is non-empty.

A subscription row SHALL persist once created: switching it off deactivates it and cascades its email preference off, rather than deleting the row, and the row SHALL stay listed — active or not — until the user explicitly deletes it.

Each row SHALL carry the topic link, the Topic owner, the date the subscription was created, an Active on/off switch (off deactivates and cascades Emails off, on reactivates without changing Emails), an Emails on/off switch independent of Active, and a delete control that asks for confirmation before permanently removing the row.

Switching Active back on for an invite Topic SHALL tell the user that findings appear from the next scan onward, the same disclaimer the Topic page gives on a fresh subscribe, because an invite Topic gates its findings on when the subscription activated.

A subscription the user holds only through an audience SHALL render read-only: its switches SHALL be disabled, it SHALL offer no Delete, and it SHALL name the audience that granted it. A user who is subscribed both directly and through an audience SHALL get the editable row, since the direct row is the one their controls can act on.

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

#### Scenario: An audience-held subscription cannot be edited

- **WHEN** a row's subscription is held by an audience the user belongs to rather than by the user
- **THEN** its switches are disabled, it offers no Delete, and it names the granting audience

#### Scenario: A direct subscription stays editable alongside an audience one

- **WHEN** the user holds both a direct and an audience-held subscription to the same Topic
- **THEN** one row renders, and it is the editable direct one

### Requirement: Sent invitations render in their own accordion, only when non-empty

An invitations accordion, titled "Your invitations", SHALL show the invitations the user sent on Topics they own, one row per invited email address, and SHALL render only when that list is non-empty.

Each row SHALL carry the topic link, the invitee's email address, the date of the invitation, a Subscribed column holding the date the invitee subscribed or pending when they have not, and a delete control that withdraws the invitation. Sorting by that column SHALL order by date, with every pending row sorting ahead of every date: last when descending and first when ascending. A footer SHALL total how many were invited and how many subscribed.

An invitee SHALL NOT be required to answer from this page. They subscribe from the Topic itself, and manage that subscription from their own subscriptions table.

Withdrawing an invitation SHALL ask for confirmation, and SHALL remove that invitee's subscription along with the invitation, so the invitee loses the access both granted. Owner only.

#### Scenario: The section stays hidden when the user has sent no invitations

- **WHEN** the user has invited nobody to any Topic they own
- **THEN** the invitations accordion does not render

#### Scenario: An unanswered invitation reads as pending

- **WHEN** an invited address holds no subscription to that Topic
- **THEN** its Subscribed cell reads pending

#### Scenario: An accepted invitation shows the date it subscribed

- **WHEN** an invited address holds a subscription to that Topic
- **THEN** its Subscribed cell shows the date they subscribed

#### Scenario: An invitee without an account is still listed

- **WHEN** an invited address has no user account yet, since an invite names an email rather than a user
- **THEN** the row still renders, and its Subscribed cell reads pending

#### Scenario: Pending sorts to one end, following the direction

- **WHEN** the user sorts by the Subscribed column descending
- **THEN** the answered invitations order newest first and every pending row sits below them, and reversing the sort brings the pending rows to the top

#### Scenario: Withdrawing an invitation revokes the subscription too

- **WHEN** the owner deletes an invitation whose invitee had subscribed
- **THEN** the invitation and that invitee's subscription are both removed, and the invitee loses access to the Topic

#### Scenario: Only the Topic owner may withdraw an invitation

- **WHEN** a caller who does not own the Topic asks to withdraw one of its invitations
- **THEN** the request is refused

#### Scenario: The footer totals both counts

- **WHEN** the invitations table renders
- **THEN** its footer reports how many invitations were sent and how many of those invitees subscribed


### Requirement: Deleting a subscription ends invite access too

Deleting a subscription SHALL also remove the caller's invite to that Topic, so that Delete is a complete unsubscribe: the user loses the access the invite granted, and the Topic SHALL NOT reappear as an open invitation on the owner's Activity page. Re-entry SHALL require a fresh invite from the Topic owner.

Deactivating SHALL NOT remove the invite, which is what keeps a deactivated subscription reactivatable.

#### Scenario: Delete removes the invite alongside the subscription

- **WHEN** the user deletes their subscription to an invite Topic they were invited to
- **THEN** both the subscription and the invite are removed, and the owner's invitations table no longer lists that address

#### Scenario: Delete ends access to an invite Topic

- **WHEN** the user deletes their subscription to an invite Topic and then opens that Topic
- **THEN** access is refused, since neither an invite nor a subscription grants it any longer

#### Scenario: Deactivating leaves the invite in place

- **WHEN** the user switches a subscription's Active off on an invite Topic
- **THEN** the invite remains, and the row stays listed and reactivatable
