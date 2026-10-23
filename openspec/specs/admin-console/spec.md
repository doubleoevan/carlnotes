# admin-console Specification

## Purpose
TBD - created by archiving change add-authz-plans-billing. Update Purpose after archive.
## Requirements
### Requirement: The admin console is an admin-only route
An admin console route SHALL render a users table and a totals summary, authorized through `isAllowed(user, "admin:console")`. A non-admin SHALL be rejected the route and its data.

#### Scenario: An admin opens the console
- **WHEN** an admin navigates to the console route
- **THEN** the users table and totals summary render

#### Scenario: A non-admin is rejected
- **WHEN** a non-admin requests the console route or its api
- **THEN** the request is rejected through the gate

### Requirement: The users table shows each user's standing and cost against budget
Each row SHALL show email, role, current plan, signup date, topic count, attributed storage, and month-to-date variable cost shown against that user's effective budget, so an outlier is visible at a glance.

#### Scenario: A row renders the columns
- **WHEN** the console loads
- **THEN** each user row shows email, role, current plan, signup date, topic count, attributed storage, and month-to-date variable cost

#### Scenario: Cost shows against the effective budget
- **WHEN** a user's month-to-date variable cost is rendered
- **THEN** it is shown against their effective budget (the override when set, else the plan backstop)

### Requirement: A user's topic count opens their topics

The topic count in each row SHALL open that user's owned Topics beneath it, in the same table the Activity page renders for a user's own Topics, so the console answers "what is this person actually running" without a second screen to build or maintain. The count SHALL carry a marker showing whether the row is open, and a user with no Topics SHALL not be openable.

The Topics SHALL be read when the row is first opened rather than with the console, since a console listing every user would otherwise load every user's Topics to show none of them.

They SHALL be read through the same loader the owner's own Activity page uses, so an admin sees exactly what that user sees and there is no second query to drift from the first.

The email preference SHALL render read-only. It is the owner's to receive, and an admin turning it off for them is not an admin's call.

A Topic that is not public SHALL warn before it is opened, naming the visibility its owner chose. The link SHALL still work — an admin may open any Topic — but a private Topic should say so rather than read like any other row.

#### Scenario: A count opens the user's topics

- **WHEN** an admin activates a user's topic count
- **THEN** that user's Topics render beneath the row with their brews, followers, dates, visibility, and cost, and the marker shows the row is open

#### Scenario: A user with no topics cannot be opened

- **WHEN** a user's topic count is zero
- **THEN** the count is not activatable

#### Scenario: The email preference is read-only

- **WHEN** an admin views another user's Topics in the console
- **THEN** each Topic's email preference is visible and cannot be changed

#### Scenario: A private topic warns before it opens

- **WHEN** an admin points at a Topic whose visibility is private or invite
- **THEN** the link says so, and it still opens

#### Scenario: Topics load on demand

- **WHEN** the console first renders
- **THEN** no user's Topics have been read, and the first read happens when a count is opened

### Requirement: Attributed storage is a labelled attribution, not a chargeback
Attributed storage SHALL sum the bytes the user's Topics hold — resource content byte counts plus attachment byte counts plus embedding width times row count — and SHALL be labelled "Storage", never storage cost, because Resources are global and deduplicated across users, so the figure is an attribution for spotting heavy accounts, not a chargeback.

#### Scenario: Attributed storage sums the three byte sources
- **WHEN** a user's attributed storage is computed
- **THEN** it equals resource content bytes plus attachment bytes plus embedding width times embedded-row count across the user's Topics

#### Scenario: It is labelled Storage
- **WHEN** the figure renders
- **THEN** it is labelled "Storage", never "storage cost"

### Requirement: Month-to-date variable cost is observed from the Scan budget
Month-to-date variable cost SHALL be read from the same per-user spend the Scan budget records — observed, not estimated — covering only what flows through the budget (models, Firecrawl, and, once ingestion tracking lands, Exa and the paid sources), and SHALL be labelled "Cost this month", never presented as the user's full cost to serve.

#### Scenario: Cost matches the budget spend
- **WHEN** a user's month-to-date variable cost is rendered
- **THEN** it equals the per-user spend the Scan budget recorded this month, labelled "Cost this month"

### Requirement: The totals summary reports storage, cost, revenue, and contribution
The totals summary SHALL show total attributed storage, total month-to-date variable cost, total net revenue pulled from Stripe (the reporting / balance figure that already nets refunds, proration, and fees, not a naive sum of subscription prices), and a contribution figure computed on the page as net revenue minus total tracked variable cost. Contribution SHALL be labelled contribution, not profit, because the tracked cost omits fixed infrastructure and Stripe fees; an optional flat monthly fixed-cost constant MAY be subtracted to bring it closer to the true bottom line.

