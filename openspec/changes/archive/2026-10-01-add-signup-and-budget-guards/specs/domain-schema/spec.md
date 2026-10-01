## REMOVED Requirements

### Requirement: A user's LiteLLM virtual key is stored on the user row
**Reason**: A user can now finish signup without a key and get one at their first model call, so the scenario that every created user has a key no longer holds. A scenario cannot be removed in place, so the requirement is restated under a new name.
**Migration**: "A user's LiteLLM virtual key is stored on the user row, and null until it is created" replaces this requirement.

## ADDED Requirements

### Requirement: A user's LiteLLM virtual key is stored on the user row, and null until it is created
The `users` table SHALL have a nullable column that records the user's LiteLLM virtual key, beside the time that the key was created. The column SHALL be null only while the user has no key: during signup, and after a signup whose key creation failed, until the user's first model call creates and stores one. A key stored after signup SHALL record its own creation time, so the monthly budget reset treats it as created that month.

#### Scenario: A signup that created a key stores it
- **WHEN** a user signs up and the proxy creates their key
- **THEN** their key column is non-null

#### Scenario: A key created after signup records its own time
- **WHEN** a user whose signup could not create a key makes their first model call
- **THEN** the created key is stored, and its creation time is the time it was stored
