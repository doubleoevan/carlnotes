## ADDED Requirements

### Requirement: The Activity page is the signed-in user's own-data home
An Activity page SHALL be reachable from the header menu for a signed-in user and SHALL require a session. Every figure and row on it SHALL be the calling user's own data — their spend, their owned Topics, their subscriptions, their pending invites — never another user's, gated the same way the rest of the authenticated app is.

#### Scenario: A signed-in user reaches Activity from the header
- **WHEN** a signed-in user opens the header menu
- **THEN** an Activity link renders and leads to the Activity page

#### Scenario: A signed-out visitor is refused
- **WHEN** a request for the Activity payload carries no session
- **THEN** the api responds unauthorized and returns no user's data

### Requirement: The monthly spend meter renders on the Account page
The Account page SHALL show a horizontal progress bar of the user's month-to-date spend versus their effective monthly budget — the plan's backstop, or the per-user override when set — fed by the Activity payload. Spend SHALL be the same per-user figure the Scan budget records and the admin page reports, never a second computed cost. The section SHALL present the figure as money spent against the monthly budget and explicitly not a bill, and all figures SHALL reset with the budget period. The Account page SHALL share the Activity page's width.

#### Scenario: The bar reads the recorded spend and the effective budget
- **WHEN** the Activity payload is assembled
- **THEN** spend comes from the same per-user Scan-budget source the admin console reads, and the budget is the override when set, else the plan backstop

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

### Requirement: Subscriptions and pending invites render in one accordion, only when non-empty
A subscriptions accordion, titled "Your subscriptions", SHALL show one table combining the Topics the user subscribes to (on Topics they do not own) and their pending invites, and SHALL render only when that combined list is non-empty. A subscription row SHALL persist once created: switching it off deactivates it and cascades its email preference off, rather than deleting the row, and the row SHALL stay listed — active or not — until the user explicitly deletes it. Each subscription row SHALL carry the topic link, the date the subscription was created, an Active on/off switch (off deactivates and cascades Emails off, on reactivates without changing Emails), an Emails on/off switch independent of Active, and a Delete control that asks for confirmation before permanently removing the row. A pending-invite row SHALL carry the topic link and approve/deny controls in place of the date and switches, and SHALL become a subscription row once accepted.

#### Scenario: The section stays hidden when both are empty
- **WHEN** the user has no subscriptions and no pending invites
- **THEN** the accordion does not render

#### Scenario: Deactivating cascades Emails off but keeps the row
- **WHEN** the user switches a subscription row's Active off
- **THEN** the subscription endpoint deactivates the row and turns its Emails switch off, and the row stays in the table

#### Scenario: Reactivating does not restore Emails
- **WHEN** the user switches a deactivated row's Active back on
- **THEN** the row reactivates and its Emails switch stays off until the user turns it on separately

#### Scenario: Delete asks first, and is the only thing that removes a row
- **WHEN** the user activates a subscription row's Delete control
- **THEN** a confirmation dialog appears, and the row is permanently removed only on confirming — unlike switching Active off, which only deactivates it

#### Scenario: A pending invite is actionable in the same table
- **WHEN** the user has a pending invite
- **THEN** it appears as a row in the subscriptions table with approve and deny controls, and accepting it turns the row into an active subscription
