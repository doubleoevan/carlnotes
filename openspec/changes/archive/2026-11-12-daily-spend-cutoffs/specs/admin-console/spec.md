# Spec Delta

## ADDED Requirements

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
