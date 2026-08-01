## ADDED Requirements

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

### Requirement: PostHog carries a signup-and-activation event taxonomy only

When `POSTHOG_API_KEY` is set, the app SHALL emit exactly eleven server-side events keyed to the user: the funnel `signup_completed`, `topic_created`, and `first_scan_completed`; the owner-intent pair `scan_requested` and `scan_quota_reached`; and the engagement set `finding_rated`, `finding_bookmarked`, `finding_unbookmarked`, `finding_read`, `finding_unread`, and `finding_opened`. The taxonomy SHALL stay at these eleven until a real post-launch question motivates another, and SHALL NOT include session recording or client-side autocapture.

An event named `first_` SHALL fire only on the user's genuine first occurrence, established by a count check. `first_scan_completed` qualifies, because a Scan carries its owner and is countable. An engagement event does not: `findings.rating` is topic-scoped with no per-user row to count. So the engagement set fires on every occurrence and analytics derives the first one. No event SHALL claim "first" that the data cannot establish.

Every event SHALL carry the user's `plan` as a property, and every topic-anchored event SHALL also carry the `topicId`, because event history cannot be backfilled. A question about plan-segmented activation is only answerable from the day the property started riding along. Properties SHALL be short identifiers only, never content.

Every event a browser request triggers SHALL also carry a `platform` property of `mobile` or `desktop`, read from that request's user agent, so the funnel is answerable by device. `first_scan_completed` SHALL NOT carry one: a scheduled Scan runs in the worker with no request and no device behind it, and a guessed value would read as real.

The `plan` and `platform` an event carries SHALL be read from the session and the request at the route, and passed down to the service function that emits the event. An event SHALL NOT cost a database query of its own, and a service function SHALL NOT need to guard the emit, since emitting already swallows its own failures.

`signup_completed` SHALL also carry a `cta` property naming the button that brought the converting visitor, when one did: each signup entry point tags its link, the signup page keeps the tag in a short-lived cookie so it survives the oauth round-trip, and the server validates the tag against a strict slug shape before attaching it — a direct visit simply carries no `cta`. This is conversion attribution only: which clicks are made and abandoned SHALL NOT be tracked, since that would require client-side analytics, which stays excluded.

#### Scenario: A signup names the button that converted

- **WHEN** a visitor reaches signup from a tagged button and completes signup, on the password or the oauth path
- **THEN** their `signup_completed` event carries that button's `cta` tag, while a direct-visit signup carries none and a garbled cookie value is dropped rather than sent

#### Scenario: Events segment by plan from day one

- **WHEN** any of the eleven events is emitted
- **THEN** it carries the user's plan as a property, and the two topic-anchored events carry the topic id, so the funnel can be split by tier without waiting to re-collect history

#### Scenario: An event costs no query of its own

- **WHEN** a route emits an engagement event
- **THEN** the plan and platform come from the session and the request already in hand, so no extra read runs on the request path

#### Scenario: A manual scan records the ask, not the outcome

- **WHEN** an owner starts a manual Scan by hand
- **THEN** `scan_requested` is emitted at the request, since the Scan runs for minutes and nothing waits for it, while a scheduled Scan emits nothing because no one asked for it

#### Scenario: Running out of manual scans is recorded as a paywall

- **WHEN** an owner asks for a manual Scan with their daily limit spent and no payment method on file
- **THEN** `scan_quota_reached` is emitted, while an owner whose card on file bills the extra Scan as overage emits `scan_requested` instead, and a caller refused for authority emits neither

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

### Requirement: An external uptime monitor pings the public health endpoint

An uptime monitor outside the deployment SHALL poll the public `/api/health` endpoint and alert on failure. The endpoint SHALL stay reachable without a session and without a database read, so the monitor measures process reachability.

#### Scenario: A down instance alerts

- **WHEN** the app stops answering `/api/health`
- **THEN** the external monitor alerts, without any in-app scheduling or state

### Requirement: Self-host ships with zero telemetry

Sentry and PostHog SHALL activate only when their keys are set. With `SENTRY_DSN` and `POSTHOG_API_KEY` unset, no client SHALL initialize, no network call SHALL be made to either service, and behavior SHALL be identical to a build without them. Telemetry failures SHALL never fail a request, a Scan, or a process, and pending events SHALL be flushed before a short-lived process exits.

#### Scenario: No keys means no telemetry

- **WHEN** the app runs with neither key set
- **THEN** no Sentry or PostHog client is created, no request goes to either, and every output is unchanged

#### Scenario: A telemetry failure does not fail the work

- **WHEN** an event send or flush fails
- **THEN** the failure is logged and the request or Scan finishes with the outcome it earned
