## MODIFIED Requirements

### Requirement: The initials render as inline SVG, and stored images are served by the avatar route

The generated avatar SHALL be rendered as SVG inline in the DOM. An SVG loaded as its own document cannot see the page's webfont, so its letters would silently fall back to a system face.

An uploaded avatar or an opted-in provider photo SHALL be served by `GET /api/avatars/:userId?v=<version>`: the stored upload streams from storage, and a provider photo redirects to the provider's own url. The version SHALL be the upload's storage key id, so the url changes exactly when the upload does, or `oauth` for a provider photo, whose url stays the same when the provider changes the photo. The redirect to a provider photo SHALL be cached for an hour at most. The stored image SHALL be served with `Cache-Control: public, max-age=31536000, immutable` if the requested version is the current one, and with `Cache-Control: public, max-age=60` otherwise.

#### Scenario: In-app initials render inline

- **WHEN** a generated avatar renders in the app
- **THEN** its SVG is inline in the DOM and its letters use the page's display font

#### Scenario: A stored image is served by the route

- **WHEN** a user has an upload or an opted-in provider photo
- **THEN** the route streams the upload or redirects to the provider photo

#### Scenario: The current version is immutable

- **WHEN** the route is asked for an upload at its current version
- **THEN** it is served with `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: A replaced image moves to a new url

- **WHEN** a user uploads a new avatar
- **THEN** every avatar url drawn for them afterwards names the new version
