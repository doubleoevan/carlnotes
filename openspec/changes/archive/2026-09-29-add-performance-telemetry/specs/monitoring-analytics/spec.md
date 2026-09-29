## MODIFIED Requirements

### Requirement: Sentry instruments the api and the worker with an environment tag and sampled tracing

When `SENTRY_DSN` is set and `DOPPLER_ENVIRONMENT` is `prd`, `api` and `worker` SHALL report unhandled and logged errors to Sentry, tagged with the environment that the existing `DOPPLER_ENVIRONMENT` value names, with no new variable, and SHALL enable tracing at a sampled rate that configuration can override. Outside `prd` they SHALL send nothing, since the Sentry quota is shared across environments. Default PII collection SHALL be off.

With tracing on, each request the api serves SHALL be sampled for a transaction, as the `performance-telemetry` capability names and measures it. The health checks, the built assets, the docs site, and the static files at the site root SHALL be sampled at zero, so the platform's polling spends no quota. The badge polls, `/api/rooms/mention-count`, `/api/note-badges`, and `/api/invites/topics/pending`, SHALL be sampled at a tenth of the configured rate, since they are the most frequent requests and the least varied. Every other request SHALL be sampled at the configured rate.

#### Scenario: An error carries its environment

- **WHEN** the worker reports an error while running with `DOPPLER_ENVIRONMENT=prd`
- **THEN** the Sentry event is tagged with that environment, and a `dev` run sends nothing, so the shared quota is spent on production alone

#### Scenario: Traces are sampled, not complete

- **WHEN** requests and Scans run with tracing enabled
- **THEN** only the configured fraction of traces is sent, and the sample rate is configurable without a code change

#### Scenario: The platform's polling is not sampled

- **WHEN** Northflank polls `/api/health` every few seconds with tracing on
- **THEN** no transaction is sent for those requests, and the sampled share applies only to requests that do work

#### Scenario: A badge poll is sampled at a tenth of the rate

- **WHEN** the rate is 0.1 and open tabs poll `/api/rooms/mention-count`
- **THEN** one poll in a hundred is traced, while one feed request in ten is

### Requirement: Context-doc and source content are scrubbed before any Sentry send

No context-doc text and no fetched source content SHALL be attached to a Sentry event, and a send-time scrub SHALL run over the outgoing event as a backstop, removing content-bearing fields rather than dropping the event. The scrub SHALL run on transactions as well as on errors. A query span SHALL name its statement and SHALL NOT include the query's parameter values, which are where a Topic's text or a user's input would be. No event SHALL include a query string, on its request or any of the request's headers, its url, its span attributes, or its breadcrumbs, since a password reset token, an unsubscribe token, a consent code, or a third party's key can travel there, and a referer header repeats the query string of the page before. A transaction's urls SHALL be reported by its route pattern, so an id or a token in a path never reaches a transaction. An error SHALL keep its request's path, which is what makes the error debuggable, except for an invite link's token, the one bearer token a path includes, which every event SHALL report as `:token`.

The scrub SHALL be local and synchronous — it inspects the event's own fields and makes no network call. It SHALL NOT call the content scanner: error reporting is the one path that must keep working while other things are failing, and a scanner outage would generate the very errors the scan was screening.

The scrub SHALL defend by field name and by length: fields whose names read like content are dropped, and any remaining string longer than a short identifier bound is truncated, including inside nested objects — an identifier is short and content is long, so length catches what naming misses.

Console output SHALL NOT leave the box as breadcrumbs. The SDK records every console call as a breadcrumb and attaches it to the next event, which the field scrub above never inspects, so console breadcrumbs SHALL be dropped before an event carries them. A log line is written for an operator reading logs and is free to name a recipient or quote a response body, so nothing a call site did not deliberately attach SHALL ride along. Breadcrumbs the SDK records itself, such as outgoing requests, SHALL survive, without their query strings.

#### Scenario: A log line naming a person never reaches an event

- **WHEN** a failure is logged and then reported, and the log line names something the report deliberately excluded
- **THEN** the console breadcrumb is dropped, so only what the call site attached is sent

#### Scenario: An event carrying content has it removed, not the event dropped

- **WHEN** an event would carry context-doc or source content
- **THEN** the content is removed from the event and the error itself is still reported

#### Scenario: Content hiding under an innocent name is bounded by length

- **WHEN** an event carries a page-sized string in a field whose name does not read like content
- **THEN** the string is truncated to the identifier bound and marked as cut, so the event ships without the body

#### Scenario: The scrub makes no network call

