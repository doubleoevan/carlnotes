# ui-routing Specification

## Purpose
TBD - created by archiving change move-ui-to-tanstack-start. Update Purpose after archive.
## Requirements
### Requirement: The ui routes are files under a route tree

The ui SHALL declare its routes as files under `ui/src/routes`, one file per route, with the route tree generated from that directory. Every page under `ui/src/pages` SHALL have a route file, except `NotFoundPage`, which the `_layout` route renders as its `notFoundComponent`.

A literal path passed to the router's own `Link` or `useNavigate` SHALL be type-checked against the route tree, so a literal path that no route serves fails to compile instead of resolving to the not-found route at runtime. A path passed to `AnchorLink` as a string href is not type-checked.

#### Scenario: A route resolves from its file

- **WHEN** a request arrives for a path a route file declares
- **THEN** that route's component renders, with no route table declared in application code

#### Scenario: A path no route serves fails to compile

- **WHEN** code passes the router's `Link` or `useNavigate` a literal path that no route file declares
- **THEN** the type check fails, instead of the not-found route rendering at runtime

### Requirement: Public routes render on the server, signed-in routes render on the client

A route whose content a signed-out visitor may read SHALL render on the server, so the HTML the server sends includes that content before any script runs. Every element of that content SHALL be shown in that HTML, never hidden until a script runs or the page scrolls, so a crawler that renders without scrolling and a browser without scripts both see it. An entrance animation that plays on load from the HTML is allowed, and content the browser renders can stay hidden until it scrolls into view. The sign-in, sign-up, and password reset pages, and every route behind sign-in, SHALL NOT render on the server, and their pages render in the browser. A request that brings a session cookie SHALL render every route in the browser.

A server-rendered route SHALL read its data in a loader that calls the api over http. The ui SHALL NOT import the api, the worker, or the database as values, and a preflight check SHALL enforce that rule.

#### Scenario: A public page arrives rendered

- **WHEN** a client with no JavaScript requests a public route
- **THEN** the HTML the server sends includes that page's own content

#### Scenario: A public page's lower sections show without a scroll

- **WHEN** a crawler renders a public topic page at a phone's size without scrolling, or a browser without scripts opens it
- **THEN** every section is shown, including the one with Carl's recap below the first screen, and none has zero opacity

#### Scenario: A signed-in page arrives unrendered

- **WHEN** a client requests a route behind sign-in
- **THEN** the server sends the application shell and the route renders in the browser

#### Scenario: A signed-in user's request renders in the browser

- **WHEN** a request for a public route brings a session cookie
- **THEN** the server sends the application shell and the page renders in the browser

#### Scenario: A value import across the boundary is rejected

- **WHEN** code under `ui/src` imports the api, the worker, or the database as a value
- **THEN** the preflight check fails, whether or not that import would have worked on the server

### Requirement: A route behind sign-in redirects a signed-out visitor

A route that requires a session SHALL redirect a signed-out visitor to sign in with a `next` parameter naming the path they asked for. `/activity`, `/account`, `/admin`, and `/mcp/consent` SHALL decide this in `beforeLoad`, before they render. `/invite/$token` SHALL decide it in its page once the session loads, since its loader runs on the server, where no session is visible.

#### Scenario: A signed-out visitor is redirected

- **WHEN** a signed-out visitor requests a route that requires a session
- **THEN** they are redirected to sign in, and the destination includes the path they asked for

#### Scenario: Signing in returns the visitor to the page they wanted

- **WHEN** a visitor redirected from a route signs in
- **THEN** they arrive at the path they originally asked for

