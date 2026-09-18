# monitoring-analytics Specification

## Purpose
TBD - created by archiving change harden-launch-readiness. Update Purpose after archive.
## Requirements
### Requirement: Sentry instruments the api and the worker with an environment tag and sampled tracing

When `SENTRY_DSN` is set, `api` and `worker` SHALL report unhandled and logged errors to Sentry, tagging the environment from the existing `DOPPLER_ENVIRONMENT` value (`dev`/`prd`) rather than a new variable, and SHALL enable tracing at a sampled rate that configuration can override. Default PII collection SHALL be off.

#### Scenario: An error carries its environment

- **WHEN** the worker reports an error while running with `DOPPLER_ENVIRONMENT=prd`
- **THEN** the Sentry event is tagged with that environment, and a `dev` run's events are tagged separately

#### Scenario: Traces are sampled, not complete

- **WHEN** requests and Scans run with tracing enabled
- **THEN** only the configured fraction of traces is sent, and the sample rate is configurable without a code change

### Requirement: Context-doc and source content are scrubbed before any Sentry send

No context-doc text and no fetched source content SHALL be attached to a Sentry event, and a send-time scrub SHALL run over the outgoing event as a backstop, removing content-bearing fields rather than dropping the event.

The scrub SHALL be local and synchronous — it inspects the event's own fields and makes no network call. It SHALL NOT call the content scanner: error reporting is the one path that must keep working while other things are failing, and a scanner outage would generate the very errors the scan was screening.

The scrub SHALL defend by field name and by length: fields whose names read like content are dropped, and any remaining string longer than a short identifier bound is truncated, including inside nested objects — an identifier is short and content is long, so length catches what naming misses.

Console output SHALL NOT leave the box as breadcrumbs. The SDK records every console call as a breadcrumb and attaches it to the next event, which the field scrub above never inspects, so console breadcrumbs SHALL be dropped before an event carries them. A log line is written for an operator reading logs and is free to name a recipient or quote a response body, so nothing a call site did not deliberately attach SHALL ride along. Breadcrumbs the SDK records itself, such as outgoing requests, SHALL survive.

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

### Requirement: An external uptime monitor pings the public health endpoint

An uptime monitor outside the deployment SHALL poll the public `/api/health` endpoint and alert on failure. The endpoint SHALL stay reachable without a session and without a database read, so the monitor measures process reachability.

#### Scenario: A down instance alerts

- **WHEN** the app stops answering `/api/health`
- **THEN** the external monitor alerts, without any in-app scheduling or state

### Requirement: Self-host ships with zero telemetry

Sentry and PostHog SHALL activate only when their keys are set. With `SENTRY_DSN`, `POSTHOG_API_KEY` and the browser key unset, no client SHALL initialize in the server, the worker, or the browser, no network call SHALL be made to either service, and behavior SHALL be identical to a build without them. Telemetry failures SHALL never fail a request, a Scan, or a process, and pending events SHALL be flushed before a short-lived process exits.

#### Scenario: No keys means no telemetry

- **WHEN** the app runs with neither key set
- **THEN** no Sentry or PostHog client is created, no request goes to either, and every output is unchanged

#### Scenario: A telemetry failure does not fail the work

- **WHEN** an event send or flush fails
- **THEN** the failure is logged and the request or Scan finishes with the outcome it earned

### Requirement: PostHog carries a signup-and-activation event taxonomy

When `POSTHOG_API_KEY` is set, the app SHALL emit exactly fifteen server-side events keyed to the user: the funnel `signup_completed`, `topic_created`, and `first_scan_completed`; the Topic mutations `topic_updated` and `topic_deleted`; the owner-intent pair `scan_requested` and `scan_quota_reached`; the engagement set `finding_rated`, `finding_bookmarked`, `finding_unbookmarked`, `finding_read`, `finding_unread`, and `finding_opened`; and the conversation pair `chat_turn_sent` and `chat_budget_reached`. The taxonomy SHALL stay at these fifteen until a real post-launch question motivates another, and SHALL NOT include session recording or client-side autocapture.

`topic_updated` and `topic_deleted` SHALL each carry an `isOwner` property saying whether the user who made the change owns the Topic. An admin may edit or delete any Topic, and nothing else records that it was not the owner who did — a delete especially, since the row is gone afterwards and the event is the only account of who took it. Both are answers to "who changed this", not product questions, which is why they carry a property the funnel events do not.

