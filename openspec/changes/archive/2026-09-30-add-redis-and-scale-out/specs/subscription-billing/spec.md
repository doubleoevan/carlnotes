## MODIFIED Requirements

### Requirement: A user's budget period is the UTC calendar month

A user's key budget SHALL reset on the first of every month at midnight UTC, the same boundary the monthly spend sum
starts from, so the budget the proxy enforces and the spend the account page shows run over one window. The app SHALL
perform the reset itself by replacing the user's key with a fresh one at their current budget and retiring
the old one, the replacement a plan change or a budget override already makes. A key SHALL NOT have a
`budget_duration`, so the proxy has no window of its own. It SHALL keep its `max_budget`, so spend can never run past
the budget between resets.

The user's row SHALL record when their current key was created, and a key created before the start of the current
month SHALL be replaced. A key created during the month, by signup or by any other replacement, SHALL be kept until the next
first.

The replacement SHALL be done by the reset job, run on its own schedule once a day shortly after midnight UTC and never
inside the scheduled sweep, so replacing every user's key on the first holds up no Scan. The job SHALL replace keys
with bounded concurrency, several at a time against the proxy and never all at once, and each user's replacement SHALL
be its own attempt: a failure is reported, the remaining users are still replaced, and that user is tried again by the
next day's reset. The job SHALL take its own database claim, the same kind the sweep takes, so two overlapping resets cannot
replace a key twice. The job's summary SHALL count how many keys it replaced and how many replacements failed. A key the
job has not yet replaced keeps working until its budget is spent, so the sweep never waits on the job.

#### Scenario: A key from last month is replaced on the first

- **WHEN** the first reset of a month finds a user whose key was created in the previous month
- **THEN** the user has a fresh key at their budget, its spend at zero, the old key is retired, and the row
  records the new key's time

#### Scenario: A key replaced mid-month is replaced again on the first

- **WHEN** an admin's budget override replaced a user's key on the 25th
- **THEN** the first reset of the next month replaces it again, since the period is the month and not the key's age

#### Scenario: A key created this month is kept

- **WHEN** a user signed up on the 3rd
- **THEN** no reset that month replaces their key, and the first reset of the next month does

#### Scenario: A failed replacement is retried

- **WHEN** the proxy rejects a replacement for one user
- **THEN** that user's row still shows last month's key time, the failure is reported, and the next day's reset tries again

#### Scenario: The reset holds up no Scan

- **WHEN** the reset job replaces ten thousand keys on the first
- **THEN** the sweeps that run meanwhile dispatch Scans on whatever key each owner holds, fresh or not

#### Scenario: A second reset replaces nothing twice

- **WHEN** a reset starts while another holds the claim
- **THEN** it exits having replaced no key
