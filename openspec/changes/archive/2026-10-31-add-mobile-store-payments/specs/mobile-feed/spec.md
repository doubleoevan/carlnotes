# Spec Delta

## MODIFIED Requirements

### Requirement: Plans opens to a visitor

The Plans screen SHALL open to a visitor as the web's Plans page does, with the recommended plan highlighted and each
plan's action leading to sign-up. For a signed-in user the screen SHALL show the plans and their limits with the
current plan marked, and SHALL offer the store purchase, the plan switch, or no action as the storefront purchase rules
decide, with the store's price on each card.

#### Scenario: A visitor opens Plans

- **WHEN** a visitor opens Plans from a link
- **THEN** the plans render and no sign-in is required to read them

#### Scenario: A user opens Plans

- **WHEN** a signed-in user opens Plans in the app
- **THEN** the plans render with the user's plan marked, and each other card offers what the storefront rules allow
  for the account's storefront
