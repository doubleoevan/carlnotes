## REMOVED Requirements

### Requirement: The app server serves the built docs under /docs

**Reason**: The fallback behind the docs handler is now the ui's server handler, and no `index.html` shell exists.

**Migration**: See the added requirement, The app server serves the built docs under /docs ahead of the ui.

### Requirement: Directory URLs resolve to their index page

**Reason**: A docs path that matches no built file is kept from the ui's server handler, which replaced the app shell.

**Migration**: See the added requirement, Docs directory URLs resolve to their index page.

## ADDED Requirements

### Requirement: The app server serves the built docs under /docs ahead of the ui

The app service SHALL serve `docs/dist` under `/docs` through Hono's Bun `serveStatic`, from the same process that serves the API and the ui. Because Astro's `base` prefixes generated links without nesting the build output, the handler SHALL rewrite the incoming request path to strip the `/docs` prefix before resolving a file.

The docs handler SHALL sit ahead of the ui's built client files and the ui's server handler, so no `/docs` path is rendered by the ui.

#### Scenario: A docs page is served

- **WHEN** a user opens `/docs/how-carlnotes-works/`
- **THEN** the app responds 200 with that page's built HTML from `docs/dist`

#### Scenario: A docs asset is served

- **WHEN** a request arrives for a built docs asset under `/docs/_astro/`
- **THEN** the app responds 200 with that file's bytes, the `/docs` prefix having been stripped to resolve it

#### Scenario: A docs path never reaches the ui

- **WHEN** a request arrives for a path under `/docs`
- **THEN** the docs handler responds, and the ui's server handler never sees the request

### Requirement: Docs directory URLs resolve to their index page

The docs SHALL be built with Astro's directory output format, so each page is written as `<slug>/index.html`, and with trailing slashes always generated on internal links.

A request for a docs path with no file extension SHALL resolve to that path's `index.html`, whether or not the request ends in a slash. A path that has a file extension SHALL be resolved as the file it names.

A docs path matching no built file SHALL be served the docs site's own `404.html` with status 404, never a page the ui renders.

#### Scenario: A page URL without a trailing slash resolves

- **WHEN** a user opens `/docs/how-carlnotes-works` with no trailing slash
- **THEN** the app responds 200 with that page, instead of a 404 or a page the ui renders

#### Scenario: A page URL with a trailing slash resolves

- **WHEN** a user opens `/docs/how-carlnotes-works/`
- **THEN** the app responds 200 with the same page

#### Scenario: The docs index resolves

- **WHEN** a user opens `/docs`
- **THEN** the app responds 200 with the docs home page

#### Scenario: An unknown docs path is a docs 404

- **WHEN** a request arrives for a `/docs` path matching no built file
- **THEN** the app responds with the docs site's 404 page, and never with a page the ui renders
