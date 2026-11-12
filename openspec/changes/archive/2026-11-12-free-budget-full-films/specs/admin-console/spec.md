## MODIFIED Requirements

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
- **THEN** the estimated monthly spend's table marks 2 signups a day over the past 30 days at 123 dollars and 6 dollars
  per day, and shows 435 dollars and 22 dollars per day at 10 signups a day

#### Scenario: The highest cutoff limits the monthly spend

- **GIVEN** 12 free users with 45 dollars of monthly budgets, the default cutoffs, and the time is 12:00 UTC on November
  11
- **WHEN** an admin opens the console
- **THEN** the estimated monthly spend's row of 1000 signups a day shows 2925 dollars and 150 dollars per day with 39045
  dollars without cutoffs, and the most this month is 2925 dollars at 150 dollars a day


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
- **THEN** the cutoff table's row of 1000 signups a day shows the podcast episodes cutoff passed after 46m, the
  scheduled scans cutoff after 1h 11m, and the chat cutoff after 1h 47m, its row of 10 signups a day shows Not reached
  for each, and each cutoff's slider ends at 2003 dollars

#### Scenario: A cutoff slider moves the table before a save

- **GIVEN** 12 free users with 45 dollars of monthly budgets, the default cutoffs, and the time is 12:00 UTC on November
  11
- **WHEN** an admin moves the "Skip podcast episodes after first at" slider to 1500 dollars
- **THEN** the podcast episodes cutoff's field shows 1500, the cutoff table's row of 1000 signups a day shows that
  cutoff passed after 17h 58m, and the console sends no request

