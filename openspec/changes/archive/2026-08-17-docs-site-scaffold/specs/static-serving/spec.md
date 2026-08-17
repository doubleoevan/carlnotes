## MODIFIED Requirements

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

## ADDED Requirements

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
