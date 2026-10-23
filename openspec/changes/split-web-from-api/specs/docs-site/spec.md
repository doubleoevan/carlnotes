## MODIFIED Requirements

### Requirement: The app server serves the built docs under /docs ahead of the ui

The web service SHALL serve `apps/docs/dist` under `/docs` through Hono's Bun `serveStatic`, and the app service SHALL
keep serving it the same way, so routing `/docs` to either service gives the same response. Because Astro's `base`
prefixes generated links without nesting the build output, the handler SHALL rewrite the incoming request path to strip
the `/docs` prefix before resolving a file.

The docs handler SHALL sit ahead of the ui's built client files and the ui's server handler, so no `/docs` path is
rendered by the ui.

#### Scenario: A docs page is served

- **WHEN** a user opens `/docs/how-carlnotes-works/`
- **THEN** the web service responds 200 with that page's built HTML from `apps/docs/dist`

#### Scenario: A docs asset is served

- **WHEN** a request arrives for a built docs asset under `/docs/_astro/`
- **THEN** the web service responds 200 with that file's bytes, the `/docs` prefix having been stripped to resolve it

#### Scenario: A docs path never reaches the ui

- **WHEN** a request arrives for a path under `/docs`
- **THEN** the docs handler responds, and the ui's server handler never sees the request
