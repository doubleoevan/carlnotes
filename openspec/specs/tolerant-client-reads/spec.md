# tolerant-client-reads Specification

## Purpose
Keeps an installed mobile build rendering when a response is partly malformed or newer than the build, by reading
every response through a tolerant form derived from the same contract the web parses strictly, with no copy of a
shape in the app and no permission ever granted by a default.

## Requirements

### Requirement: The app reads responses through a tolerant form of the contract

Every response the app reads SHALL be parsed with a tolerant schema derived from the contract's response schema by one
shared transform, and never with a hand-written copy of the shape. The web SHALL parse the same responses with the
strict contract schema as it does today. Request validation on the api SHALL not change.

#### Scenario: The web and the app read one contract

- **WHEN** a contract response schema changes
- **THEN** the web's strict parse and the app's tolerant parse both follow it with no second definition to update

#### Scenario: The web parse is strict

- **WHEN** the web receives a list with a malformed entry
- **THEN** the web parse behaves exactly as it does today

### Requirement: A malformed list entry is isolated

When an entry of a list in a response fails its item schema, the app SHALL drop that entry, render the rest, and
record the route and the dropped count with no content. A malformed entry SHALL never fail the whole list or the
screen.

#### Scenario: One Finding is malformed

- **WHEN** a Feed response has twenty Findings and one lacks a required field
- **THEN** nineteen Findings render and the dropped count is recorded without the Finding's text

#### Scenario: Every entry is well formed

- **WHEN** a list parses cleanly
- **THEN** nothing is dropped and nothing is recorded

### Requirement: A display enum has a shared unknown case

A response enum that only drives display SHALL declare the shared unknown case in the contract, so the inferred type
includes it on both apps. The app's tolerant parse SHALL map a value outside the enum to the unknown case, and every
switch or lookup over such an enum SHALL handle it, rendering a neutral label or nothing. An enum that unlocks an
action, such as a role or a visibility, SHALL stay strict.

#### Scenario: A newer server sends a new frequency

- **WHEN** the api returns a frequency the build does not know
- **THEN** the app parses it as the unknown case and the Topic renders with no frequency badge

#### Scenario: A switch without the branch does not compile

- **WHEN** a switch over a display enum lacks the unknown branch
- **THEN** the type check fails on both apps

#### Scenario: An unknown role stays strict

- **WHEN** the api returns a role value outside the enum
- **THEN** the entry or response fails to parse and no action is unlocked

### Requirement: A missing optional or display field takes its documented default

An optional or nullable field that is missing or malformed SHALL parse to its documented default, `undefined` or
`null`, and the component SHALL render as it does when the field is absent. A required field SHALL stay required.

#### Scenario: A nullable summary is malformed

- **WHEN** a response's nullable summary field holds a number instead of a string
- **THEN** the app renders the item as one with no summary

#### Scenario: A required id is missing

- **WHEN** a list entry lacks its required id
- **THEN** the entry is dropped

### Requirement: No authorization, membership, identity, or destructive-action field is defaulted to a grant

A field that says whether the user may act, belongs, is who they are, or is about to destroy something SHALL never
take a default that grants or widens. A failure in such a field SHALL fail its entry or its response.

#### Scenario: A permission flag is missing

- **WHEN** a Topic response lacks the flag that says the user may edit
- **THEN** the response fails to parse and the edit controls do not show

#### Scenario: A membership field is malformed

- **WHEN** a Team response's membership field is not a known value
- **THEN** the Team page shows its error state and no member action

### Requirement: A required response that fails to parse fails visibly

When a response the screen needs fails to parse, the screen SHALL show its error state with a retry, and never a
blank page, a partial page presented as complete, or a success message. The Topic page, the Podcast Episode page, a
Note, a chat room, Account, Activity, Teams, a Team page, a Profile, Search, and the invite route are such screens.
The home Feed falls back to its saved snapshot first and then to the error state.

#### Scenario: The Topic page cannot parse

- **WHEN** the Topic response fails to parse
- **THEN** the Topic page shows its error state with a retry

#### Scenario: The Feed cannot parse

- **WHEN** the Feed response fails to parse and a snapshot is saved for this account and build
- **THEN** the saved Feed shows and the read error is reported without content
