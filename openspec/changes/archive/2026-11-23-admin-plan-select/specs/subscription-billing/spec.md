## MODIFIED Requirements

### Requirement: An admin plan change grants a plan through the billing projection

An admin plan change SHALL write a `billing_subscriptions` row with the `admin` provider through the same projection the
providers' webhooks use, so `users.plan`, the sessions, the topic limit, the full podcast episodes, and the LiteLLM key
budget change together. The row SHALL have no period end. Each admin plan change SHALL be logged in
`admin_plan_changes` with the user, the admin, the plan, and when.

#### Scenario: An admin plan change sets the plan and resizes the key

- **WHEN** an admin changes a free user's plan to premium
- **THEN** the user's plan reads premium, their LiteLLM key is reissued at the premium budget, and an
  `admin_plan_changes` row records the admin

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

## REMOVED Requirements

### Requirement: An admin plan change ends on its end date

**Reason**: An admin plan change has no end date. An admin sets the plan back by hand.

**Migration**: An admin billing row saved with an end date keeps its plan until an admin changes it.
