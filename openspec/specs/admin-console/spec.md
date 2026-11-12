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

### Requirement: The console shows the free-plan spend against the daily spend cutoffs

The console SHALL show today's free-plan spend, titled the free plan budget, on a meter with a circle at each daily
spend cutoff as typed, which follows its field and slider before a save and fades once passed. Under it a list SHALL
show what each cutoff stops in the order of their defaults, each with its field, and strike a passed cutoff's line
through. It SHALL read the settings fresh and not through the cache.

#### Scenario: A passed cutoff is marked

- **GIVEN** a free-plan spend of 72 dollars and the default cutoffs
- **WHEN** an admin opens the console
- **THEN** it shows 72 dollars, the podcast episodes cutoff of 65 dollars as passed, and the scheduled scans cutoff of
  100 dollars as not passed

#### Scenario: A non-admin cannot read the cutoffs

- **WHEN** a non-admin requests the console's api
- **THEN** the request is rejected through the gate, and no spend or setting is returned

### Requirement: The console counts down to the daily cutoffs' reset

The spend controls SHALL sit in a collapsible Limits section with the count of its cutoffs, limit, alert, and
permission. A clock at its top center SHALL show the time left until the daily spend cutoffs reset at midnight UTC, on a
ring whose arc is the share of the day left.

#### Scenario: The clock counts down to midnight UTC

- **GIVEN** the time is 12:00 UTC
- **WHEN** an admin opens the console
- **THEN** the Limits section's clock shows 12 hours until the cutoffs reset with half its ring left

### Requirement: The console estimates the month's free-plan spend

Titled "Estimated monthly spend if free users use their whole budget", a table SHALL show for 10, 100, 1000, and 10000
signups a day and the past days' daily signup average the worst case in whole dollars of every free user who is not an
admin and each signup before the next UTC month spending their whole monthly budget, with the spend per day over the
days left. Each SHALL be limited to the highest cutoff as typed for each day left, with the month without cutoffs
beside it.

#### Scenario: The estimated monthly spend in November

- **GIVEN** 12 free users with 45 dollars of monthly budgets, 60 signups in the past 30 days, and the time is 12:00 UTC
  on November 11
- **WHEN** an admin opens the console
- **THEN** the estimated monthly spend's table marks 2 signups a day over the past 30 days at 162 dollars and 8 dollars
  per day, and shows 630 dollars and 32 dollars per day at 10 signups a day

#### Scenario: The highest cutoff limits the monthly spend

- **GIVEN** 12 free users with 45 dollars of monthly budgets, the default cutoffs, and the time is 12:00 UTC on November
  11
- **WHEN** an admin opens the console
- **THEN** the estimated monthly spend's row of 1000 signups a day shows 2925 dollars and 150 dollars per day with 58545
  dollars without cutoffs, and the most this month is 2925 dollars at 150 dollars a day

### Requirement: The estimate reads a chosen number of past days

The estimate's past days row SHALL show the daily signup average to one decimal, marked with how many past days it
reads. A slider under the table SHALL pick from 1 to 30 past days, 30 at first, and the table SHALL follow it from the
signups of each of the past 30 days read once with the console. Above the slider the most this month SHALL show the
highest cutoff for each day left, noting that first scans and a Topic's first podcast episode can still add to it.

#### Scenario: The slider reads fewer past days

- **GIVEN** 4 signups today and none in the 29 days before
- **WHEN** an admin moves the past days slider to 2
- **THEN** the estimated monthly spend's table marks 2 signups a day over the past 2 days, and the console sends no
  request

### Requirement: The console shows how long after midnight UTC each cutoff is passed

A table titled "Time from midnight UTC to each cutoff" SHALL show for the same rates how long after midnight UTC, as in
"4h 55m", an even day of each rate's spend per day passes each cutoff as typed, or Not reached. Its columns SHALL be
"Podcast episodes after first skipped", "Scheduled scans stop", and "Chat stops". Under it the sliders "Skip podcast
episodes after first at", "Stop scheduled scans at", and "Stop chat at" SHALL set each cutoff in whole dollars and
follow its field.

#### Scenario: The table shows when each cutoff is passed

- **GIVEN** 12 free users with 45 dollars of monthly budgets, the default cutoffs, and the time is 12:00 UTC on November
  11
