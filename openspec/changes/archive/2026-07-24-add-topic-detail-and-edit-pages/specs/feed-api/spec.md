## ADDED Requirements

### Requirement: The feed payload carries the remaining topic allowance
The Feed response SHALL include `topicsRemaining`: how many more topics the current user may create under the topic cap, floored at zero, so the homepage can render the Add Topic allowance without a second request. The cap counts the topics the user holds — not creations per day — so deleting a topic frees a slot.

#### Scenario: The feed reports remaining topic slots
- **WHEN** a user holding two topics loads the Feed under a cap of five
- **THEN** the payload carries `topicsRemaining: 3`
