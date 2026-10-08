# subscription-billing Specification

## Purpose
TBD - created by archiving change add-authz-plans-billing. Update Purpose after archive.
## Requirements
### Requirement: A Billing Subscription maps a Stripe subscription to a plan and derives the user's plan
The system SHALL persist a `billing_subscriptions` row for a user's active paid Stripe subscription, carrying the user, Stripe customer id, Stripe subscription id, plan, status, and current period end. The user's current plan SHALL be derived from their active billing subscription; a user with no active row SHALL be `free`. `users.plan` SHALL be a projection kept in sync from Stripe webhooks so the gate and quota reads stay a single row. The Billing Subscription noun SHALL be distinct from the topic `Subscription` (subscriber ↔ Topic).

#### Scenario: No active row means free
- **WHEN** a user has no active `billing_subscriptions` row
- **THEN** their derived plan is `free` and `users.plan` reads `free`

#### Scenario: An active subscription sets the plan
- **WHEN** a user has an active `billing_subscriptions` row for `plus`
- **THEN** their derived plan is `plus` and `users.plan` mirrors it

### Requirement: Checkout runs through Stripe Checkout and the Customer Portal, with Link enabled by Dashboard toggle
Upgrades SHALL run through a Stripe Checkout Session for the target plan's price, and subscription management (payment method, cancel) SHALL run through the Stripe Customer Portal. Link — including Link Instant Bank Payments at the lower bank rate — SHALL be enabled as a Stripe Dashboard payment-method toggle, not a code path, so the integration surface stays Stripe Billing subscriptions, webhooks, and the Customer Portal.

#### Scenario: Upgrading opens Checkout for the plan price
- **WHEN** a signed-in user chooses to upgrade to a paid plan
- **THEN** the app creates a Stripe Checkout Session for that plan's price and redirects the user to it

#### Scenario: Managing billing opens the Customer Portal
- **WHEN** a subscribed user chooses to manage billing
- **THEN** the app opens the Stripe Customer Portal for their customer

### Requirement: Stripe webhooks are the source of truth for subscription state
A Stripe webhook endpoint SHALL verify the Stripe signature and reject unsigned or invalid events. On subscription lifecycle events it SHALL create, update, or clear the user's `billing_subscriptions` row and its `users.plan` projection, and SHALL resize the user's LiteLLM key budget to the new plan's monthly backstop (or the per-user override when set).

#### Scenario: A completed checkout activates the plan
- **WHEN** a valid subscription-active webhook (for example `checkout.session.completed`) arrives for a user
- **THEN** their `billing_subscriptions` row and `users.plan` reflect the purchased plan and their key budget is resized to it

#### Scenario: A cancellation reverts to free
- **WHEN** a valid subscription-cancelled webhook arrives
- **THEN** the active row is cleared, `users.plan` becomes `free`, and the key budget is resized to the free backstop

#### Scenario: An unsigned webhook is rejected
- **WHEN** a request to the webhook endpoint fails Stripe signature verification
- **THEN** the endpoint rejects it and writes nothing

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

### Requirement: Plan tier names are free, plus, and premium end to end
The Stripe products and prices and the gate SHALL use one spelling of the plan tiers — `free`, `plus`, `premium` — reconciling the provisional Starter/Pro names so a single value reaches the Stripe product metadata, the `plan` enum, and the gate.

#### Scenario: A Stripe price maps to a plan enum value
- **WHEN** a Stripe price is resolved to a plan
- **THEN** it maps to exactly one of `free`, `plus`, `premium`, matching the `plan` enum

### Requirement: A plan card describes its limits in scans, not dollars

Each pricing card SHALL describe its plan in the units a reader can reason about, and SHALL NOT show the monthly spend
backstop. That figure is our cost limit, not the reader's price, and on a page about what things cost it reads as a
second charge.

Each card SHALL list, in this order: how many Topics the plan allows, how many of them run on a daily schedule, how many
manual scans a day, an approximate monthly scan total, and the plan's podcast line. The order matters: each line answers
the question the line above it raises. The podcast line SHALL read "Short podcast for latest brew only" on
the free plan and "Full podcasts for every brew" on a paid plan.

The monthly scan total SHALL be stated as approximate, since it depends on how the user schedules their Topics. It SHALL
be derived from the plan's monthly budget and the average cost of one scan, rounded up to the next ten.

#### Scenario: A card reads in scans

- **WHEN** a pricing card renders
- **THEN** it lists topics, daily-scheduled topics, manual scans a day, an approximate monthly scan total, and its
  podcast line, and shows no dollar budget

#### Scenario: The free card

- **WHEN** the free card renders at the monthly interval
- **THEN** it reads 3 topics, 1 on a daily schedule, 5 manual scans a day, about 30 scans a month, and its podcast
  line reads "Short podcast for latest brew only"

#### Scenario: The paid cards

