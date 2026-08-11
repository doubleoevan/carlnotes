## MODIFIED Requirements

### Requirement: Client routes fall back to the app shell

A path that matches no static file and no API route SHALL be answered with `index.html` so the client router can resolve it. The fallback SHALL apply only to `GET` and `HEAD` requests.

The public topic path SHALL be answered ahead of that fallback by a route that reads the same `index.html` and injects the link-preview meta tags before serving it, as `social-sharing` requires. What it returns is still the app shell, so the client router resolves the topic page exactly as it did when the plain fallback answered. The interception SHALL sit ahead of the static handler, because once the static handler answers there is no opportunity left to modify the document.

The profile route SHALL be answered by the plain fallback like any other client route. It is addressed by user id under `/profiles`, so it claims no root-namespace segment and no username can shadow a real top-level path.

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
