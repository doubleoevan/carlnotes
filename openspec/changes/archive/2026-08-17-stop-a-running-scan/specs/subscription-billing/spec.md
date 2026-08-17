## MODIFIED Requirements

### Requirement: Metered manual-scan overage makes the daily limit soft only with a card on file

When a user has a card on file **and their subscription carries the metered overage price**, the daily scan limit SHALL be soft: each manual Scan beyond the plan's daily scan limit SHALL be allowed and reported to Stripe as a usage record for per-update billing. Otherwise the limit SHALL be a hard cap and the api SHALL reject manual Scans beyond it.

A manual Scan the user stopped SHALL NOT be reported as a usage record, because a stopped Scan gives its daily brew back and so no longer exceeds the limit the overage bills for. The dollars it spent before the stop SHALL still count against the user's monthly budget.

Only a monthly subscription carries that price, because Stripe rejects a subscription whose prices disagree about their billing interval. The subscription SHALL record its billing interval, and whether overage can be billed SHALL derive from it rather than being stored as a second flag that could disagree.

The recorded interval SHALL be read from the prices the Stripe subscription actually carries, not from the metadata stamped on it at checkout. Changing plan in the Customer Portal swaps the price and leaves our own metadata untouched, so the stamp goes stale the moment a subscriber switches — holding a yearly subscriber to monthly limits, or leaving a subscriber who moved back to monthly with a limit that can no longer be softened. Because the metered overage price always bills monthly, a subscription SHALL count as yearly when any of its prices does. An event carrying no prices SHALL fall back to the stamped interval, and one carrying neither SHALL read as monthly.

#### Scenario: A card on file bills the overage
- **WHEN** a monthly subscriber with a card on file makes a manual Scan beyond their daily limit
- **THEN** the Scan is allowed and a usage record is reported to Stripe

#### Scenario: A stopped overage Scan is not billed
- **GIVEN** a monthly subscriber with a card on file whose manual Scan beyond their daily limit is running
- **WHEN** they stop it
- **THEN** no usage record is reported to Stripe

#### Scenario: No card keeps the cap hard
- **WHEN** a user with no card on file reaches their daily limit
- **THEN** further manual Scans are rejected

#### Scenario: A yearly subscription has no soft limit
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
