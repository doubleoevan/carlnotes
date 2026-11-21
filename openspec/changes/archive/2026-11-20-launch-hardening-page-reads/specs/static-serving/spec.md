## ADDED Requirements

### Requirement: A missing file under /assets/ gets a plain 404 without a render

A `GET` or `HEAD` for a path after `/assets/` that matches no built client file SHALL respond with a plain 404 ahead of
the page guards and SHALL never reach the ui's server handler. A tab on an earlier build that asks for a chunk the new
build dropped SHALL cost no page render and no render slot.

#### Scenario: An earlier build's chunk costs no render

- **WHEN** a browser on the previous build requests `/assets/TopicPage-old123.js` after a release
- **THEN** the response is a plain 404, no page is rendered, and the count of visitor renders in progress does not
  change

#### Scenario: A built asset is still served

- **WHEN** a request arrives for a file that exists under `/assets/`
- **THEN** it is served with its content type and its immutable cache headers, as before
