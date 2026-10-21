## ADDED Requirements

### Requirement: Comment bodies validate at the route

The thread, comment, edit, and reaction routes SHALL validate their request bodies with zod payloads from the shared
contracts, attached with the validator the other api routes use, before any store call. A body that fails validation
SHALL respond 400 and change nothing: no thread, comment, edit, or reaction is stored, and no SQL mirror or SSE
broadcast runs.

#### Scenario: A body of the wrong shape is a 400

- **WHEN** a thread, comment, edit, or reaction route receives a body that is not an object, or one whose fields do not
  match its payload
- **THEN** the route responds 400, and nothing is stored, mirrored, or broadcast

#### Scenario: A reaction with no emoji is a 400

- **WHEN** a reaction add or remove arrives with the emoji missing or not a string
- **THEN** the route responds 400 and no reaction changes

#### Scenario: A well-formed body reaches the store

- **WHEN** a body matches its payload
- **THEN** the store call runs with the validated body, and the comment is stored, mirrored, and broadcast as before
