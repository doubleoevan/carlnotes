## MODIFIED Requirements

### Requirement: Stripe webhooks are the source of truth for subscription state
A Stripe webhook endpoint SHALL verify the Stripe signature and reject unsigned or invalid events with a 400. On subscription lifecycle events it SHALL create, update, or clear the user's `billing_subscriptions` row and its `users.plan` projection, and SHALL resize the user's LiteLLM key budget to the new plan's monthly backstop (or the per-user override when set). A verified event that could not be applied, such as during a database outage, and any event while the webhook secret is unset, SHALL be answered 500, so Stripe retries it on its own schedule. Both a rejection and a failure SHALL be reported.

#### Scenario: A completed checkout activates the plan
- **WHEN** a valid subscription-active webhook (for example `checkout.session.completed`) arrives for a user
- **THEN** their `billing_subscriptions` row and `users.plan` reflect the purchased plan and their key budget is resized to it

#### Scenario: A cancellation reverts to free
- **WHEN** a valid subscription-cancelled webhook arrives
- **THEN** the active row is cleared, `users.plan` becomes `free`, and the key budget is resized to the free backstop

#### Scenario: An unsigned webhook is rejected
- **WHEN** a request to the webhook endpoint fails Stripe signature verification
- **THEN** the endpoint answers 400, writes nothing, and reports the rejection

#### Scenario: A verified event that fails to apply is retried
- **WHEN** a correctly signed subscription event arrives while the database is unreachable
- **THEN** the endpoint answers 500 and reports the failure, and Stripe sends the event again later

#### Scenario: An unset webhook secret is a failure, not a rejection
- **WHEN** an event arrives while `STRIPE_WEBHOOK_SECRET` is unset
- **THEN** the endpoint answers 500 and reports the failure, and Stripe sends the event again once the secret is set