- **WHEN** an event is scrubbed on its way out
- **THEN** the scrub completes from the event's own fields, so a scanner or network outage cannot delay or fail error reporting

#### Scenario: A transaction is scrubbed like an error

- **WHEN** a transaction includes a content-named field or a page-sized string in its contexts or extra data
- **THEN** the same scrub removes or truncates it before the transaction is sent

#### Scenario: A query's values never reach a span

- **WHEN** a traced request saves a Topic's prompt
- **THEN** the query span names the statement with its placeholders, and the prompt's text appears nowhere in the transaction

#### Scenario: A reset token never reaches Sentry

- **WHEN** a traced request to `/reset-password?token=<token>` renders, or an error is reported while it runs
- **THEN** the event's url is `/reset-password` with no query string, and the token appears in no attribute or field

#### Scenario: A referer's query string never reaches Sentry

- **WHEN** the reset password page calls the api, and the request's referer header is `/reset-password?token=<token>`
- **THEN** the event's referer header, as a request header and as a span attribute, is the page's url without its query string

#### Scenario: An invite token in a path never reaches a transaction

- **WHEN** a traced request renders `/invite/<token>`
- **THEN** the transaction's name, its url attributes, and its request's url read `/invite/:token`

#### Scenario: An error keeps its path but not an invite link's token

- **WHEN** an error is reported during a request for `/api/topics/<id>`, and another during a request for `/invite/<token>`
- **THEN** the first event's url keeps the Topic's id, and the second's reads `/invite/:token`, as do its referer and its span urls

### Requirement: Visit analytics run in the browser

When the browser analytics key is set, the app SHALL send PostHog one page view per page opened, a page leave when
that page closes, and the page's web vitals, and nothing else. It SHALL NOT enable autocapture, and SHALL NOT enable session recording, so no
click, keystroke, form value, scroll, or recording is ever collected. The page leave is what gives a session its exit
page and its duration, and collects nothing the page view did not. A page view SHALL include the page's path, its referrer, and what
PostHog's own client reads from the browser, such as the user agent and the screen size. It SHALL NOT include
anything the user typed.

Because the app is one page under a router, a page view SHALL be captured on every route change and not only on the
first load, so a visit that reads four pages reports four views.

The web vitals SHALL be largest contentful paint, interaction to next paint, cumulative layout shift, and first
contentful paint, captured by PostHog's own web vitals capture with attribution off, so no element selector and no
resource url is sent. The web vitals code SHALL load from the app's own build after the client starts, and no script
SHALL load from PostHog's asset host.

A path that includes an identifier SHALL be reported as its route's shape rather than its literal value, so
`/topics/<id>` reports as one page instead of one row per Topic, and no Topic, profile, or invite id is attached to a
visitor who never signed in. That rewrite SHALL run on every event as it is sent, and on every path and every url the event includes, top-level
or inside a web vitals metric, including the previous page's path that the client attaches to a page view and a page
leave, since the url repeats the path and the page leave and the web vitals are captured by the client rather than by
the app.

#### Scenario: A visit to a public page is counted
- **WHEN** a signed-out visitor opens a public Topic page
- **THEN** one page view is sent, carrying the route's shape and the referrer, and no click or input is collected

#### Scenario: Reading several pages reports several views
- **WHEN** a visitor moves from the home page to a Topic and then to a profile without reloading
- **THEN** three page views are sent, one per route change

#### Scenario: An id in the path is not reported
- **WHEN** a visitor opens `/topics/<id>`
- **THEN** the view reports the route's shape, and the Topic's id appears in no property

#### Scenario: The page leave is rewritten too
- **WHEN** the visitor leaves `/topics/<id>` and the client sends its own page leave
- **THEN** that event's path and url both report the route's shape, since the rewrite runs on the way out and not at
  the one call the app makes

#### Scenario: Nothing inside the page is captured
- **WHEN** a visitor clicks buttons, types into the composer, and scrolls
- **THEN** no event is sent for any of it, and no session is recorded

#### Scenario: Web vitals report the route's shape
- **WHEN** a visitor opens `/topics/<id>` and the page's web vitals are sent
- **THEN** the event's url and each metric's url report the route's shape, and the Topic's id appears in no property

#### Scenario: Web vitals load from the app
- **WHEN** the analytics client starts
- **THEN** the web vitals code arrives as a chunk from the app's own origin, and no script loads from PostHog's asset host

#### Scenario: The previous page's path is rewritten too
- **WHEN** a visitor moves from `/topics/<id>` to a profile, and the client attaches the previous page's path to the view
- **THEN** that path reports `/topics/:id`, and the Topic's id appears in no property
