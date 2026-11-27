## ADDED Requirements

### Requirement: A stream may add a line kind its frozen readers skip

A stream route's contract MAY name the field whose value tells its line kinds apart, declaring that its reader skips
a line whose kind it does not know. For such a route, preflight SHALL pass a new line kind and the in-process tests
SHALL skip it. A test SHALL prove the reader skips an unknown kind. A changed or removed frozen kind SHALL still fail.

#### Scenario: A new line kind passes

- **WHEN** the reply stream gains a `suggestedReply` line and its contract names `type` as the line kind field
- **THEN** preflight passes against every live snapshot

#### Scenario: A changed frozen kind still fails

- **WHEN** the current `text` line drops its `text` field
- **THEN** preflight fails and names the capability and the path

#### Scenario: A route that does not declare it still fails

- **WHEN** a stream route without a line kind field gains a new line kind
- **THEN** preflight fails as a new union option fails today

#### Scenario: The in-process test skips the new kind

- **WHEN** the compatibility test reads a live reply stream that holds a `suggestedReply` line
- **THEN** it validates every frozen line kind against the frozen schema and skips the new one

#### Scenario: The skip is proven

- **WHEN** the reply reader reads a line of an unknown kind between two text lines
- **THEN** the test shows both texts, no tool call, and the same result as without that line
