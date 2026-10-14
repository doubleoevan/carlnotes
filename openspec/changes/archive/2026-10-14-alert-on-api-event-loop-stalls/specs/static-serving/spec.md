## MODIFIED Requirements

### Requirement: Unclaimed GET paths are served by the ui's server handler

A `GET` or `HEAD` path that the api does not claim SHALL be served by the ui's server handler, which resolves it against
the route tree and renders it. The handler SHALL be mounted last, so every route the api registers responds ahead of it.
Only a `GET` or `HEAD` reaches the handler, and any other method on a path the api does not claim SHALL respond 404.

The api SHALL claim, ahead of the handler: its own `/api` tree, the mcp routes, the oauth well-known routes, the
document routes that serve the sitemap, the feeds, the llms files, the IndexNow key file, and the security file, the
blog and release pages it renders itself, the built docs, the ui's built client files, and the redirect of a page path
that ends in a slash. Ahead of the ui's handler, and ahead of the blog and release pages, a page request SHALL pass the
page guards: a visitor's address limited as the request-capacity capability states, rejected with a 429 past the limit,
and a page url with a click id redirected as the edge-caching capability states. A visitor's render past the render
limit SHALL get a 503 from the api instead of a render. A path under the docs SHALL NOT reach the ui's handler, and a
docs path that matches no built file SHALL get the docs site's own not-found page.

A page's title, canonical, card tags, and structured data SHALL be declared by its own route, and the server SHALL
render them with the page.

If the ui's server build exists, the api SHALL import it at startup, before it serves, so a new replica's first page
never waits on the import. If the ui's server build is missing, a page request SHALL respond 404 with a message naming
`build:ui`. If the build exists but fails to import, the failure SHALL be logged and reported, and a page request SHALL
respond 503, so a broken deploy is visible and a crawler retries the page instead of dropping it. If a read that a page
needs fails, the render SHALL mark its response, and the api SHALL respond 503 for the page with a `Retry-After` of
sixty seconds, report it, and never share it at the edge. The page SHALL still render with what it has, so a visitor
with JavaScript loads the rest in the browser.

#### Scenario: A page path is rendered by the ui's handler

- **WHEN** a request arrives for a path that matches no api route and no built asset
- **THEN** the ui's handler resolves it against the route tree and responds with that page

#### Scenario: A page url with a click id is redirected before the handler

- **WHEN** a request arrives for a page path whose query has `fbclid`
- **THEN** the api redirects it permanently to the path without the id, and the ui's handler does not render it

#### Scenario: A write to an unknown path is not a page

- **WHEN** a `POST` arrives for a path that matches no route
- **THEN** the app responds 404, and the ui's handler never sees the request

#### Scenario: An api document route responds ahead of the handler

- **WHEN** a request arrives for the sitemap, a feed, an llms file, or the security file
- **THEN** the api's own route serves it, and the ui's handler never sees the request

#### Scenario: A server build that fails to import responds 503

- **WHEN** the ui's server build throws while it is imported
- **THEN** the error is logged and reported, and a page request responds 503

#### Scenario: A page rendered without its feed responds 503

- **WHEN** the homepage's feed read fails while the server renders it
- **THEN** the page responds 503 with a `Retry-After`, the edge keeps no copy, and the failure is reported

#### Scenario: A docs path never reaches the ui

- **WHEN** a request arrives for a path under the docs that matches no built file
- **THEN** the docs site's own not-found page is served, and the ui's handler never sees the request

#### Scenario: A new replica loads the server build before it serves

- **WHEN** an api replica starts with the ui's server build in place
- **THEN** the build is imported before the replica accepts a request, so its first page renders without the import
