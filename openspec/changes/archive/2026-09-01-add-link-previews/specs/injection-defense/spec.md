## ADDED Requirements

### Requirement: A content security policy holds images to this origin

Every response SHALL include a `Content-Security-Policy` header setting `img-src` to this origin, with `blob:` and `data:` for the local file a composer previews before upload. The policy SHALL also set `object-src 'none'` and `frame-ancestors 'none'`.

This backs up the inline-image rule instead of replacing it. Model-written and user-pasted markdown images still render as text links, and a link preview's image is still fetched once by the server and served from this origin — the policy is what makes a remote image that escaped either rule fail in the browser instead of quietly loading and reporting the reader to its host.

The policy SHALL NOT set `script-src` or `style-src`. The application shell runs an inline theme script before first paint, and a script policy that broke it would be reverted instead of kept.

#### Scenario: A remote image is blocked

- **WHEN** any page in the application renders an image whose source is another origin
- **THEN** the browser blocks the request

#### Scenario: A proxied preview image loads

- **WHEN** a link preview card renders its image from this application's own route
- **THEN** the image loads

#### Scenario: The inline theme script still runs

- **WHEN** the application shell loads
- **THEN** the inline theme script runs and the page does not flash the wrong theme
