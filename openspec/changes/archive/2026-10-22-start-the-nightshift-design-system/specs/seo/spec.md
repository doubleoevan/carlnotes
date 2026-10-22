## MODIFIED Requirements

### Requirement: A page url never ends in a slash

A request for any page path longer than `/` that ends in a slash, other than a `/docs` path or a `/nightshift` path,
SHALL redirect permanently to the same path without it, keeping the query. The docs site and the component browser keep
their own trailing-slash urls, and a request for `/nightshift` itself SHALL redirect permanently to `/nightshift/`,
because the component browser's files name each other by relative urls.

#### Scenario: A trailing slash redirects

- **WHEN** a client requests `/topics/?popular=2`
- **THEN** it is redirected permanently to `/topics?popular=2`

#### Scenario: The component browser keeps its slash

- **WHEN** a client requests `/nightshift`
- **THEN** it is redirected permanently to `/nightshift/`, and `/nightshift/` responds with the component browser
