# static-serving Specification

## Purpose
TBD - created by archiving change serve-ui-bundle-from-api. Update Purpose after archive.

## Requirements

### Requirement: A missing bundle degrades rather than crashing

Outside production, the server SHALL start and serve the API when `apps/web/dist` is absent, which is the normal state
in local development where Vite serves the UI and proxies `/api`. A static lookup or fallback that finds no file SHALL
answer 404 rather than throwing. With `NODE_ENV` set to `production`, a missing or failing web server build SHALL
instead stop the boot, as the deploy-mechanics capability states.

#### Scenario: The api runs in dev with no bundle built

- **WHEN** the server starts with no `apps/web/dist` directory and a request arrives for `/`
- **THEN** the server is running, the API routes work, and the request answers 404 without an unhandled error

#### Scenario: Production does not degrade

- **WHEN** the server starts with `NODE_ENV=production` and no web server build
- **THEN** the process exits non-zero before it listens, instead of serving 404 pages

### Requirement: Built docs assets cache like the UI bundle's

Files in the docs output whose names carry a content hash SHALL be cached with `Cache-Control: public, max-age=31536000, immutable`, like the UI bundle's hashed assets. Every other docs file, including each page's HTML and the search index, SHALL be sent with `no-cache`, so a reader picks up rewritten documentation on their next request.

#### Scenario: A hashed docs asset is cached for a year

- **WHEN** a content-hashed file under the docs output is served
- **THEN** its `Cache-Control` marks it public, immutable, and cacheable for a year

#### Scenario: A docs page revalidates

- **WHEN** a docs page's HTML is served
- **THEN** its `Cache-Control` is `no-cache`, so a rewritten page reaches readers on the next deploy

### Requirement: Missing docs output degrades rather than crashing

The server SHALL start and serve every other route when `apps/docs/dist` is absent, which is the normal state in local development where the docs run under their own dev server. A docs lookup that finds no file SHALL answer 404 rather than throwing.

#### Scenario: The api runs with no docs built

- **WHEN** the server starts with no `apps/docs/dist` directory and a request arrives for `/docs`
- **THEN** the server is running, every other route works, and the request answers 404 without an unhandled error

### Requirement: The app service serves the api and the ui from one process

The app service SHALL serve both the api and the ui from one process, so one container serves the whole app. The ui's built assets SHALL be served with the content type implied by their extension, and its pages SHALL be served by the ui's own server handler, mounted inside the api's server as the fallback for every GET the api does not claim.

#### Scenario: An asset is served from the bundle

- **WHEN** a request arrives for a file that exists in the bundle, such as `/assets/index-C3Cn5oAz.js`
- **THEN** the app responds 200 with that file's bytes and a JavaScript content type

#### Scenario: The site root serves a rendered page

- **WHEN** a request arrives for `/`
- **THEN** the app responds 200 with that page rendered

### Requirement: Unclaimed GET paths are served by the ui's server handler

A `GET` or `HEAD` path that the api does not claim SHALL be served by the ui's server handler, which resolves it against
the route tree and renders it. The handler SHALL be mounted last, so every route the api registers responds ahead of it.
Only a `GET` or `HEAD` reaches the handler, and any other method on a path the api does not claim SHALL respond 404.

The api SHALL claim, ahead of the handler: its own `/api` tree, the mcp routes, the oauth well-known routes, the
document routes that serve the sitemap, the feeds, the llms files, the IndexNow key file, and the security file, the
blog and release pages it renders itself, the built docs, the built component browser, the ui's built client files, and
the redirect of a page path that ends in a slash. Ahead of the ui's handler, and ahead of the blog and release pages, a
page request SHALL pass the page guards: a visitor's address limited as the request-capacity capability states, rejected
with a 429 past the limit, and a page url with a click id redirected as the edge-caching capability states. A visitor's
render past the render limit SHALL get a 503 from the api instead of a render. A path after `/docs/` SHALL NOT reach the
ui's handler, and a docs path that matches no built file SHALL get the docs site's own not-found page. A path after
`/nightshift/` SHALL NOT reach the ui's handler either, and one that matches no built file SHALL respond 404.

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

- **WHEN** a request arrives for a path after `/docs/` that matches no built file
- **THEN** the docs site's own not-found page is served, and the ui's handler never sees the request

#### Scenario: A new replica loads the server build before it serves

- **WHEN** an api replica starts with the ui's server build in place
- **THEN** the build is imported before the replica accepts a request, so its first page renders without the import

#### Scenario: A component browser path never reaches the ui

- **WHEN** a request arrives for `/nightshift/missing.js`
- **THEN** the app responds 404, and the ui's handler never sees the request

