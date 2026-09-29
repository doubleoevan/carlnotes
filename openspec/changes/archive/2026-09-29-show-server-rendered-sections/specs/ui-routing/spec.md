## MODIFIED Requirements

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
