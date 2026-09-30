## MODIFIED Requirements

### Requirement: Hashed assets cache immutably, rendered pages revalidate

Files under `assets/` include a content hash in their filename, so a given URL's bytes never change and SHALL be cached with `Cache-Control: public, max-age=31536000, immutable`. A page the ui's server handler renders has a stable URL whose contents change on every deploy and SHALL be sent with `Cache-Control: no-cache`, so a user picks up a new deploy on their next request. A page rendered for a request without a session cookie SHALL also be shared at the edge for a minute, as the edge-caching capability states, and a page rendered for a request with one SHALL be sent with `Cache-Control: private, no-cache`. Every other statically served file, including files copied from `public/`, SHALL use `no-cache`, since their names include no hash.

#### Scenario: A hashed asset is cached for a year

- **WHEN** a file under `assets/` is served
- **THEN** its `Cache-Control` marks it public, immutable, and cacheable for a year

#### Scenario: A rendered page is revalidated

- **WHEN** the ui's server handler renders a page
- **THEN** its `Cache-Control` includes `no-cache`, so the browser revalidates before reusing it

#### Scenario: A signed-out page is shared at the edge

- **WHEN** the ui's server handler renders a page for a request without a session cookie
- **THEN** the response also has `CDN-Cache-Control: max-age=60, stale-while-revalidate=60`

#### Scenario: A signed-in page is private

- **WHEN** the ui's server handler renders a page for a request with a session cookie
- **THEN** its `Cache-Control` is `private, no-cache` and it has no `CDN-Cache-Control`

#### Scenario: An unhashed public file is not cached immutably

- **WHEN** a file whose name has no content hash is served, such as `/carl-hero.png`
- **THEN** it is not marked immutable, so replacing it takes effect on the next deploy
