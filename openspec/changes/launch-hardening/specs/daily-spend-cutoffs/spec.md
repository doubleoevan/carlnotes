## MODIFIED Requirements

### Requirement: Free-plan spend is the UTC day's spend billed to free users

The free-plan spend SHALL be the spend recorded since midnight UTC that bills a user whose plan is free and who is not
an admin. It SHALL sum every kind of spend that the day's spend report sums and that bills a user, read by each user's
current plan and role, a user's own rows in the `spends` table among them. A `spends` row with no user is the
platform's, and SHALL NOT count toward it. A paid user's or an admin's spend SHALL NOT count toward it.

#### Scenario: A paid user's spend does not count

- **GIVEN** a free user who spent 30 dollars today and a paid user who spent 200 dollars today
- **WHEN** the free-plan spend is read
- **THEN** it is 30 dollars

#### Scenario: An admin's spend does not count

- **GIVEN** an admin on the free plan who spent 80 dollars today
- **WHEN** the free-plan spend is read
- **THEN** the admin's 80 dollars are left out

#### Scenario: Yesterday's spend does not count

- **GIVEN** a free user who spent 120 dollars before midnight UTC and nothing since
- **WHEN** the free-plan spend is read after midnight UTC
- **THEN** it is zero

#### Scenario: The platform's spend does not count

- **GIVEN** a day on which the film backfill's renders cost the platform 40 dollars and free users spent 30 dollars
- **WHEN** the free-plan spend is read
- **THEN** it is 30 dollars

#### Scenario: A free user's url fetch counts

- **GIVEN** a free user whose url attachment's fetch was recorded today
- **WHEN** the free-plan spend is read
- **THEN** it includes that fetch's cost
