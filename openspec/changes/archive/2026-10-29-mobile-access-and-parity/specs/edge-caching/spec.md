# Spec Delta

## MODIFIED Requirements

### Requirement: A public topic's counts are shared at the edge for thirty seconds

A counts response for a public Topic, or for a Podcast Episode of one, requested without credentials, SHALL be sent
with `Cache-Control: no-cache` and `CDN-Cache-Control: max-age=30`, with no `stale-while-revalidate` and no
`Cache-Tag`, so the edge serves one copy to every visitor for at most 30 seconds. A counts response for any other
Topic, any request with credentials, and every error SHALL be sent with `Cache-Control: private, no-cache` and no
`CDN-Cache-Control`. The browser SHALL fetch a public Topic's counts without credentials, so a signed-in person reads
the shared copy too. The mobile app SHALL send no session cookie on a public Topic's or Podcast Episode's counts read,
so a signed-in app reads the shared copy too, while every other request keeps the cookie.

#### Scenario: A public topic's counts are shared

- **WHEN** a client fetches the counts of a public Topic
- **THEN** the response includes `CDN-Cache-Control: max-age=30` and no session is read

#### Scenario: A private topic's counts are never shared

- **WHEN** a member fetches the counts of a private Topic with their session
- **THEN** the response includes `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A public topic's counts fetched with credentials are not shared

- **WHEN** a request with a session cookie fetches the counts of a public Topic
- **THEN** the response includes `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A signed-in app reads public counts without its cookie

- **WHEN** a signed-in mobile app reads the counts of a public Topic
- **THEN** the request has no `Cookie` header and the response includes `CDN-Cache-Control: max-age=30`, and the app's
  next request for the Topic page sends the cookie as before