A server-side event SHALL NOT be a page view. The server sees a request, not a visit, so a view it inferred would miss every page served from cache and every navigation inside the app. Views are captured in the browser instead, under "Visit analytics run in the browser". `finding_read` stays what it is: the reader marking a Finding read, a state change they chose, not a view.

An event named `first_` SHALL fire only on the user's genuine first occurrence, established by a count check. `first_scan_completed` qualifies, because a Scan carries its owner and is countable. An engagement event does not: `findings.rating` is topic-scoped with no per-user row to count. So the engagement set fires on every occurrence and analytics derives the first one. No event SHALL claim "first" that the data cannot establish.

Every event SHALL carry the user's `plan` as a property, and every topic-anchored event SHALL also carry the `topicId`, because event history cannot be backfilled. A question about plan-segmented activation is only answerable from the day the property started riding along. Properties SHALL be short identifiers only, never content.

Every event a browser request triggers SHALL also carry three device properties read from that request's user agent: `platform` of `mobile` or `desktop`, `browserPlatform` of `android`, `ios`, or `other`, and `isInAppBrowser`. `platform` answers the funnel by device. `browserPlatform` and `isInAppBrowser` answer whether a visitor arrived inside another app's embedded browser, where Google rejects OAuth with `403 disallowed_useragent` and the session forms lead with email instead — without them there is no way to see how often that path is taken, or how many of those visitors were on Android and could be handed a way out. `platform` SHALL be kept alongside the finer pair rather than replaced by it, because event history cannot be backfilled and redefining a property's values would make old and new events incomparable. `first_scan_completed` SHALL carry none of the three: a scheduled Scan runs in the worker with no request and no device behind it, and a guessed value would read as real.

The user agent SHALL be read once per event and SHALL be the request's own header, never a value the client computed and sent, since a client-supplied device claim is unverifiable. A request that carries no user agent header SHALL still yield every property, reading as `desktop`, `other`, and not an in-app browser.

The `plan` and the device properties an event carries SHALL be read from the session and the request at the route, and passed down to the service function that emits the event. An event SHALL NOT cost a database query of its own, and a service function SHALL NOT need to guard the emit, since emitting already swallows its own failures.

`signup_completed` SHALL also carry a `cta` property naming the button that brought the converting visitor, when one did: each signup entry point tags its link, the signup page keeps the tag in a short-lived cookie so it survives the oauth round-trip, and the server validates the tag against a strict slug shape before attaching it — a direct visit simply carries no `cta`. This is the server's share of attribution: it names the button on the signup that converted, and SHALL NOT record which buttons were clicked and abandoned, which the server never sees.

#### Scenario: A change by someone other than the owner is on the record

- **WHEN** an admin edits or deletes a Topic they do not own
- **THEN** the event carries their user id and `isOwner` false, so the change is attributable afterwards

#### Scenario: A signup names the button that converted

- **WHEN** a visitor reaches signup from a tagged button and completes signup, on the password or the oauth path
- **THEN** their `signup_completed` event carries that button's `cta` tag, while a direct-visit signup carries none and a garbled cookie value is dropped rather than sent

#### Scenario: A signup from inside another app's browser is visible

- **WHEN** a visitor completes signup from a webview such as the LinkedIn, Instagram, or Facebook in-app browser
- **THEN** `signup_completed` carries `isInAppBrowser` true and the `browserPlatform` that decides whether they could be handed a way out, so the share of signups taking the email-first path is answerable

#### Scenario: A request with no user agent still reports a device

- **WHEN** an event is emitted for a request that sent no user agent header
- **THEN** it carries `platform` `desktop`, `browserPlatform` `other`, and `isInAppBrowser` false, rather than omitting them

#### Scenario: Events segment by plan from day one

- **WHEN** any of the fifteen events is emitted
- **THEN** it carries the user's plan as a property, and the two topic-anchored events carry the topic id, so the funnel can be split by tier without waiting to re-collect history

#### Scenario: An event costs no query of its own

- **WHEN** a route emits an engagement event
- **THEN** the plan and the device properties come from the session and the request already in hand, so no extra read runs on the request path

#### Scenario: A manual scan records the ask, not the outcome

- **WHEN** an owner starts a manual Scan by hand
- **THEN** `scan_requested` is emitted at the request, since the Scan runs for minutes and nothing waits for it, while a scheduled Scan emits nothing because no one asked for it

#### Scenario: Running out of manual scans is recorded as a paywall

- **WHEN** an owner asks for a manual Scan with their daily limit spent and no payment method on file
- **THEN** `scan_quota_reached` is emitted, while an owner whose card on file bills the extra Scan as overage emits `scan_requested` instead, and a caller rejected for authority emits neither

