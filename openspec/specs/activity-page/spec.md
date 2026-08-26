# activity-page Specification

## Purpose
TBD - created by archiving change add-activity-page-and-subscriptions. Update Purpose after archive.
## Requirements
### Requirement: The Activity page is the signed-in user's own-data home
An Activity page SHALL be reachable from the header menu for a signed-in user and SHALL require a session. Every figure and row on it SHALL be the calling user's own data — their spend, their owned Topics, their subscriptions, their pending invites — never another user's, gated the same way the rest of the authenticated app is.

#### Scenario: A signed-in user reaches Activity from the header
- **WHEN** a signed-in user opens the header menu
- **THEN** an Activity link renders and leads to the Activity page

#### Scenario: A signed-out visitor is rejected
- **WHEN** a request for the Activity payload carries no session
- **THEN** the api responds unauthorized and returns no user's data

### Requirement: The monthly spend meter renders on the Account page

The Account page SHALL show a horizontal progress bar of the user's month-to-date spend versus their effective monthly budget — the plan's backstop, or the per-user override when set — fed by the Activity payload. Spend SHALL be the same per-user figure the Scan budget records and the admin page reports, never a second computed cost. All figures SHALL reset with the budget period. The Account page SHALL share the Activity page's width.

The section SHALL read as the product's own fund rather than as an account balance, since the money is what the product spends serving the user and never what the user owes.

The heading SHALL NOT repeat the spend as a percentage. The money figures beside it and the bar below it already carry the proportion, and a third statement of it says nothing new.

In place of a static disclaimer, the section SHALL carry a state line keyed on the fraction of the budget spent, so the same words change as the month goes on:

- under 60% — a line saying the fund is full
- 60% to 89% — a line saying it is getting low
- 90% to 99% — a line saying it is nearly out
- at 100% — a line saying it is spent until the period resets, and that the product is still working but cannot record its results

Every line below 100% SHALL still say the spend is the product's own tab, not the user's.

The 100% line SHALL carry an inline upgrade link, since a user who has just run out is at the highest-intent moment the page offers.

The bar's two segments SHALL keep their existing labels.

#### Scenario: The bar reads the recorded spend and the effective budget
- **WHEN** the Activity payload is assembled
- **THEN** spend comes from the same per-user Scan-budget source the admin console reads, and the budget is the override when set, else the plan backstop

#### Scenario: The state line follows the spend
- **WHEN** a user's month-to-date spend crosses from under 60% to above it, and later past 90%
- **THEN** the line changes at each threshold without the figures or the bar changing meaning

#### Scenario: A spent budget offers the way up
- **WHEN** a user has spent their whole monthly budget
- **THEN** the line says so, says the product is still reading but cannot file notes, and offers an upgrade link inline

#### Scenario: The heading carries no percentage
- **WHEN** the section renders at any spend level
- **THEN** the heading names the fund and does not repeat the percentage

### Requirement: Data tables share one card-and-controls treatment
Every data table on the Activity and Admin pages SHALL sit on a card background and SHALL offer sortable column headers on its data columns — a new column sorts ascending, a repeat click flips the direction, and sorting reorders the full row set — plus a page-size dropdown and previous/next pagination over the loaded rows — the whole control row hidden while the rows fit under the smallest page size. Null cells SHALL sort last in either direction, so a descending sort never leads with the rows that have no value.

#### Scenario: Sorting spans every page
- **WHEN** the user sorts a column and pages forward
- **THEN** the pages walk the fully sorted row set, not just the visible page reordered

#### Scenario: Null cells never lead a descending sort
- **WHEN** the user sorts a column descending while some rows carry no value
- **THEN** the valued rows order high to low and the empty rows follow them

### Requirement: The topics accordion lists owned Topics with cost last and a scan drill-down
The Activity page's content SHALL live in accordions. A topics accordion, default expanded, SHALL show one row per Topic the user owns with columns: topic name, scan count this month under a "Scans" header whose tooltip reads "Scans this month", created date, last updated date, a link to the topic page, an email toggle (display-only until the delivery branch lands), and month-to-date cost as the last column under a "Cost" header whose tooltip reads "Cost this month". Activating a topic's cost cell SHALL expand that Topic's scan history beneath the row: one row per Scan this month with columns date, resources kept, and the Scan's cost as the last column. Every cost column on the page SHALL be the last column of its table, every table SHALL be followed by a summary line carrying the column totals over the full row set, and cost SHALL render through the shared cents-to-dollars helper the admin cost column uses.

#### Scenario: A topic row expands into its scans
- **WHEN** the user activates the cost cell of an owned Topic's row
- **THEN** the Topic's Scans for the month render beneath it with date, resources kept, and cost last, followed by a totals line

#### Scenario: Totals follow every table
- **WHEN** the topics accordion or an expanded scan history renders
- **THEN** a summary line carries that table's column totals

### Requirement: A row is deleted with a labelled icon control

The delete control on a subscription row and on an invitation row SHALL be an icon rather than a text button, and SHALL carry a tooltip and an accessible label naming what it deletes: "Delete subscription" and "Delete invitation" respectively.

#### Scenario: The control names what it removes

- **WHEN** the user points at a row's delete icon
- **THEN** a tooltip names whether it deletes a subscription or an invitation

### Requirement: The owned-topics table reports followers and visibility

The topics accordion SHALL carry a Followers column holding each Topic's active subscriber count, and its footer SHALL total that column. The count SHALL match how the feed and Topic page already count subscribers: only active subscriptions count, and the owner's own subscription to their Topic never counts.