- **WHEN** the plus and premium cards render at the monthly interval
- **THEN** plus reads 10, 3, 15, and about 150, and premium reads 25, 6, 30, and about 350, and each podcast line
  reads "Full podcasts for every brew"

### Requirement: The yearly toggle marks the limits it raises

When the yearly interval is selected, the cards SHALL show that interval's limits, and SHALL mark the lines whose value actually changed.

Prepaying raises the daily-topic and manual-scan limits but not the topic limit, so without a marker a reader has to hold two states in their head and diff them. Marking the moved lines makes the benefit of prepaying visible rather than something to be noticed.

#### Scenario: The moved lines are marked

- **WHEN** a reader switches the toggle to yearly
- **THEN** the daily-topic and manual-scan lines show the yearly values and are marked as raised, while the topic-limit line is not

#### Scenario: Monthly shows no markers

- **WHEN** the toggle is on monthly
- **THEN** no line is marked, since none has moved from anything

### Requirement: The billing state carries the subscription's billing interval

The billing state the account page reads SHALL include the user's billing interval, taken from the same `billing_subscriptions` row that already resolves their daily scan limit. It SHALL NOT be stored a second time on the user row to save the read, because the interval is the stored fact overage-billability derives from and a copy is a value that can disagree with it.

A user with no subscription SHALL resolve as `monthly`, which is the key the limit lookup needs rather than a claim about how they are billed.

#### Scenario: A paid subscription reports its interval

- **WHEN** a yearly subscriber's billing state is loaded
- **THEN** it carries `yearly`, read from the same subscription row as their daily scan limit, with no additional query

#### Scenario: A free user resolves as monthly

- **WHEN** a user with no `billing_subscriptions` row has their billing state loaded
- **THEN** the interval resolves as `monthly` so the limit lookup has a key

### Requirement: The account page names a paid plan's billing interval

The account page's plan card SHALL name the billing interval alongside the plan for a paid plan, so a subscriber can read what they pay for and how often without opening the Customer Portal.

A free plan SHALL show no interval. It has no subscription, and its resolved `monthly` is a lookup default rather than a billing frequency, so naming it would state a charge the reader does not have.

#### Scenario: A paid plan names its interval

- **WHEN** a premium subscriber billed yearly views their account page
- **THEN** the plan card names both the plan and the yearly interval

#### Scenario: A free plan names no interval

- **WHEN** a free user views their account page
- **THEN** the plan card names the plan alone

### Requirement: The pricing page opens at the reader's own billing interval

The pricing page's monthly/yearly toggle SHALL open at the signed-in user's billing interval, so a subscriber sees the prices and limits they are actually on rather than having to find their own row.

A visitor and a free user SHALL open at monthly, which is already correct for them, and the page SHALL NOT read billing state on their behalf.

The toggle and the plan cards SHALL NOT be shown at one interval and then moved to another once the reader's interval is known. On a page whose content is prices, a card that changes after it is read is worse than one that arrives a moment later, and a toggle that is live before the interval lands can take a reader's click and then overwrite it.

#### Scenario: A yearly subscriber opens on yearly

- **WHEN** a yearly subscriber opens the pricing page
- **THEN** the toggle is on yearly and the cards show yearly prices and limits without the reader touching it

#### Scenario: A visitor opens on monthly

- **WHEN** a signed-out visitor opens the pricing page
- **THEN** the toggle is on monthly and no billing state is requested

#### Scenario: A free user opens on monthly

- **WHEN** a signed-in free user opens the pricing page
- **THEN** the toggle is on monthly and no billing state is requested

#### Scenario: The toggle and cards do not move after paint

- **WHEN** a paid subscriber opens the pricing page and their interval has not yet loaded
- **THEN** the toggle and the cards are withheld until it has, rather than rendering at monthly and switching

### Requirement: A pricing card is the current plan only at the matching interval

A pricing card SHALL be marked as the reader's current plan only when both the plan and the billing interval match their subscription. The same plan at the other interval is a different price, different limits, and a different Stripe subscription, so marking it current would name something the reader is not on.

A signed-in reader SHALL see no badge on a card that is not their exact subscription. The recommendation badge is for a visitor choosing a plan, and reads as advice to someone who has already chosen.

A card whose plan matches at a non-matching interval SHALL offer the Customer Portal action every other card offers a paying user, rather than an inert current-plan control. Switching interval is made in the portal, and that card is where a reader goes to make it.

#### Scenario: The matching card is marked current

- **WHEN** a premium-yearly subscriber views the pricing page with the toggle on yearly
- **THEN** the premium card is badged as their current plan and its action is inert

#### Scenario: The same plan at the other interval is not current

- **WHEN** that subscriber switches the toggle to monthly
- **THEN** the premium card carries no badge and its action opens the Customer Portal

#### Scenario: A signed-in reader sees no recommendation badge

- **WHEN** a signed-in user views a card that is not their current subscription
- **THEN** the card carries no badge at all

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

