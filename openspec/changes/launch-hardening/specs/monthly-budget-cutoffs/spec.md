## ADDED Requirements

### Requirement: A paid call with no row of its own is recorded in the spends table

A `spends` table SHALL hold each paid call that no other row records: a kind, a nullable user, a nullable Topic and
Podcast Episode, a cost, and the time the cost was incurred. A row with a user SHALL bill that user: a url
attachment's fetch, a url Source's screen fetch, and a source suggestion's search. A row with no user SHALL be the
platform's: a platform-billed film's render minutes, generated chapter images, and own image, and text moderation.

#### Scenario: A url attachment's fetch is the user's spend

- **WHEN** a user adds a url attachment and its page is fetched
- **THEN** a `spends` row holds the fetch's cost, the user, and the Topic

#### Scenario: Text moderation is the platform's spend

- **WHEN** a Comment's text is classified
- **THEN** a `spends` row with no user holds the call's cost, and the day's total spend includes it

### Requirement: A url fetch and a source suggestion search check the budget first

Before a url attachment's fetch, a url Source's screen fetch, and a source suggestion's search, the app SHALL check
the user's monthly budget, as a chat turn does, and SHALL reject the call if the budget is spent. A call that runs
SHALL count in that user's monthly spend and, for a free user who is not an admin, in the free-plan spend. The routes
that start these calls SHALL share the tool caller limit, as the suggestion route does.

#### Scenario: A spent budget rejects a url attachment

- **GIVEN** a user whose monthly budget is spent
- **WHEN** they add a url attachment
- **THEN** the request is rejected as a spent budget, and no page is fetched

#### Scenario: A burst of url attachments is limited

- **WHEN** one user adds more url attachments in a minute than the tool caller limit allows
- **THEN** the calls past the limit are rejected, and no page is fetched for them

#### Scenario: A source suggestion's search counts in the month

- **GIVEN** a plus user with budget left
- **WHEN** they ask for source suggestions and the search runs
- **THEN** their monthly spend rises by the search's cost

## MODIFIED Requirements

### Requirement: Each plan stops kinds of spend at shares of the monthly budget
Each plan SHALL set a monthly budget cutoff for each kind of spend it stops before the budget runs out, as a share of
the user's monthly budget, so the daily Scans the plan allows are paid for last:

| Cutoff | Free | Plus | Premium |
| --- | --- | --- | --- |
| Spoken questions | 15% | 40% | 50% |
| Full Podcast Episodes, which turn short | none | 60% | 70% |
| Podcast Episodes | 20% | 75% | 85% |
| Daily Scans, which turn weekly | moves | moves | moves |
| Manual Scans | 90% | 90% | 90% |

A cutoff SHALL be passed once the month's spend is at or past its share of the budget. Every check SHALL read the same
monthly spend sum that the spend meter and every other budget check read. That sum SHALL include the user's own rows in
the `spends` table, and SHALL never include a row with no user, which is the platform's. An admin with no budget
override SHALL have no cutoffs. An admin with an override SHALL have the cutoffs of their plan, since the override is a
deliberate limit.

#### Scenario: A plus user's spoken questions pause at 40 percent
- **GIVEN** a plus user with no daily Topics whose spend this month is $5.99 of a $15 budget
- **WHEN** their spend reaches $6.00
- **THEN** the spoken questions cutoff is passed, and no other cutoff is

#### Scenario: An admin with no budget override has no cutoffs
- **GIVEN** an admin with no budget override whose spend this month is $950
- **WHEN** any cutoff is checked
- **THEN** none is passed

#### Scenario: The platform's film cost passes no cutoff
- **GIVEN** a plus user whose films the backfill re-rendered this month on the platform's bill
- **WHEN** any cutoff is checked
- **THEN** the re-renders' cost is not in the user's spend
