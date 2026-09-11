## ADDED Requirements

### Requirement: create_topic takes a visibility
`create_topic` SHALL accept an optional `visibility` of `public`, `invite`, or `private`, defaulting to `invite`, and create the Topic with it.

#### Scenario: An agent makes a private Topic
- **WHEN** an authenticated client calls `create_topic` with `visibility: "private"`
- **THEN** the Topic exists with visibility `private`

#### Scenario: An agent leaves the visibility out
- **WHEN** an authenticated client calls `create_topic` with no `visibility`
- **THEN** the Topic is shared by invite
