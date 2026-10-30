# Spec Delta

## MODIFIED Requirements

### Requirement: The chat picker offers only what the chat path accepts

The chat composers' accept list SHALL NOT be derived from the Topic picker's list. Each SHALL state the types its own
path accepts, so widening one never makes the other offer a file it rejects. The web and mobile chat pickers SHALL read
one shared chat accept list, and the web and mobile Topic pickers SHALL read one shared Topic accept list.

Every type the chat picker offers SHALL be a type the chat attachment path accepts.

#### Scenario: Widening the topic picker does not widen chat

- **WHEN** the Topic picker's accept list gains a type the chat path does not accept
- **THEN** the chat composers do not offer that type

#### Scenario: The chat picker offers nothing it will reject

- **WHEN** each type in the chat picker's accept list is posted to the chat attachment path
- **THEN** each is accepted

#### Scenario: Both clients offer the same chat types

- **WHEN** the shared chat accept list gains or loses a type
- **THEN** the web file input and the mobile document picker offer the same change
