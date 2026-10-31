# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: A Billing Subscription maps a Stripe subscription to a plan and derives the user's plan`
- TO: `### Requirement: A Billing Subscription maps a provider's subscription to a plan and derives the user's plan`

## MODIFIED Requirements

### Requirement: A Billing Subscription maps a provider's subscription to a plan and derives the user's plan

The system SHALL persist a `billing_subscriptions` row for a user's active paid subscription, with the user, the
provider that bills it (Stripe, the App Store, or Google Play), the provider's customer id and subscription id, plan,
status, and current period end. A Stripe row holds the Stripe customer and subscription ids; a store row holds the
purchase processor's original app user id and the store's latest transaction id. The user's current plan SHALL be
derived from their active billing subscription; a user with no active row SHALL be `free`. `users.plan` SHALL be a
projection kept in sync from the providers' webhooks and the store sync so the gate and quota reads stay a single row.
The Billing Subscription noun SHALL be distinct from the topic `Subscription` (subscriber ↔ Topic).

#### Scenario: No active row means free
- **WHEN** a user has no active `billing_subscriptions` row
- **THEN** their derived plan is `free` and `users.plan` reads `free`

#### Scenario: An active subscription sets the plan
- **WHEN** a user has an active `billing_subscriptions` row for `plus`
- **THEN** their derived plan is `plus` and `users.plan` mirrors it

#### Scenario: A store row names its provider

- **WHEN** a user's plan was bought in the App Store
- **THEN** their row's provider is the App Store, and the web and the app both read the plan from `users.plan`

### Requirement: Checkout runs through Stripe Checkout and the Customer Portal, with Link enabled by Dashboard toggle

On the web, upgrades SHALL run through a Stripe Checkout Session for the target plan's price, and subscription
management (payment method, cancel) SHALL run through the Stripe Customer Portal. Link — including Link Instant Bank
Payments at the lower bank rate — SHALL be enabled as a Stripe Dashboard payment-method toggle, not a code path, so the
integration stays Stripe Billing subscriptions, webhooks, and the Customer Portal. The mobile app SHALL never open
Stripe Checkout or the Customer Portal; it sells through the stores.

#### Scenario: Upgrading opens Checkout for the plan price
- **WHEN** a signed-in user chooses to upgrade to a paid plan on the web
- **THEN** the app creates a Stripe Checkout Session for that plan's price and redirects the user to it

#### Scenario: Managing billing opens the Customer Portal
- **WHEN** a Stripe subscriber chooses to manage billing on the web
- **THEN** the app opens the Stripe Customer Portal for their customer

### Requirement: Metered manual-scan overage makes the daily limit soft only with a card on file

When a user has a card on file **and their subscription includes the metered overage price**, the daily scan limit SHALL
be soft: each manual Scan beyond the plan's daily scan limit SHALL be allowed and reported to Stripe as a usage record
for per-update billing. Otherwise the limit SHALL be a hard limit and the api SHALL reject manual Scans beyond it.

Only a Stripe subscription can include that price. Whether overage can be billed SHALL derive from one shared rule over
the row's provider, billing interval, and card on file, read by the quota check and the account page alike, so a store
subscription's limit is always hard.

A manual Scan the user stopped SHALL NOT be reported as a usage record, because a stopped Scan gives its daily scan back
and so no longer exceeds the limit the overage bills for. The dollars it spent before the stop SHALL still count against
the user's monthly budget.

Only a monthly subscription has that price, because Stripe rejects a subscription whose prices disagree about their
billing interval. The subscription SHALL record its billing interval, and whether overage can be billed SHALL derive
from it instead of being stored as a second flag that could disagree.

The recorded interval SHALL be read from the prices the Stripe subscription actually has, not from the metadata stamped
on it at checkout. Changing plan in the Customer Portal swaps the price and leaves our own metadata untouched, so the
stamp goes stale the moment a subscriber switches — holding a yearly subscriber to monthly limits, or leaving a
subscriber who moved back to monthly with a limit that can no longer be softened. Because the metered overage price
always bills monthly, a subscription SHALL count as yearly when any of its prices does. An event with no prices SHALL
fall back to the stamped interval, and one with neither SHALL read as monthly.

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
- **THEN** it stores the billing interval, and overage-billability is derived from it instead of stored alongside it