### Requirement: Hashed assets cache immutably, rendered pages revalidate

Files under `assets/` include a content hash in their filename, so a given URL's bytes never change and SHALL be cached
with `Cache-Control: public, max-age=31536000, immutable`. A page the ui's server handler renders has a stable URL whose
contents change on every deploy and SHALL be sent with `Cache-Control: no-cache`, so a user picks up a new deploy on
their next request. A page rendered for a request without a session cookie SHALL also be shared at the edge for a
minute, as the edge-caching capability states, and a page rendered for a request with one SHALL be sent with
`Cache-Control: private, no-cache`. Every other statically served file, including files copied from `public/`, changes
only with a release and SHALL be sent with `Cache-Control: public, max-age=3600`, `CDN-Cache-Control: max-age=86400`,
and `Cache-Tag: rendered`, so the release purge clears it from the edge.

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
- **THEN** it is not marked immutable, the browser keeps it an hour and the edge a day, and the next release's purge
  clears it

### Requirement: The ui's handler never serves an API path

The ui's server handler SHALL NOT apply to any path under `/api`. An unmatched `/api` path SHALL keep the API's own 404 and its JSON body, so a missing or retired endpoint fails as an API failure instead of returning an HTML page that a fetch client cannot parse.

#### Scenario: An unknown API path stays a JSON 404

- **WHEN** a request arrives for `/api/does-not-exist`
- **THEN** the app responds 404 with a JSON body, and never with a rendered page

#### Scenario: An existing API route is unaffected

- **WHEN** a request arrives for a registered API route
- **THEN** it is served by that route exactly as before, with its existing status and response shape

### Requirement: Every response includes the baseline security headers

Every response SHALL include `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and
a content security policy that restricts `base-uri` and `form-action` to this origin. A route that sets its own value
for one of these headers SHALL keep it, and a route's own policy, such as the favicon route's, SHALL restrict `base-uri`
and `form-action` as the default does.

#### Scenario: Every response has the headers

- **WHEN** any route responds
- **THEN** the response has the referrer policy, the no-sniff header, and a policy whose base url and form action stay
  on this origin

### Requirement: The built component browser is served at /nightshift

The api SHALL serve the static Storybook build from the root `apps/api/bundlePaths.ts` names, at `/nightshift/`, for
`GET` and `HEAD`. A file whose name has a content hash, which is a file after `/nightshift/assets/` named
`<name>-<hash>.<extension>`, SHALL be sent with `Cache-Control: public, max-age=31536000, immutable`. Every other file,
including `index.html`, `iframe.html`, `index.json`, the manifests, and the fixed-name files Storybook writes for its
manager and its addons, SHALL be sent with `Cache-Control: no-cache` and no `CDN-Cache-Control`, so a deploy never
leaves a stale manager at the edge. Every response for a path after `/nightshift/` SHALL set its own content security
policy, which allows the app's own frame sources, so the manager can frame its own preview and a story can frame what
the app frames, allows `frame-ancestors 'self'`, and restricts `object-src` to none and `base-uri` and `form-action` to
this origin, and SHALL send `X-Robots-Tag: noindex`. The sitemap, `llms.txt`, and `llms-full.txt` SHALL NOT list a
`/nightshift` url. If the build is missing, which is the normal state in local development, every other route SHALL keep
working and a `/nightshift` request SHALL respond 404.

#### Scenario: A hashed preview asset is cached for a year

- **WHEN** a file such as `/nightshift/assets/iframe-B2xT9kQa.js` is served
- **THEN** its `Cache-Control` is `public, max-age=31536000, immutable`

#### Scenario: The manager revalidates

- **WHEN** `/nightshift/sb-manager/runtime.js` or `/nightshift/index.json` is served
- **THEN** its `Cache-Control` is `no-cache`, so the next deploy's manager reaches the browser on its next request

#### Scenario: The manager frames its own preview

- **WHEN** a browser opens `/nightshift/` and the manager loads `/nightshift/iframe.html` in its preview frame
- **THEN** the preview's policy allows `frame-ancestors 'self'`, and the story renders inside the frame

#### Scenario: Every other page still blocks framing

- **WHEN** any page outside `/nightshift` responds
- **THEN** its policy still sends `frame-ancestors 'none'`

#### Scenario: The component browser is not indexed

- **WHEN** a crawler fetches `/nightshift/`
- **THEN** the response has `X-Robots-Tag: noindex`, and neither the sitemap nor the llms files name it

#### Scenario: The api runs with no component browser built

- **WHEN** the server starts with no built component browser and a request arrives for `/nightshift/`
- **THEN** every other route works, and the request responds 404 without an unhandled error