- **WHEN** an admin opens the console
- **THEN** the cutoff table's row of 1000 signups a day shows the podcast episodes cutoff passed after 31m, the
  scheduled scans cutoff after 47m, and the chat cutoff after 1h 11m, its row of 10 signups a day shows Not reached for
  each, and each cutoff's slider ends at 3003 dollars

#### Scenario: A cutoff slider moves the table before a save

- **GIVEN** 12 free users with 45 dollars of monthly budgets, the default cutoffs, and the time is 12:00 UTC on November
  11
- **WHEN** an admin moves the "Skip podcast episodes after first at" slider to 1500 dollars
- **THEN** the podcast episodes cutoff's field shows 1500, the cutoff table's row of 1000 signups a day shows that
  cutoff passed after 11h 59m, and the console sends no request

### Requirement: The console shows the first scan limit, the signup alert, and the permission

Each in its own row the console SHALL show the Waiting Scans on a ring against the first Scan dispatch limit, titled
the first scan limit, and the past hour's signups on a ring against the signup alert threshold, titled the hourly
signup alert, each ring at the left with its title and field beside it. A switch SHALL show the permission that allows
unverified email sign-ups to scan. A divider SHALL separate the cutoffs, each limit, and the permission.

#### Scenario: The waiting count matches the Waiting Scans

- **GIVEN** 9 Waiting Scans and a first Scan dispatch limit of 5
- **WHEN** an admin opens the console
- **THEN** it shows a limit of 5 and 9 Scans waiting

#### Scenario: The signups meter shows the past hour

- **GIVEN** 64 accounts created in the past hour and the default signup alert threshold
- **WHEN** an admin opens the console
- **THEN** it shows 64 signups against a threshold of 50

#### Scenario: Turning the permission off holds unverified sign-ups

- **GIVEN** the unverified accounts switch is off
- **WHEN** an admin turns off the permission that allows unverified email sign-ups to scan
- **THEN** the unverified accounts switch is saved as on

### Requirement: Admins save and clear the spend control overrides through the gate

An admin SHALL save an override for each cutoff, the first Scan dispatch limit, and the signup alert threshold, and turn
the unverified accounts switch on or off, through `isAllowed(user, "admin:console")`. Each field SHALL show an override
as its value and the default as its placeholder, and an empty value SHALL clear that override. Saving SHALL drop the
cached settings and cutoff state, and record who saved it and when.

#### Scenario: An admin overrides a cutoff

- **WHEN** an admin types a podcast episodes cutoff of 40 dollars and presses Save daily cutoffs
- **THEN** the cutoff's field shows 40 dollars as its value, and the next read of the cutoff state uses 40 dollars

#### Scenario: An admin clears an override

- **GIVEN** an overridden signup alert threshold of 200
- **WHEN** the admin empties the field and leaves it
- **THEN** the field is empty and shows the default threshold as its placeholder

#### Scenario: An invalid value is rejected

- **WHEN** an admin saves a cutoff of zero or less, a negative dispatch limit, or a signup alert threshold below one
- **THEN** the save is rejected with a validation error, and the stored overrides are unchanged

#### Scenario: A non-admin cannot save an override

- **WHEN** a non-admin posts an override
- **THEN** the request is rejected through the gate, and nothing is saved

### Requirement: The daily cutoffs save together

The cutoffs SHALL save together from a Save daily cutoffs button, which stays off until a cutoff changes. A Reset
button SHALL put back their saved values, and a Defaults button after it, off while every cutoff reads its default,
SHALL empty every cutoff's field, each without a request. Each other setting SHALL save when its field loses focus, and
the switch when it is flipped, each with the saved cutoffs and never a typed one.

#### Scenario: Reset puts back the saved cutoffs

- **GIVEN** a typed podcast episodes cutoff of 40 dollars that is not saved
- **WHEN** the admin presses Reset
- **THEN** the cutoff's field shows its saved value, Save daily cutoffs is off, and the console sends no request

#### Scenario: Defaults empties the cutoffs

- **GIVEN** a saved scheduled scans cutoff of 80 dollars
- **WHEN** the admin presses Defaults and then Save daily cutoffs
- **THEN** every cutoff's field shows its default as its placeholder, Defaults is off, and the save sends each cutoff as
  null

#### Scenario: A setting saved on its own keeps the saved cutoffs

- **GIVEN** a typed podcast episodes cutoff of 40 dollars that is not saved
- **WHEN** the admin types a first scan limit of 3 and leaves its field
- **THEN** the first scan limit is saved as 3 and the podcast episodes cutoff keeps its saved value
