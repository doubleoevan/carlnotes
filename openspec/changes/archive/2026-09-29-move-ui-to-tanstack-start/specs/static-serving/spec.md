## REMOVED Requirements

### Requirement: The app service serves the built UI bundle

**Reason**: The ui's server handler renders every page, and `ui/dist/client` has only the browser files.

**Migration**: See the added requirement, The app service serves the api and the ui from one process.

### Requirement: Client routes fall back to the app shell

**Reason**: The ui's server handler renders every path the api does not claim.

**Migration**: See the added requirement, Unclaimed GET paths are served by the ui's server handler.

### Requirement: Hashed assets cache immutably, the app shell revalidates

**Reason**: No `index.html` is served. Every page comes from the ui's server handler.

**Migration**: See the added requirement, Hashed assets cache immutably, rendered pages revalidate.

### Requirement: The fallback never answers for an API path

**Reason**: The fallback is now the ui's server handler, and no `index.html` exists.

**Migration**: See the added requirement, The ui's handler never serves an API path.

## ADDED Requirements

### Requirement: The app service serves the api and the ui from one process

The app service SHALL serve both the api and the ui from one process, so one container serves the whole app. The ui's built assets SHALL be served with the content type implied by their extension, and its pages SHALL be served by the ui's own server handler, mounted inside the api's server as the fallback for every GET the api does not claim.

#### Scenario: An asset is served from the bundle

- **WHEN** a request arrives for a file that exists in the bundle, such as `/assets/index-C3Cn5oAz.js`
- **THEN** the app responds 200 with that file's bytes and a JavaScript content type

#### Scenario: The site root serves a rendered page

- **WHEN** a request arrives for `/`
- **THEN** the app responds 200 with that page rendered

### Requirement: Unclaimed GET paths are served by the ui's server handler

A `GET` or `HEAD` path that the api does not claim SHALL be served by the ui's server handler, which resolves it against the route tree and renders it. The handler SHALL be mounted last, so every route the api registers responds ahead of it. Only a `GET` or `HEAD` reaches the handler, and any other method on a path the api does not claim SHALL respond 404.

The api SHALL claim, ahead of the handler: its own `/api` tree, the mcp routes, the oauth well-known routes, the document routes that serve the sitemap, the feeds, the llms files, the IndexNow key file, and the security file, the blog and release pages it renders itself, the built docs, the ui's built client files, and the redirect of a page path that ends in a slash. A path under the docs SHALL NOT reach the ui's handler, and a docs path that matches no built file SHALL get the docs site's own not-found page.

A page's title, canonical, card tags, and structured data SHALL be declared by its own route, and the server SHALL render them with the page.

When the ui's server build is missing, a page request SHALL respond 404 with a message naming `build:ui`. When the build exists but fails to import, the failure SHALL be logged and reported, and a page request SHALL respond 503, so a broken deploy is visible and a crawler retries the page instead of dropping it.

#### Scenario: A page path is rendered by the ui's handler

- **WHEN** a request arrives for a path that matches no api route and no built asset
- **THEN** the ui's handler resolves it against the route tree and responds with that page

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

### Requirement: Hashed assets cache immutably, rendered pages revalidate

Files under `assets/` include a content hash in their filename, so a given URL's bytes never change and SHALL be cached with `Cache-Control: public, max-age=31536000, immutable`. A page the ui's server handler renders has a stable URL whose contents change on every deploy and SHALL be sent with `Cache-Control: no-cache`, so a user picks up a new deploy on their next request. Every other statically served file, including files copied from `public/`, SHALL use the same `no-cache` policy, since their names include no hash.

#### Scenario: A hashed asset is cached for a year

- **WHEN** a file under `assets/` is served
- **THEN** its `Cache-Control` marks it public, immutable, and cacheable for a year

#### Scenario: A rendered page is revalidated

- **WHEN** the ui's server handler renders a page
- **THEN** its `Cache-Control` is `no-cache`, so the browser revalidates before reusing it

#### Scenario: An unhashed public file is not cached immutably

- **WHEN** a file whose name has no content hash is served, such as `/carl-hero.png`
- **THEN** it is not marked immutable, so replacing it takes effect on the next deploy

### Requirement: The ui's handler never serves an API path

The ui's server handler SHALL NOT apply to any path under `/api`. An unmatched `/api` path SHALL keep the API's own 404 and its JSON body, so a missing or retired endpoint fails as an API failure instead of returning an HTML page that a fetch client cannot parse.

#### Scenario: An unknown API path stays a JSON 404

- **WHEN** a request arrives for `/api/does-not-exist`
- **THEN** the app responds 404 with a JSON body, and never with a rendered page

#### Scenario: An existing API route is unaffected

- **WHEN** a request arrives for a registered API route
- **THEN** it is served by that route exactly as before, with its existing status and response shape
