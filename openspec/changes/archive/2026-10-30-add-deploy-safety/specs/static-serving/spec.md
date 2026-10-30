## MODIFIED Requirements

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
