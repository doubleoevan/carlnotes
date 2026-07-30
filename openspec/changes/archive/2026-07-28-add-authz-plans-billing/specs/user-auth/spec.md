## MODIFIED Requirements

### Requirement: Each user is provisioned a budgeted LiteLLM virtual key at signup
The system SHALL provision a LiteLLM virtual key with a per-key spend budget for every new user as part of signup, and SHALL persist that key on the user's row. The budget SHALL be the user's effective monthly budget — their plan's monthly backstop, or their per-user override when set — sourced from the plans catalog rather than a hardcoded constant. The key budget SHALL be resized when the user's plan changes or their budget override changes. If provisioning fails, signup SHALL fail and no user SHALL be created.

#### Scenario: A successful signup carries a virtual key
- **WHEN** a new user completes signup by any path
- **THEN** their `users` row has a non-null LiteLLM virtual key whose spend budget equals their effective monthly budget (the free plan's backstop for a new user with no override)

#### Scenario: Key provisioning failure blocks signup
- **WHEN** the LiteLLM proxy is unreachable or rejects key creation during a signup attempt
- **THEN** no `users` row is created and the signup fails

#### Scenario: A plan or override change resizes the budget
- **WHEN** a user's plan changes through billing, or an admin sets or clears their budget override
- **THEN** their LiteLLM key budget is resized to the new effective monthly budget
