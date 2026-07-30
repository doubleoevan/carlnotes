## ADDED Requirements

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

### Requirement: Metered manual-scan overage makes the daily ceiling soft only with a card on file
When a user has a card on file, the daily scan ceiling SHALL be soft: each manual Scan beyond the plan's daily scan limit SHALL be allowed and reported to Stripe as a usage record for per-update billing. When no card is on file, the ceiling SHALL be a hard cap and the api SHALL reject manual Scans beyond it.

#### Scenario: A card on file bills the overage
- **WHEN** a user with a card on file makes a manual Scan beyond their daily limit
- **THEN** the update runs and a Stripe usage record is reported for it

#### Scenario: No card keeps the cap hard
- **WHEN** a user with no card on file attempts a manual Scan beyond their daily limit
- **THEN** the api rejects it and no update runs

### Requirement: Metering and dunning are surfaced to the user
The UI SHALL show the user their scan usage against the daily limit and any metered overage, and SHALL surface a past-due / dunning state when a payment fails, with a path to the Customer Portal to update payment.

#### Scenario: Usage shows against the limit
- **WHEN** a subscribed user views their billing state
- **THEN** the UI shows scan usage against the daily limit and any billed overage

#### Scenario: A past-due subscription prompts dunning
- **WHEN** a user's subscription is past due after a failed payment
- **THEN** the UI surfaces the dunning state with a link to the Customer Portal

### Requirement: Plan tier names are free, plus, and premium end to end
The Stripe products and prices and the gate SHALL use one spelling of the plan tiers — `free`, `plus`, `premium` — reconciling the provisional Starter/Pro names so a single value reaches the Stripe product metadata, the `plan` enum, and the gate.

#### Scenario: A Stripe price maps to a plan enum value
- **WHEN** a Stripe price is resolved to a plan
- **THEN** it maps to exactly one of `free`, `plus`, `premium`, matching the `plan` enum
