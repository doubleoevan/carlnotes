# static-serving Specification

## Purpose
TBD - created by archiving change serve-ui-bundle-from-api. Update Purpose after archive.
## Requirements
### Requirement: The app service serves the built UI bundle

The app service SHALL serve the files in `ui/dist` from the same process that serves the API, so one container answers both. Static files SHALL be served through Hono's Bun `serveStatic` adapter rather than a hand-rolled file route, and SHALL carry the content type implied by their extension.

#### Scenario: An asset is served from the bundle

- **WHEN** a request arrives for a file that exists in the bundle, such as `/assets/index-C3Cn5oAz.js`
- **THEN** the app answers 200 with that file's bytes and a JavaScript content type

#### Scenario: The site root serves the app shell

- **WHEN** a request arrives for `/`
- **THEN** the app answers 200 with `index.html`

### Requirement: Hashed assets cache immutably, the app shell revalidates

Files under `assets/` carry a content hash in their filename, so a given URL's bytes never change and SHALL be cached with `Cache-Control: public, max-age=31536000, immutable`. `index.html` has a stable URL whose contents change on every deploy and SHALL be sent with `Cache-Control: no-cache`, so a reader picks up a new deploy on their next request. Every other statically served file, including files copied from `public/`, SHALL use the same `no-cache` policy, since their names carry no hash.

#### Scenario: A hashed asset is cached for a year

- **WHEN** a file under `assets/` is served
- **THEN** its `Cache-Control` marks it public, immutable, and cacheable for a year

#### Scenario: The app shell is revalidated

- **WHEN** `index.html` is served, whether at the root or as the client-route fallback
- **THEN** its `Cache-Control` is `no-cache`, so the browser revalidates before reusing it

#### Scenario: An unhashed public file is not cached immutably

- **WHEN** a file whose name carries no content hash is served, such as `/carl-hero.png`
- **THEN** it is not marked immutable, so replacing it takes effect on the next deploy

### Requirement: Client routes fall back to the app shell

A path that matches no static file and no API route SHALL be answered with `index.html` so the client router can resolve it. The fallback SHALL apply only to `GET` and `HEAD` requests.

The public topic path SHALL be answered ahead of that fallback by a route that reads the same `index.html` and injects the link-preview meta tags before serving it, as `social-sharing` requires. What it returns is still the app shell, so the client router resolves the topic page exactly as it did when the plain fallback answered. The interception SHALL sit ahead of the static handler, because once the static handler answers there is no opportunity left to modify the document.

The profile route SHALL be answered by the plain fallback like any other client route. It is addressed by user id under `/profiles`, so it claims no root-namespace segment and no username can shadow a real top-level path.

`/docs` SHALL be claimed by the docs static handler ahead of the fallback, as `docs-site` requires. No path under `/docs` reaches the fallback: a docs path that matches no built file answers the docs site's own 404 page. The app shell is never the answer to a docs URL, since a reader who mistypes one belongs in the docs rather than in the app.

#### Scenario: A deep link resolves to the app

- **WHEN** a reader opens `/topics/abc123` directly
- **THEN** the app answers 200 with `index.html`, and the client router renders the topic page

#### Scenario: A write to an unknown path is not a page

- **WHEN** a `POST` arrives for a path that matches no route
- **THEN** the app answers 404 rather than returning `index.html`

#### Scenario: The public topic path is answered with meta injected

- **WHEN** a `GET` arrives for a public Topic's path
- **THEN** the response is the app shell carrying the injected preview meta tags, served ahead of the static handler

#### Scenario: The injected shell still boots the client router

- **WHEN** a reader opens a public Topic's path in a browser
- **THEN** the app renders the topic page from the injected shell exactly as before

#### Scenario: A profile route falls back to the shell

- **WHEN** a reader opens a `/profiles/:userId` route directly
- **THEN** the app answers with `index.html` and the client router renders the profile page

#### Scenario: A docs path does not reach the fallback

- **WHEN** a `GET` arrives for any path under `/docs`, matching a built file or not
- **THEN** the docs handler answers it, and the app shell fallback never runs

### Requirement: The fallback never answers for an API path

The fallback SHALL NOT apply to any path under `/api`. An unmatched `/api` path SHALL keep the API's own 404 and its JSON body, so a missing or retired endpoint fails as an API failure rather than returning an HTML page that a fetch client cannot parse.

#### Scenario: An unknown API path stays a JSON 404

- **WHEN** a request arrives for `/api/does-not-exist`
- **THEN** the app answers 404 with a JSON body, and never with `index.html`

#### Scenario: An existing API route is unaffected

- **WHEN** a request arrives for a registered API route
- **THEN** it is served by that route exactly as before, with its existing status and response shape

### Requirement: A missing bundle degrades rather than crashing

The server SHALL start and serve the API when `ui/dist` is absent, which is the normal state in local development where Vite serves the UI and proxies `/api`. A static lookup or fallback that finds no file SHALL answer 404 rather than throwing.

#### Scenario: The api runs in dev with no bundle built

- **WHEN** the server starts with no `ui/dist` directory and a request arrives for `/`
- **THEN** the server is running, the API routes work, and the request answers 404 without an unhandled error

### Requirement: Built docs assets cache like the UI bundle's

Files in the docs output whose names carry a content hash SHALL be cached with `Cache-Control: public, max-age=31536000, immutable`, like the UI bundle's hashed assets. Every other docs file, including each page's HTML and the search index, SHALL be sent with `no-cache`, so a reader picks up rewritten documentation on their next request.

#### Scenario: A hashed docs asset is cached for a year

- **WHEN** a content-hashed file under the docs output is served
- **THEN** its `Cache-Control` marks it public, immutable, and cacheable for a year

#### Scenario: A docs page revalidates

- **WHEN** a docs page's HTML is served
- **THEN** its `Cache-Control` is `no-cache`, so a rewritten page reaches readers on the next deploy

### Requirement: Missing docs output degrades rather than crashing

The server SHALL start and serve every other route when `docs/dist` is absent, which is the normal state in local development where the docs run under their own dev server. A docs lookup that finds no file SHALL answer 404 rather than throwing.

#### Scenario: The api runs with no docs built

- **WHEN** the server starts with no `docs/dist` directory and a request arrives for `/docs`
- **THEN** the server is running, every other route works, and the request answers 404 without an unhandled error

