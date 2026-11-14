## ADDED Requirements

### Requirement: An unchecked image's file is never stored by a shared cache

An unchecked image's file SHALL be sent only to its uploader's session and never with a header that lets a shared cache
store it: an unchecked avatar with `Cache-Control: private, no-store` and no `CDN-Cache-Control`, and any other
unchecked image with the private headers a non-public Topic's image gets. A request for an avatar that names
`unchecked=1`, as the mobile app's own request does, SHALL get the file at exactly the version it names or a 404, and
never a redirect.

#### Scenario: The uploader's unchecked avatar is not stored

- **WHEN** a user's own session requests the avatar route at the version of that user's unchecked upload
- **THEN** the unchecked image is sent with `Cache-Control: private, no-store` and no `CDN-Cache-Control`

#### Scenario: Anyone else gets the published avatar

- **WHEN** a request with no session, or with another user's session, asks the avatar route for that version with no
  `unchecked=1`
- **THEN** the route responds as it does for a version that is not the current one, with the published avatar or a
  404 if the user is on the generated avatar, and the unchecked image is not sent

#### Scenario: A marked request gets the version it names or nothing

- **WHEN** a request names an avatar's version with `unchecked=1`
- **THEN** its uploader's session gets the unchecked image with `private, no-store`, a request at the published upload's
  own version gets the published avatar, and every other request is not found with `private, no-store` and is never
  redirected to a provider's photo

#### Scenario: An unchecked image on a public Topic is not shared

- **WHEN** the uploader's session requests a file of a public Topic's unchecked image
- **THEN** the file is sent with private headers and no `CDN-Cache-Control`, and the same request with no session is
  not found