#### Scenario: Contribution is net revenue minus tracked variable cost
- **WHEN** the totals summary renders
- **THEN** contribution equals Stripe net revenue minus total tracked variable cost, less the optional fixed-cost constant when configured

#### Scenario: Contribution is labelled, not profit
- **WHEN** the contribution figure renders
- **THEN** it is labelled "contribution", never "profit", and net revenue is the Stripe reporting figure rather than a sum of list prices

### Requirement: Admins change role and set budget overrides through the gate
An admin SHALL change a user's role and set a per-user budget override inline, and both writes SHALL go through `isAllowed`. A budget override SHALL take precedence over the plan's monthly backstop in both directions — raising it for a trusted user or lowering it for an abusive one — and a null override SHALL mean the plan value applies. Setting or clearing an override SHALL resize that user's LiteLLM key budget to the resulting effective budget.

#### Scenario: An override raises a trusted user's budget
- **WHEN** an admin sets a budget override above the user's plan backstop
- **THEN** the override becomes the effective budget and the user's key budget is resized up

#### Scenario: An override lowers an abusive user's budget
- **WHEN** an admin sets a budget override below the user's plan backstop
- **THEN** the override becomes the effective budget and the user's key budget is resized down

#### Scenario: A null override falls back to the plan value
- **WHEN** an admin clears a user's budget override
- **THEN** the plan's monthly backstop becomes the effective budget again

### Requirement: An admin cannot remove their own admin role
The system SHALL refuse to remove an admin's own admin role, so the platform can never be locked out of its last admin. Other role changes SHALL be permitted through the gate.

#### Scenario: An admin cannot demote themselves
- **WHEN** an admin attempts to change their own role away from admin
- **THEN** the change is rejected and their role stays admin

#### Scenario: An admin can change another user's role
- **WHEN** an admin changes a different user's role
- **THEN** the change is applied through the gate

### Requirement: The users table closes an account

Each row of the users table SHALL offer a control that closes that account, gated by `admin:deleteUser` and confirming first. The confirmation SHALL name the account and say what closing it takes with it, including that its Stripe subscription is cancelled and that it cannot be undone.

The control SHALL be absent from the signed-in admin's own row, since an admin closes their own account from the account page. The console SHALL reload after a close, so the closed account's row goes with it.

A close that fails SHALL say so and leave the table as it was.

#### Scenario: An admin closes an account from the table

- **WHEN** an admin confirms the close on another user's row
- **THEN** the account is closed and the console reloads without that row

#### Scenario: An admin's own row offers no close

- **WHEN** an admin views the users table
- **THEN** their own row carries no close control

#### Scenario: A failed close is reported

- **WHEN** closing an account fails
- **THEN** the admin is told it failed and the table is unchanged

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

### Requirement: A topic's follower count opens its followers

In the console's topics subtable, a Topic's follower count SHALL open that Topic's followers beneath its row. Each
follower's row SHALL show, in the users table's order, their avatar and username linking to their profile, their email
linking to their activity page and their plan linking to their account page as the users table links them, their signup
date, and last login, then when they followed, whether the Topic's emails reach them, how many of the Topic's emails
they received, and when it last emailed them. The followers SHALL be the people the count counts: active subscriptions,
never the owner's own. They SHALL be read when the count is opened, through a route only an admin may call. A Topic row
SHALL show one subtable at a time, its scan costs or its followers. The owner's own topics table SHALL keep a plain
follower count.

#### Scenario: A follower count opens the followers

- **WHEN** an admin activates a Topic's follower count in the console
- **THEN** a table of that Topic's followers renders beneath the row, and the count's marker shows it is open

#### Scenario: A follower's row counts the emails they received

- **GIVEN** a follower the Topic has emailed three times
- **WHEN** an admin opens the Topic's followers
- **THEN** that follower's row reads 3 under Emailed, and the date of the third under Last email

#### Scenario: The list matches the count

- **GIVEN** a Topic whose owner follows it, with two active followers and one who unfollowed
- **WHEN** an admin opens its followers
- **THEN** the count reads 2 and the table lists those two followers

#### Scenario: Followers load on demand

- **WHEN** the console opens a topics subtable
- **THEN** no follower has been read, and the first read happens when a follower count is opened

#### Scenario: A topic with no followers cannot be opened

- **WHEN** a Topic's follower count is zero
- **THEN** the count button is disabled

#### Scenario: Only an admin reads followers

- **WHEN** a signed-out visitor or a user who is not an admin calls the subscribers route
- **THEN** the visitor gets 401, the user gets 403, and no subscriber is read

#### Scenario: The owner's own table keeps a plain count

- **WHEN** a user views their own topics on their profile
- **THEN** the follower count is plain text that opens nothing

