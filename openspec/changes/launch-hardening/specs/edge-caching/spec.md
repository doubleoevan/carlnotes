## MODIFIED Requirements

### Requirement: A signed-out page and the signed-out feed are shared at the edge for a minute

The api, started as the `app` service or the `web` service, SHALL send a page the ui's server renders, a blog page, a
release page, and `/api/topic-feed` with `Cache-Control: no-cache`,
`CDN-Cache-Control: max-age=60, stale-while-revalidate=60, stale-if-error=120`, and
`Cache-Tag: rendered` if the response is a 200 or a permanent redirect (301 or 308), the request has no Better Auth
session cookie and no `Authorization` header, and the response sets no cookie. Every other response from those routes
SHALL be sent with `Cache-Control: private, no-cache` and no `CDN-Cache-Control`. The browser always revalidates, and
only the edge shares a copy. A permanent redirect is shared so a stale link in circulation, such as a topic's old slug,
costs the origin one response a minute instead of one per click. The edge MAY serve a shared copy stale for up to two
minutes while the origin responds with an error, so a shed render's 503 reaches a visitor only where the edge has no
copy.

#### Scenario: A public topic page is shared at the edge

- **WHEN** a request without a session cookie renders a public topic page
- **THEN** the response has `Cache-Control: no-cache` and `CDN-Cache-Control: max-age=60, stale-while-revalidate=60,
  stale-if-error=120`

#### Scenario: The same page with a session cookie is private

- **WHEN** the same page is requested with a Better Auth session cookie
- **THEN** the response has `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: The signed-out feed is shared and the signed-in feed is not

- **WHEN** `/api/topic-feed` is requested without a session cookie, then with one
- **THEN** the first response has the shared `CDN-Cache-Control`, and the second has `Cache-Control: private, no-cache`
  and no `CDN-Cache-Control`

#### Scenario: A response that sets a cookie is never shared

- **WHEN** a page response for a request without a session cookie includes `Set-Cookie`
- **THEN** it is sent with `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A page that did not render is never shared

- **WHEN** a page responds with a status other than 200, 301, or 308
- **THEN** it is sent with `Cache-Control: private, no-cache`

#### Scenario: A permanent redirect is shared

- **WHEN** a request without a session cookie reaches a topic's old slug and is redirected permanently
- **THEN** the redirect is sent with the shared `CDN-Cache-Control`

#### Scenario: The web service sends the same headers

- **WHEN** path routing sends a public topic page to the `web` service and a request without a session cookie renders
  it
- **THEN** the response has the headers and the `rendered` tag that the `app` service sends for the same request

### Requirement: Each release purges the rendered responses from the edge

The release pipeline SHALL purge every edge response tagged `rendered` right after the new `web` service is running,
which the release deploys after the new app, with Cloudflare's purge by tag, which includes the unhashed public files.
A purge request SHALL give up after ten seconds. A missing Cloudflare setting SHALL be logged, and a failed purge SHALL
be logged and reported to Sentry, and neither SHALL fail the release.

#### Scenario: A release purges the pages

- **WHEN** a release has deployed the app and then the `web` service
- **THEN** the purge job clears the `rendered` tag before the worker deploys

#### Scenario: Images and assets survive the purge

- **WHEN** the purge runs
- **THEN** hashed assets, avatars, cards, and the Sources' favicons the api serves stay cached at the edge, while the
  site's own unhashed public files, its favicon among them, are cleared with the pages

#### Scenario: A failed purge does not stop the release

- **WHEN** the purge request fails
- **THEN** the job logs why, reports the failure to Sentry, and exits successfully, and the worker still deploys

#### Scenario: Unset purge settings do not stop the release

- **WHEN** the Cloudflare settings are unset
- **THEN** the job logs that the purge was skipped, reports nothing, and exits successfully, and the worker still
  deploys

#### Scenario: The purge never runs ahead of the web service

- **WHEN** the new `web` replicas are still rolling out
- **THEN** the purge has not run, so the edge never refills from a replica of the previous build