#### Scenario: A plan changed in the portal is recorded at its new interval
- **GIVEN** a subscriber who checked out monthly and then switched to yearly in the Customer Portal
- **WHEN** the webhook records the subscription
- **THEN** it reads yearly from the subscription's price, not monthly from the stamp checkout left behind

#### Scenario: A monthly subscription carrying its overage price reads as monthly
- **WHEN** the webhook records a monthly subscription holding both its plan price and the metered overage price
- **THEN** it reads as monthly, since neither price is yearly

#### Scenario: An event with no prices falls back to the stamp
- **WHEN** the webhook records a subscription whose payload has no price items
- **THEN** it reads the interval stamped at checkout, and reads monthly when there is no stamp either

#### Scenario: A store subscription never bills overage

- **WHEN** a monthly store subscriber reaches their daily scan limit
- **THEN** further manual Scans are rejected, and the account page shows no "billed by the scan" line

### Requirement: Metering and dunning are surfaced to the user
The UI SHALL show the user their scan usage against the daily limit and any metered overage, SHALL show their monthly
spend against their effective budget with chat spend, scan spend, and podcast episode spend rendered as distinct
segments of one bar, and SHALL surface a past-due / dunning state when a payment fails, with a path to update payment:
the Customer Portal for a Stripe subscription, and the store's subscription management page for a store subscription.

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
- **WHEN** a Stripe subscriber's subscription is past due after a failed payment
- **THEN** the UI surfaces the dunning state with a link to the Customer Portal

#### Scenario: A store subscriber's payment fails

- **WHEN** a store subscriber's subscription is in its billing grace period
- **THEN** both apps show the failed-payment notice, and its Update opens the store's subscription management page

### Requirement: A pricing card is the current plan only at the matching interval

A pricing card SHALL be marked as the reader's current plan only when both the plan and the billing interval match their
subscription. The same plan at the other interval is a different price, different limits, and a different subscription,
so marking it current would name something the reader is not on.

A signed-in reader SHALL see no badge on a card that is not their exact subscription. The recommendation badge is for a
visitor choosing a plan, and reads as advice to someone who has already chosen.

A card whose plan matches at a non-matching interval SHALL offer the management action every other card offers a paying
user, instead of an inert current-plan control: the Customer Portal for a Stripe subscriber on the web, the store's
management page for a store subscriber on the web, and the store's plan switch for a store subscriber on the app.

#### Scenario: The matching card is marked current

- **WHEN** a premium-yearly subscriber views the pricing page with the toggle on yearly
- **THEN** the premium card is badged as their current plan and its action is inert

#### Scenario: The same plan at the other interval is not current

- **WHEN** that subscriber switches the toggle to monthly
- **THEN** the premium card has no badge and its action opens the Customer Portal

#### Scenario: A signed-in reader sees no recommendation badge

- **WHEN** a signed-in user views a card that is not their current subscription
- **THEN** the card has no badge at all

#### Scenario: A store subscriber's other cards on the web

- **WHEN** a store subscriber views the web's pricing page
- **THEN** the other cards' action reads Manage in the App Store or Manage in Google Play and opens the store's page

### Requirement: A guard keeps purchase paths out of the app's reach

Preflight SHALL fail when the mobile app reaches the web's checkout or portal capability, through its own imports or
the shared packages. It SHALL fail when a module the app reaches contains a plans path or a purchase label without
reading the storefront purchase rules, except the exceptions the guard lists with a reason: the modules that map,
route, or return to the Plans screen. The failure SHALL name the file and what to import.

#### Scenario: An app file regains a purchase link

- **WHEN** a file under `apps/mobile` gains a plans link and reads no storefront rules
- **THEN** preflight fails and names the file

#### Scenario: A listed exception passes

- **WHEN** the modules that map and route to the Plans screen are the only plans paths the app reaches outside the
  rules' readers
- **THEN** preflight passes

#### Scenario: A rules reader passes

- **WHEN** an app file names the plans path and reads the purchase offers from the storefront rules
- **THEN** preflight passes

## REMOVED Requirements

### Requirement: The app's first store release offers no purchase

**Reason**: The storefront design is approved and the app sells through the stores. The `store-subscriptions`
capability owns what the app offers and where.

**Migration**: The read-only cards, the gated words without a plans link, and the failed-payment notice without a
button stay the behavior for a storefront the rules mark read-only, under "The storefront rules decide every purchase
entry point" in `store-subscriptions`.
