## ADDED Requirements

### Requirement: An admin plan change grants a plan through the billing projection

An admin plan change SHALL write a `billing_subscriptions` row with the `admin` provider through the same projection the
providers' webhooks use, so `users.plan`, the sessions, the topic limit, the full podcast episodes, and the LiteLLM key
budget change together. The row's period end SHALL be the admin plan change's end date, null for no end. Each admin plan
change SHALL be logged in `admin_plan_changes` with the user, the admin, the plan, the reason, the end date, and when.

#### Scenario: An admin plan change sets the plan and resizes the key

- **WHEN** an admin changes a free user's plan to premium with a reason
- **THEN** the user's plan reads premium, their LiteLLM key is reissued at the premium budget, and a
  `admin_plan_changes` row records the admin and the reason

#### Scenario: A billed user is rejected

- **WHEN** an admin changes the plan of a user who has an active Stripe or store subscription
- **THEN** nothing is written and the user keeps the plan they pay for

#### Scenario: A subscription replaces an admin plan change

- **WHEN** a user with an admin plan change subscribes through Stripe
- **THEN** the Stripe row replaces the admin billing row without a conflict report, and the user's plan follows the
  subscription

#### Scenario: An admin plan change to the free plan clears the admin plan change

- **WHEN** an admin changes the plan of a user with an admin plan change to the free plan
- **THEN** the admin billing row is cleared and the user's plan reads free

#### Scenario: The account page names no provider for an admin plan change

- **WHEN** a user with an admin plan change opens their account page
- **THEN** the billing state names no provider

### Requirement: An admin plan change ends on its end date

The worker's sweep SHALL clear each admin billing row whose end date has passed through the billing projection,
returning the user to the free plan and reissuing the LiteLLM key at the free budget. A failed end SHALL be reported and
retried on the next sweep.

#### Scenario: An expired admin plan change returns the user to free

- **WHEN** the sweep runs after an admin plan change's end date
- **THEN** the admin billing row is cleared, the user's plan reads free, and their key is reissued

#### Scenario: An admin plan change granted again before the sweep clears it stays

- **WHEN** an admin changes a user's plan again after the sweep read their expired admin plan change and before it
  cleared it
- **THEN** the new admin plan change stays, and the user keeps its plan
