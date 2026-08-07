## ADDED Requirements

### Requirement: A plan card describes its limits in scans, not dollars

Each pricing card SHALL describe its plan in the units a reader can reason about, and SHALL NOT show the monthly spend backstop. That figure is our cost ceiling, not the reader's price, and on a page about what things cost it reads as a second charge.

Each card SHALL list, in this order: how many Topics the plan allows, how many of them run on a daily schedule, how many manual scans a day, and an approximate monthly scan total. The order matters: each line answers the question the line above it raises.

The monthly scan total SHALL be stated as approximate, since it depends on how the user schedules their Topics.

#### Scenario: A card reads in scans

- **WHEN** a pricing card renders
- **THEN** it lists topics, daily-scheduled topics, manual scans a day, and an approximate monthly scan total, and shows no dollar budget

#### Scenario: The free card

- **WHEN** the free card renders at the monthly interval
- **THEN** it reads 3 topics, 1 on a daily schedule, 5 manual scans a day, and about 50 scans a month

#### Scenario: The paid cards

- **WHEN** the plus and premium cards render at the monthly interval
- **THEN** plus reads 10, 3, 15, and about 170, and premium reads 25, 6, 30, and about 340

### Requirement: The yearly toggle marks the limits it raises

When the yearly interval is selected, the cards SHALL show that interval's limits, and SHALL mark the lines whose value actually changed.

Prepaying raises the daily-topic and manual-scan limits but not the topic limit, so without a marker a reader has to hold two states in their head and diff them. Marking the moved lines makes the benefit of prepaying visible rather than something to be noticed.

#### Scenario: The moved lines are marked

- **WHEN** a reader switches the toggle to yearly
- **THEN** the daily-topic and manual-scan lines show the yearly values and are marked as raised, while the topic-limit line is not

#### Scenario: Monthly shows no markers

- **WHEN** the toggle is on monthly
- **THEN** no line is marked, since none has moved from anything

## MODIFIED Requirements

### Requirement: Metered manual-scan overage makes the daily ceiling soft only with a card on file

When a user has a card on file **and their subscription carries the metered overage price**, the daily scan ceiling SHALL be soft: each manual Scan beyond the plan's daily scan limit SHALL be allowed and reported to Stripe as a usage record for per-update billing. Otherwise the ceiling SHALL be a hard cap and the api SHALL reject manual Scans beyond it.

Only a monthly subscription carries that price, because Stripe refuses a subscription whose prices disagree about their billing interval. The subscription SHALL record its billing interval, and whether overage can be billed SHALL derive from it rather than being stored as a second flag that could disagree.

The recorded interval SHALL be read from the prices the Stripe subscription actually carries, not from the metadata stamped on it at checkout. Changing plan in the Customer Portal swaps the price and leaves our own metadata untouched, so the stamp goes stale the moment a subscriber switches — holding a yearly subscriber to monthly limits, or leaving a subscriber who moved back to monthly with a ceiling that can no longer be softened. Because the metered overage price always bills monthly, a subscription SHALL count as yearly when any of its prices does. An event carrying no prices SHALL fall back to the stamped interval, and one carrying neither SHALL read as monthly.

#### Scenario: A card on file bills the overage
- **WHEN** a monthly subscriber with a card on file makes a manual Scan beyond their daily limit
- **THEN** the Scan is allowed and a usage record is reported to Stripe

#### Scenario: No card keeps the cap hard
- **WHEN** a user with no card on file reaches their daily limit
- **THEN** further manual Scans are rejected

#### Scenario: A yearly subscription has no soft ceiling
- **GIVEN** a yearly subscriber with a card on file
- **WHEN** they reach their daily scan limit
- **THEN** further manual Scans are rejected, because there is no metered price for the usage to bill against

#### Scenario: The interval is the stored fact
- **WHEN** the webhook records a subscription
- **THEN** it stores the billing interval, and overage-billability is derived from it rather than stored alongside it

#### Scenario: A plan changed in the portal is recorded at its new interval
- **GIVEN** a subscriber who checked out monthly and then switched to yearly in the Customer Portal
- **WHEN** the webhook records the subscription
- **THEN** it reads yearly from the subscription's price, not monthly from the stamp checkout left behind

#### Scenario: A monthly subscription carrying its overage price reads as monthly
- **WHEN** the webhook records a monthly subscription holding both its plan price and the metered overage price
- **THEN** it reads as monthly, since neither price is yearly

#### Scenario: An event with no prices falls back to the stamp
- **WHEN** the webhook records a subscription whose payload carries no price items
- **THEN** it reads the interval stamped at checkout, and reads monthly when there is no stamp either
