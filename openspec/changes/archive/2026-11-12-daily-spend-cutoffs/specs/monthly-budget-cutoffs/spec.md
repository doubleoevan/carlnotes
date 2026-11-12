# Spec Delta

## ADDED Requirements

### Requirement: The account page groups its budget and settings into sections

On the web and in the mobile app the account page SHALL show its budget in an expandable Budget section with a circle
dollar sign icon, and its settings in an expandable Settings section with a gear icon, both open at first. The Budget
section SHALL hold a coffee fund card and a brews card, each with its title at its top left and its rings centered at
its top, each ring's caption centered under it.

#### Scenario: Both sections start open

- **WHEN** a user opens the account page
- **THEN** the Budget section shows the coffee fund card and the brews card, and the Settings section shows the settings

### Requirement: The coffee fund card counts down to the monthly budget reset

The coffee fund card's ring SHALL show the days until the monthly budget resets on the first of the UTC month, captioned
"until Coffee fund reset", with the month's spend against the monthly budget at its top right on every width. The ring's
arc SHALL be the share of the month left. Under a day left it SHALL show hours and minutes. The ring SHALL re-read the
time each minute.

#### Scenario: Noon on the 11th of a 30-day month

- **GIVEN** the time is 12:00 UTC on November 11
- **WHEN** a user opens the account page
- **THEN** the coffee fund card's ring shows 19 days until Coffee fund reset and the brews card's ring shows 12h 0m
  until Brew limit reset

#### Scenario: The last hours of the month

- **GIVEN** the time is 23:00 UTC on December 31
- **WHEN** a user opens the account page
- **THEN** the coffee fund card's ring shows 1h 0m until Coffee fund reset

### Requirement: The brews card counts down to the daily Scan limit reset

The brews card SHALL show the day's Scans used against the daily Scan limit on a ring, captioned with the daily limit's
note once the limit is reached, to the left of a ring of the hours and minutes until the daily Scan limit resets at
midnight UTC, captioned "until Brew limit reset", with a gap between them. The reset ring's arc SHALL be the share of
the day left, and it SHALL re-read the time each minute.

#### Scenario: A free user past the daily limit

- **GIVEN** a free user with 14 Scans today on a daily Scan limit of 5
- **WHEN** the user opens the account page
- **THEN** the brews card's first ring shows 14 of 5 used with its arc closed, captioned "You have reached your daily
  limit."

### Requirement: Each budget card ends with the plan

Each budget card SHALL end with the current plan at its bottom left, its billing interval after a middle dot on a paid
plan, and the plan button right after it. An admin's read-only view of another user's account SHALL show no plan
button.

#### Scenario: A paid plan shows its interval

- **GIVEN** a user on the Plus plan billed yearly
- **WHEN** the user opens the account page
- **THEN** each budget card ends with "Plan Plus · billed yearly" and the plan button after it

#### Scenario: An admin's view has no plan button

- **WHEN** an admin opens another user's account page
- **THEN** neither budget card shows a plan button
