## MODIFIED Requirements

### Requirement: Hashed assets cache immutably, rendered pages revalidate

Files under `assets/` include a content hash in their filename, so a given URL's bytes never change and SHALL be cached with `Cache-Control: public, max-age=31536000, immutable`. A page the ui's server handler renders has a stable URL whose contents change on every deploy and SHALL be sent with `Cache-Control: no-cache`, so a user picks up a new deploy on their next request. A page rendered for a request without a session cookie SHALL also be shared at the edge for a minute, as the edge-caching capability states, and a page rendered for a request with one SHALL be sent with `Cache-Control: private, no-cache`. Every other statically served file, including files copied from `public/`, changes only with a release and SHALL be sent with `Cache-Control: public, max-age=3600`, `CDN-Cache-Control: max-age=86400`, and `Cache-Tag: rendered`, so the release purge clears it from the edge.

#### Scenario: A hashed asset is cached for a year

- **WHEN** a file under `assets/` is served
- **THEN** its `Cache-Control` marks it public, immutable, and cacheable for a year

#### Scenario: A rendered page is revalidated

- **WHEN** the ui's server handler renders a page
- **THEN** its `Cache-Control` includes `no-cache`, so the browser revalidates before reusing it

#### Scenario: A signed-out page is shared at the edge

- **WHEN** the ui's server handler renders a page for a request without a session cookie
- **THEN** the response also has `CDN-Cache-Control: max-age=60, stale-while-revalidate=60, stale-if-error=120`

#### Scenario: A signed-in page is private

- **WHEN** the ui's server handler renders a page for a request with a session cookie
- **THEN** its `Cache-Control` is `private, no-cache` and it has no `CDN-Cache-Control`

#### Scenario: An unhashed public file is not cached immutably

- **WHEN** a file whose name has no content hash is served, such as `/carl-hero.png`
- **THEN** it is not marked immutable, the browser keeps it an hour and the edge a day, and the next release's purge clears it

### Requirement: Unclaimed GET paths are served by the ui's server handler

A `GET` or `HEAD` path that the api does not claim SHALL be served by the ui's server handler, which resolves it against the route tree and renders it. The handler SHALL be mounted last, so every route the api registers responds ahead of it. Only a `GET` or `HEAD` reaches the handler, and any other method on a path the api does not claim SHALL respond 404.

The api SHALL claim, ahead of the handler: its own `/api` tree, the mcp routes, the oauth well-known routes, the document routes that serve the sitemap, the feeds, the llms files, the IndexNow key file, and the security file, the blog and release pages it renders itself, the built docs, the ui's built client files, and the redirect of a page path that ends in a slash. Ahead of the ui's handler, and ahead of the blog and release pages, a page request SHALL pass the page guards: a visitor's address limited as the request-capacity capability states, answered 429 past the limit, and a page url with a per-click id redirected as the edge-caching capability states. A visitor's render past the render limit SHALL be answered 503 by the api instead of rendered. A path under the docs SHALL NOT reach the ui's handler, and a docs path that matches no built file SHALL get the docs site's own not-found page.

A page's title, canonical, card tags, and structured data SHALL be declared by its own route, and the server SHALL render them with the page.

When the ui's server build is missing, a page request SHALL respond 404 with a message naming `build:ui`. When the build exists but fails to import, the failure SHALL be logged and reported, and a page request SHALL respond 503, so a broken deploy is visible and a crawler retries the page instead of dropping it.

#### Scenario: A page path is rendered by the ui's handler

- **WHEN** a request arrives for a path that matches no api route and no built asset
- **THEN** the ui's handler resolves it against the route tree and responds with that page

#### Scenario: A page url with a per-click id is redirected before the handler

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

#### Scenario: A docs path never reaches the ui

- **WHEN** a request arrives for a path under the docs that matches no built file
- **THEN** the docs site's own not-found page is served, and the ui's handler never sees the request

## ADDED Requirements

### Requirement: Every response includes the baseline security headers

Every response SHALL include `Referrer-Policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff`,
and the default content security policy SHALL restrict `base-uri` and `form-action` to this origin. A route that sets
its own value for any of these SHALL keep it.

#### Scenario: Every response has the headers

- **WHEN** any route answers
- **THEN** the response has the referrer policy, the no-sniff header, and a policy whose base url and form action stay
  on this origin
