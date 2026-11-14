## ADDED Requirements

### Requirement: A link preloads its route on intent

The router SHALL preload a link's route on intent: a hover, a focus, or a touch start of a link SHALL load that
route's scripts and run its loader, so a click renders without waiting for a script. A preload SHALL count no view. A
public route's loader returns at once in the browser, so its preload SHALL send no request to the api.

#### Scenario: A hover loads the route's scripts

- **WHEN** a visitor moves the pointer onto a link to a topic page and then clicks it
- **THEN** the route's scripts were requested on the hover, and the click renders the page without waiting for one

#### Scenario: A preload counts no view

- **WHEN** a visitor hovers a link to a topic page and never clicks it
- **THEN** no view is counted, and no page read is sent

#### Scenario: A hover on a route whose loader reads

- **WHEN** a user hovers a link to a route behind sign-in, or the menu's link to the team Dashboard route
- **THEN** the first reads the session the page already holds, the second reads the user's teams, and neither
  navigates

## MODIFIED Requirements

### Requirement: Public routes render on the server, signed-in routes render on the client

A route whose content a signed-out visitor may read SHALL render on the server, so the HTML the server sends includes
that content before any script runs. Every element of that content SHALL be shown in that HTML, never hidden until a
script runs or the page scrolls, so a crawler that renders without scrolling and a browser without scripts both see it.
An entrance animation that plays on load from the HTML is allowed, and content the browser renders can stay hidden until
it scrolls into view. The sign-in, sign-up, and password reset pages, and every route behind sign-in, SHALL NOT render
on the server, and their pages render in the browser. A request that brings a session cookie SHALL render every route in
the browser. The HTML for that request SHALL hold the layout route's pending component, which has no minimum display
time, as the `page-load` capability states.

A server-rendered route SHALL read its data in a loader that calls the api over http, at the base url the app gives the
typed client. On the server that base url SHALL be the value of `API_ORIGIN` if it is set, and the loopback address
`http://localhost:3000` otherwise. The `web` service SHALL start with `API_ORIGIN` unset, so a render reads the api of
the process that renders it. `apps/web` and the universal packages SHALL NOT import the api, the worker, or the database
as values, and the package boundary check SHALL enforce that rule in preflight, as the workspace-structure capability
states.

A server-rendered page's loader SHALL send its page's one page read as its only api request, as the page-reads
capability states. The payload SHALL reach the browser in the HTML, and hydration SHALL start from it and fetch nothing
that the server already read.

#### Scenario: A public page arrives rendered

- **WHEN** a client with no JavaScript requests a public route
- **THEN** the HTML the server sends includes that page's own content

#### Scenario: A public page's lower sections show without a scroll

- **WHEN** a crawler renders a public topic page at a phone's size without scrolling, or a browser without scripts opens
  it
- **THEN** every section is shown, including the one with Carl's recap below the first screen, and none has zero opacity

#### Scenario: A signed-in page arrives unrendered

- **WHEN** a client requests a route behind sign-in
- **THEN** the server sends the application shell and the route renders in the browser

#### Scenario: A signed-in user's request renders in the browser

- **WHEN** a request for a public route brings a session cookie
- **THEN** the server sends the application shell with the layout's pending component in its body, and the page renders
  in the browser

#### Scenario: A value import across the boundary is rejected

- **WHEN** code under `apps/web` or a universal package imports the api, the worker, or the database as a value
- **THEN** the package boundary check fails, whether or not that import would have worked on the server

#### Scenario: A web service render reads its own api

- **WHEN** the `web` service renders a public topic page with `API_ORIGIN` unset
- **THEN** the page's loader reads the topic from the `web` process's own `/api`, and no request goes to the `app`
  service

#### Scenario: A set origin moves a render's reads

- **WHEN** a process starts with `API_ORIGIN` naming another service and renders a public page
- **THEN** the page's loader reads from that origin

#### Scenario: A render sends one page read and hydration sends none

- **WHEN** the server renders a public profile and the visitor's browser hydrates it
- **THEN** the loader sent the profile's page read alone, the HTML holds its payload, and the browser sends no request
  for the head, the profile, or its news
