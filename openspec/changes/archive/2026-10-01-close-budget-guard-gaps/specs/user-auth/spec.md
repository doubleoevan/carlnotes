## ADDED Requirements

### Requirement: A key created before a first model call is stored at the user's current budget
When the system creates a missing LiteLLM key before a user's model call, it SHALL store the key only if the user's row still has no key and still has the role, plan, and budget override that the key's budget was computed from. If the row no longer matches, the system SHALL delete the created key from the proxy and SHALL load the user's key again, which creates a key at the user's current budget if the row still has none.

A store can throw an error after the key is stored. If the store throws an error, the system SHALL read the user's row again. It SHALL keep the key if the row has that key, and SHALL otherwise delete the key from the proxy and throw the store's error. The monthly key replacement SHALL follow the same rule.

#### Scenario: A plan change during key creation
- **WHEN** a user's plan or budget override changes after a first model call read the user's budget and before that call stored its new key
- **THEN** the key at the older budget is deleted, and the key that is stored has the user's current budget

#### Scenario: A store that throws an error after the key was stored
- **WHEN** the store of a new key throws an error, and the user's row has that key
- **THEN** the key is kept at the proxy and returned

#### Scenario: An unchanged budget stores the key
- **WHEN** a first model call creates a key and the user's role, plan, and budget override have not changed
- **THEN** the key is stored on the user's row with its creation time
