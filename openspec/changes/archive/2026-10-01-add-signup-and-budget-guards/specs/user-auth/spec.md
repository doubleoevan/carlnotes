## REMOVED Requirements

### Requirement: Each user is provisioned a budgeted LiteLLM virtual key at signup
**Reason**: A proxy failure no longer fails signup, so the scenario that blocked signup on a failed key creation no longer holds. A scenario cannot be removed in place, so the requirement is restated under a new name.
**Migration**: "Each user gets a budgeted LiteLLM virtual key at signup or before their first model call" replaces this requirement.

## ADDED Requirements

### Requirement: Each user gets a budgeted LiteLLM virtual key at signup or before their first model call
The system SHALL try to create a LiteLLM virtual key for every new user during signup, with a per-key spend budget equal to the user's effective monthly budget: their plan's monthly backstop, or their per-user override if one is set, sourced from the plans catalog. Every call to the proxy's admin API SHALL time out after five seconds. If the proxy responds to a key creation or deletion with a failure, the thrown error SHALL name the response status and leave out the proxy's response body. If the key creation fails or times out, signup SHALL still create the user, with no key, and SHALL report the failure. Before any model call made for a user, the system SHALL load the user's key, and SHALL first create and store one at the user's effective monthly budget if the user has none. If the key cannot be created, the model call SHALL fail, and a user's model call SHALL NEVER be billed to the master key. The search Source's query generation during ingest is ingest spend, so it stays on the master key. If two first model calls race, one key SHALL be stored and the other created key SHALL be deleted. A Scan SHALL create its owner's missing key before any of its Sources run. The key's budget SHALL be resized when the user's plan changes or their budget override changes.

#### Scenario: A successful signup stores a virtual key
- **WHEN** a new user completes signup by any path and the proxy creates their key
- **THEN** their `users` row has a LiteLLM virtual key whose spend budget equals their effective monthly budget

#### Scenario: A proxy failure does not block signup
- **WHEN** the LiteLLM proxy is unreachable, takes longer than five seconds, or rejects key creation during a signup
- **THEN** the user is created with no key, the signup succeeds, and the failure is reported

#### Scenario: A missing key is created before the first model call
- **WHEN** a user with no key sends a chat turn
- **THEN** a key at their effective monthly budget is created and stored before the model call, and the call is billed to that key

#### Scenario: A key that cannot be created fails the call
- **WHEN** a user with no key makes a model call while the proxy cannot create a key
- **THEN** the call fails, and nothing is billed to the master key

#### Scenario: A Scan whose owner's key cannot be created fails before ingest
- **WHEN** a Scan starts for an owner with no key and the key cannot be created
- **THEN** the Scan fails before any of its Sources run

#### Scenario: A plan or override change resizes the budget
- **WHEN** a user's plan changes through billing, or an admin sets or clears their budget override
- **THEN** their LiteLLM key budget is resized to the new effective monthly budget
