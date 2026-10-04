## ADDED Requirements

### Requirement: Plus costs $20 a month and premium $40, with $15 and $35 budgets

The plans catalog SHALL price plus at $20 a month and premium at $40 a month, and yearly billing SHALL stay ten times
the monthly price, so $200 and $400 a year. The monthly budget SHALL be $15 on plus and $35 on premium. Free, the daily
Topic limits, the daily scan limits, and metered overage SHALL NOT change. The pricing page, the Plans and limits docs
page, and the homepage's structured data SHALL show the catalog's prices. Checkout SHALL charge the Stripe Price that
the plan and interval's `STRIPE_PRICE_*` value names. A user's key SHALL take the new budget the next time it is
replaced: at the monthly reset, a plan change, or a budget override.

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
- **THEN** it reads $0, and its limits are the ones it had before

### Requirement: Monthly spend is the sum of scan, chat, and podcast episode spend

A user's monthly spend against their monthly budget SHALL be the sum of their recorded Scan cost, their recorded chat
turn cost, and their recorded Podcast Episode cost for the current UTC month. Every check that reads monthly spend SHALL
read that same sum: the manual-scan gate, the chat gate, the account meter, and the episode budget check.

#### Scenario: Chat spend counts toward the monthly budget

- **WHEN** a user has recorded chat turn cost this month
- **THEN** that cost is included in the monthly spend figure that the manual-scan gate reads

#### Scenario: A budget spent on Scans stops chat

- **WHEN** a user's Scan cost alone reaches their monthly budget
- **THEN** further chat turns are rejected

#### Scenario: Podcast Episode spend counts toward the monthly budget

- **WHEN** a user has recorded Podcast Episode cost this month
- **THEN** that cost is included in the monthly spend figure that the chat gate and the account meter read

## MODIFIED Requirements

### Requirement: Metering and dunning are surfaced to the user
The UI SHALL show the user their scan usage against the daily limit and any metered overage, SHALL show their monthly
spend against their effective budget with chat spend, scan spend, and podcast episode spend rendered as distinct
segments of one bar, and SHALL surface a past-due / dunning state when a payment fails, with a path to the Customer
Portal to update payment.

#### Scenario: Usage shows against the limit
- **WHEN** a subscribed user views their billing state
- **THEN** the UI shows scan usage against the daily limit and any billed overage

#### Scenario: Chat spend reads apart from scan spend
- **WHEN** a user with both chat spend and scan spend this month views their account page
- **THEN** the spend bar shows the two as distinguishable colored segments against one budget total

#### Scenario: Podcast Episode spend reads apart from scan and chat spend
- **WHEN** a user with podcast episode spend this month views their account page
- **THEN** the spend bar shows it as its own segment against the same budget total

#### Scenario: A past-due subscription prompts dunning
- **WHEN** a user's subscription is past due after a failed payment
- **THEN** the UI surfaces the dunning state with a link to the Customer Portal

### Requirement: A plan card describes its limits in scans, not dollars

Each pricing card SHALL describe its plan in the units a reader can reason about, and SHALL NOT show the monthly spend
backstop. That figure is our cost limit, not the reader's price, and on a page about what things cost it reads as a
second charge.

Each card SHALL list, in this order: how many Topics the plan allows, how many of them run on a daily schedule, how many
manual scans a day, an approximate monthly scan total, and the plan's podcast line. The order matters: each line answers
the question the line above it raises. The podcast line SHALL read "One Coffee Break episode per topic" on the free plan
and "Coffee Break podcast after every brew" on a paid plan.

The monthly scan total SHALL be stated as approximate, since it depends on how the user schedules their Topics. It SHALL
be derived from the plan's monthly budget and the average cost of one scan, rounded up to the next ten.

#### Scenario: A card reads in scans

- **WHEN** a pricing card renders
- **THEN** it lists topics, daily-scheduled topics, manual scans a day, an approximate monthly scan total, and its
  podcast line, and shows no dollar budget

#### Scenario: The free card

- **WHEN** the free card renders at the monthly interval
- **THEN** it reads 3 topics, 1 on a daily schedule, 5 manual scans a day, about 30 scans a month, and its podcast
  line reads "One Coffee Break episode per topic"

#### Scenario: The paid cards

- **WHEN** the plus and premium cards render at the monthly interval
- **THEN** plus reads 10, 3, 15, and about 150, and premium reads 25, 6, 30, and about 350, and each podcast line
  reads "Coffee Break podcast after every brew"

## REMOVED Requirements

### Requirement: Monthly spend is the sum of scan spend and chat spend

**Reason**: Podcast Episodes are a third kind of spend on the same budget, so the sum has three parts.

**Migration**: See "Monthly spend is the sum of scan, chat, and podcast episode spend" in this spec.
