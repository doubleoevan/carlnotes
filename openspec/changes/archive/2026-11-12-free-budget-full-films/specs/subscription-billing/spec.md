## RENAMED Requirements

- FROM: `### Requirement: A plan card describes its limits in scans, not dollars`
- TO: `### Requirement: A plan card describes its limits in scans, beside its coffee fund`

## MODIFIED Requirements

### Requirement: A plan card describes its limits in scans, beside its coffee fund

Each pricing card SHALL describe its plan in the units a reader can reason about. Its limits SHALL read in Topics and
scans, and its only dollar figure outside the price SHALL be the coffee fund, the plan's monthly budget.

Each card SHALL list, in this order among its lines: how many Topics the plan allows, how many of them run on a daily
schedule, how many manual scans a day, the coffee fund, an approximate monthly scan total, and the plan's podcast line.
The podcast line SHALL read "Short podcast for latest brew only" on the free plan and "Full podcasts for every brew" on
a paid plan.

The monthly scan total SHALL be stated as approximate, since it depends on how the user schedules their Topics. It SHALL
be derived from the plan's monthly budget and the average cost of one scan, rounded up to the next ten.

#### Scenario: A card reads in scans

- **WHEN** a pricing card renders
- **THEN** it lists topics, daily-scheduled topics, manual scans a day, its coffee fund, an approximate monthly scan
  total, and its podcast line

#### Scenario: The free card

- **WHEN** the free card renders at the monthly interval for a visitor
- **THEN** it reads 1 topic, 1 on a daily schedule, 5 manual scans a day, a $2 coffee fund, and about 20 scans a month,
  and its podcast line reads "Short podcast for latest brew only"

#### Scenario: The paid cards

- **WHEN** the plus and premium cards render at the monthly interval
- **THEN** plus reads 10, 3, 15, $15, and about 150, and premium reads 25, 6, 30, $35, and about 350, and each podcast
  line reads "Full podcasts for every brew"

### Requirement: Plus costs $20 a month and premium $40, with $15 and $35 budgets

The plans catalog SHALL price plus at $20 a month and premium at $40 a month, and yearly billing SHALL stay ten times
the monthly price, so $200 and $400 a year. The monthly budget SHALL be $15 on plus and $35 on premium. Free's price,
the daily Topic limits, the daily scan limits, and metered overage SHALL NOT change. The pricing page, the Plans and
limits docs page, and the homepage's structured data SHALL show the catalog's prices. Checkout SHALL charge the Stripe
Price that the plan and interval's `STRIPE_PRICE_*` value names. A user's key SHALL take the new budget the next time it
is replaced: at the monthly reset, a plan change, or a budget override.

#### Scenario: The pricing page shows the new prices

- **WHEN** the plus and premium cards render at the monthly interval
- **THEN** plus reads $20 a month and premium reads $40 a month

#### Scenario: Yearly stays ten times monthly

- **WHEN** the plus and premium cards render at the yearly interval
- **THEN** plus is billed $200 a year and premium $400 a year

#### Scenario: An existing key takes the new budget at the monthly reset

- **GIVEN** a plus user whose key was created before the change with a $10 budget
- **WHEN** the monthly reset replaces their key
- **THEN** the new key's budget is $15

#### Scenario: Free does not change

- **WHEN** the free card renders
- **THEN** it reads $0, and its Topic and scan limits are the ones it had before