#### Scenario: The first scan fires the activation event once

- **WHEN** a user's first Scan completes, and later a second one completes
- **THEN** `first_scan_completed` is emitted for the first only

#### Scenario: A rating is reported as an occurrence, not as a first

- **WHEN** a user rates a Finding up or down
- **THEN** `finding_rated` is emitted for that user, and clearing a rating emits nothing

#### Scenario: A bookmark is reported once per bookmark

- **WHEN** a user bookmarks a Finding
- **THEN** `finding_bookmarked` is emitted for that user, while removing a bookmark emits nothing and re-bookmarking one they already hold emits nothing

#### Scenario: Reading, unreading, and opening are told apart

- **WHEN** a user marks a Finding read, marks one unread, or opens one
- **THEN** `finding_read`, `finding_unread`, and `finding_opened` are emitted respectively, and an open emits only `finding_opened` even though it also marks the Finding read

#### Scenario: Signup and topic creation are captured

- **WHEN** a user completes signup and then creates a Topic
- **THEN** `signup_completed` and `topic_created` are emitted for that user's id

### Requirement: Visit analytics run in the browser

When the browser analytics key is set, the app SHALL send PostHog one page view per page opened, and a page leave when
that page closes, and nothing else. It SHALL NOT enable autocapture, and SHALL NOT enable session recording, so no
click, keystroke, form value, scroll, or recording is ever collected. The page leave is what gives a session its exit
page and its duration, and collects nothing the page view did not. A page view SHALL include the page's path, its referrer, and what
PostHog's own client reads from the browser, such as the user agent and the screen size. It SHALL NOT include
anything the user typed.

Because the app is one page under a router, a page view SHALL be captured on every route change and not only on the
first load, so a visit that reads four pages reports four views.

A path that holds an identifier SHALL be reported as its route's shape rather than its literal value, so
`/topics/<id>` reports as one page instead of one row per Topic, and no Topic, profile, or invite id is attached to a
visitor who never signed in. That rewrite SHALL run on every event as it is sent, and on both the path and the url,
since the url repeats the path and the page leave is captured by the client rather than by the app.

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

### Requirement: Visit analytics set nothing on the visitor's device

The browser client SHALL run in PostHog's cookieless mode, so it SHALL set no cookie, and SHALL write nothing to
`localStorage` or `sessionStorage`. A visitor SHALL be counted by the daily-salted hash PostHog derives on its own
servers, whose salt is discarded, so no identifier for a visitor is stored anywhere or persists past the day.
The address is hashed into that id and stripped before enrichment runs, so a visit SHALL NOT carry a location
and SHALL NOT be filtered by address, and visit counts SHALL be read as including crawlers.

Because nothing is stored, the app SHALL NOT ask for consent to analytics. Cookieless mode does not by itself stop a
visitor being identified, so the client SHALL also set person profiles to never, which turns any identify call into a
no-op and keeps a persistent id from ever being created. The privacy policy SHALL say that analytics set no cookie,
rather than offering a choice about one.

#### Scenario: A visit stores nothing
- **WHEN** a visitor opens any page with analytics on
- **THEN** no cookie is set, `localStorage` and `sessionStorage` hold no analytics entry, and no consent is asked for

#### Scenario: An identify call cannot create a person
- **WHEN** any code calls identify, by mistake or in a later change
- **THEN** person profiles set to never makes it a no-op, so no persistent id is created

#### Scenario: A visitor is counted without being identified
- **WHEN** two people open the same public page
- **THEN** PostHog counts two visitors from its own daily-salted hash, and neither is identifiable to the app

### Requirement: Visits and accounts stay separate

A page view SHALL NOT be joined to a user account. The browser reports visits with no identity, and the server reports
the product taxonomy keyed to a user, and the two SHALL remain separate populations.

A question that needs both, such as which arrival path converts, SHALL be answered from `signup_completed`'s own `cta`
property rather than by identifying a visitor. Where that is not enough, the answer is to accept the gap rather than
to start storing an identifier.

#### Scenario: A signup does not claim the visits before it
- **WHEN** a visitor reads two public pages and then signs up
- **THEN** the two views stay anonymous, `signup_completed` is keyed to the new user, and nothing joins them

#### Scenario: Attribution still names the button
- **WHEN** a visitor converts from a tagged entry point
- **THEN** `signup_completed` carries its `cta`, which is what answers where the signup came from