The column SHALL be worded Followers, and the Subscribed columns on the subscriptions and invitations tables SHALL be worded Followed. The domain noun stays Subscription in the code, and Follow is already the word the Topic page's own button shows a reader, so the tables say what the buttons say. It is also the shorter word, which is what lets these tables carry another column.

The accordion SHALL carry a Visibility column naming who may see each Topic, with the same icon and label the Topic page's info card uses, so a reader can tell at a glance which of their Topics are public without opening each one.

#### Scenario: A Topic reports its active followers

- **WHEN** other users hold active subscriptions to a Topic the user owns
- **THEN** its Followers cell shows how many, and the footer adds it to the total

#### Scenario: The owner's own subscription is not a follower

- **WHEN** the owner holds a subscription to their own Topic and nobody else does
- **THEN** its Followers cell reads zero

#### Scenario: A deactivated subscription does not count

- **WHEN** a subscriber switches their subscription off rather than deleting it
- **THEN** the Topic's Followers count drops by one, and the row remains in that subscriber's own table

#### Scenario: A Topic reports who may see it

- **WHEN** the topics accordion renders a Topic
- **THEN** its Visibility cell names public, private, or invite, with the icon that stands for it

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

### Requirement: Deleting a subscription ends invite access too

Deleting a subscription SHALL also remove the caller's invite to that Topic, so that Delete is a complete unsubscribe: the user loses the access the invite granted, and the Topic SHALL NOT reappear as an open invitation on the owner's Activity page. Re-entry SHALL require a fresh invite from the Topic owner.

Deactivating SHALL NOT remove the invite, which is what keeps a deactivated subscription reactivatable.

#### Scenario: Delete removes the invite alongside the subscription

- **WHEN** the user deletes their subscription to an invite Topic they were invited to
- **THEN** both the subscription and the invite are removed, and the owner's invitations table no longer lists that address

#### Scenario: Delete ends access to an invite Topic

- **WHEN** the user deletes their subscription to an invite Topic and then opens that Topic
- **THEN** access is rejected, since neither an invite nor a subscription grants it any longer

#### Scenario: Deactivating leaves the invite in place

- **WHEN** the user switches a subscription's Active off on an invite Topic
- **THEN** the invite remains, and the row stays listed and reactivatable

### Requirement: The topics table counts the emails a topic sent

Every email a Topic sends that Resend accepts — a scan delivery, a manual-scan report, an invitation — SHALL be recorded as one send row for that Topic with its recipient's user id, null for an invitee with no account. A send Resend refuses or that is skipped SHALL record nothing, so the log only says what actually went out. A deleted Topic's send rows go with it, and a closed recipient account leaves the row without naming anyone.

The topics table SHALL carry a sortable `Emailed` column beside the Emails toggle: the sends the Topic's owner received this month, on the same month grain as Brews and Cost, with a tooltip saying so and its sum on the totals line as `N sent`. A send to anyone else — a subscriber's scan delivery, an invitation, a report to an admin who ran the scan — stays in the log and out of the column. The column SHALL stay a count and the Emails cell a control, never merged into one cell. The admin page's per-user subtable shows the same column through the same table.

Every totals-row figure on the page's tables SHALL carry its noun, so a footer reads without its headers: `16 brews`, `0 followers`, `300 read`, `182 kept`, `4 invited`, `1 subscribed`. A toggle column's total SHALL read as its on-share of the rows — `N/M on` under Emails, `N/M active` on the subscriptions table — and the topics totals line also counts `N public` under Visibility beside the existing `N daily` under Schedule. Money keeps its bare dollar figure, which labels itself.

#### Scenario: An accepted send to the owner counts

- **WHEN** a scan email or manual-scan report to the Topic's owner is accepted by Resend
- **THEN** the Topic's Emailed count for the month rises by one

#### Scenario: A send to somebody else is logged but not counted

- **WHEN** a scan email reaches another subscriber, an invitation reaches an invitee, or a report reaches an admin who ran the scan
- **THEN** the send is recorded with its recipient and the Emailed count is unchanged

#### Scenario: A refused send does not count

- **WHEN** Resend refuses a send, or the send is skipped for missing configuration
- **THEN** the Emailed count is unchanged

#### Scenario: The totals line sums the column

- **WHEN** the topics table renders with topics that emailed this month
- **THEN** the totals line shows the sum of every topic's Emailed count as `N sent`, not just the visible page's, with `N public` under Visibility and `N on` under Emails

### Requirement: The page says whose it is and goes read-only when it is not the reader's

The Activity page SHALL carry an identity row under its heading — the subject's avatar and username, linking to their profile — and the payload SHALL name whose activity it holds. The Account page SHALL carry the same row.

An admin reading another user's page SHALL get every figure and table read-only: the email and active toggles disabled, the delete and withdraw controls absent, the empty-state calls to action replaced with plain lines, and the account page's portal buttons and settings absent, since every one of those controls only ever acts on the caller's own rows.

The invitations table's Invitee cell SHALL show the invitee's avatar and username once the invited address has an account — opening their profile in a new tab, tooltip `<username>'s profile` — and the bare address until then.

#### Scenario: The identity row names the subject

- **WHEN** an admin opens another user's Activity or Account page
- **THEN** the heading carries that user's avatar and username, linking to their profile

#### Scenario: A foreign page has no live controls

- **WHEN** an admin reads another user's Activity page
- **THEN** every toggle is disabled and no delete, withdraw, or create control renders

#### Scenario: An invitee with an account shows as themselves

- **WHEN** an invited address belongs to an account
- **THEN** its row shows that user's avatar and username, opening their profile in a new tab

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

