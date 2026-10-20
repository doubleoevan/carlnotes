## MODIFIED Requirements

### Requirement: Stripe webhooks are the source of truth for subscription state
A Stripe webhook endpoint SHALL verify the Stripe signature and reject unsigned or invalid events with a 400. On
subscription lifecycle events it SHALL create, update, or clear the user's `billing_subscriptions` row and its
`users.plan` projection. If the event changes the user's plan, or the user's LiteLLM key has a max budget that differs
from the user's budget or cannot be read, it SHALL resize the user's LiteLLM key budget to the plan's monthly backstop
(or the per-user override if set). An event that leaves the plan as it was, such as a renewal at each billing date,
with a key whose max budget matches, SHALL keep the key, so the key's spend keeps counting the whole month and resets
only with the monthly budget reset. A verified event that could not be applied, such as during a database outage, a
key resize that still fails after its retries, and any event while the webhook secret is unset, SHALL get a 500, so
Stripe resends it within its retry period, and an event past that period needs a manual resend from the Stripe
dashboard. Both a rejection and a failure SHALL be reported.

#### Scenario: A completed checkout activates the plan
- **WHEN** a valid subscription-active webhook (for example `checkout.session.completed`) arrives for a user
- **THEN** their `billing_subscriptions` row and `users.plan` reflect the purchased plan and their key budget is resized
  to it

#### Scenario: A cancellation reverts to free
- **WHEN** a valid subscription-cancelled webhook arrives
- **THEN** the active row is cleared, `users.plan` becomes `free`, and the key budget is resized to the free backstop

#### Scenario: A renewal on the same plan keeps the key
- **WHEN** a valid subscription-updated webhook arrives for a user and names the plan the user is already on
- **THEN** the `billing_subscriptions` row is updated and the user's LiteLLM key is kept, with its spend this month

#### Scenario: A renewal reissues a key whose budget is stale
- **GIVEN** a user whose plan changed while the key resize failed, so the key keeps the old plan's max budget
- **WHEN** a valid subscription-updated webhook arrives that names the plan the user is already on
- **THEN** the user's LiteLLM key is reissued at the plan's budget

#### Scenario: An unsigned webhook is rejected
- **WHEN** a request to the webhook endpoint fails Stripe signature verification
- **THEN** the endpoint responds 400, writes nothing, and reports the rejection

#### Scenario: A verified event that fails to apply is retried
- **WHEN** a correctly signed subscription event arrives while the database is unreachable
- **THEN** the endpoint responds 500 and reports the failure, and Stripe resends the event within its retry period

#### Scenario: An unset webhook secret is a failure, not a rejection
- **WHEN** an event arrives while `STRIPE_WEBHOOK_SECRET` is unset
- **THEN** the endpoint responds 500 and reports the failure, Stripe resends the event within its retry period, so the
  event applies if the secret is set inside that period, and an event past that period needs a manual resend from the
  Stripe dashboard
