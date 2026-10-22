## ADDED Requirements

### Requirement: A single-use value is read and deleted from Redis in one command
Better Auth's secondary storage SHALL read a value it uses once, such as an authorization code, and delete it from
Redis in one command, so two requests never both read it. The read SHALL go through the Redis store's wrapper, so a
Redis failure is a miss and never an error.

#### Scenario: A value read once is gone
- **WHEN** Better Auth reads a single-use value from Redis
- **THEN** the value is returned and the key no longer exists
