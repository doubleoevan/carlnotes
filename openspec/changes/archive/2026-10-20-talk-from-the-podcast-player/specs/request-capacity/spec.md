## MODIFIED Requirements

### Requirement: A visitor's render past the concurrency limit is shed

Each api replica SHALL count the page renders in progress for requests without a session cookie, from the start of the
render until the ui's server returns the page's headers, and a visitor's render that would pass `RENDER_CONCURRENCY`, 16
by default, SHALL get a 503 at once, with `Retry-After: 2` and `Cache-Control: private, no-cache`, so the edge keeps
serving its copy, stale if the origin errs, and caches nothing from the shed response. A render for a request with a
session cookie SHALL be neither counted nor shed. A render SHALL release its count however it ends.

#### Scenario: A burst past the limit is shed

- **WHEN** a seventeenth visitor render arrives while sixteen are in progress on one replica
- **THEN** it gets a 503 with a two-second retry, and the sixteen finish

#### Scenario: A signed-in render is never shed

- **WHEN** a render with a session cookie arrives while the visitor limit is reached
- **THEN** it renders

#### Scenario: Signed-in renders never shed a visitor

- **WHEN** a visitor's render arrives while only signed-in renders are in progress, however many
- **THEN** it renders

#### Scenario: A failed render releases its count

- **WHEN** a render throws
- **THEN** the next visitor render is counted as if the failed one had finished
