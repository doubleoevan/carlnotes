# monitoring-analytics Specification

## Purpose
TBD - created by archiving change harden-launch-readiness. Update Purpose after archive.
## Requirements
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

### Requirement: Visit analytics run in the browser

When the browser analytics key is set, the app SHALL send PostHog one page view per page opened, a page leave when
that page closes, the page's web vitals, and the named visit events below, and nothing else. It SHALL NOT enable
autocapture, and SHALL NOT enable session recording, so no keystroke, form value, scroll, or recording is ever
collected, and no click beyond the named ones. The page leave is what gives a session its exit page and its
duration, and collects nothing the page view did not. A page view SHALL include the page's path, its referrer, and
what PostHog's own client reads from the browser, such as the user agent and the screen size. It SHALL NOT include
anything the user typed.

The visit events SHALL have a `visit_` prefix, so no name is shared with a server event, and SHALL be
`visit_topic_viewed`, `visit_episode_played`, `visit_episode_completed`, `visit_finding_clicked` with the source's
host, `visit_cta_clicked` with the same `cta` slug signup uses, `visit_share_clicked` with `kind` and `channel`, and
`visit_podcast_subscribe_clicked`. `topicId` and `episodeId` SHALL be sent only on a public Topic's events. A
profile, invite, team, or private Topic id SHALL never be sent on a visit event, nothing typed SHALL ever be sent,
and every visit event SHALL pass through the same rewrite as the page views.

Because the app is one page under a router, a page view SHALL be captured on every route change and not only on the
first load, so a visit that reads four pages reports four views.

The web vitals SHALL be largest contentful paint, interaction to next paint, cumulative layout shift, and first
contentful paint, captured by PostHog's own web vitals capture with attribution off, so no element selector and no
resource url is sent. The web vitals code SHALL load from the app's own build after the client starts, and no script
SHALL load from PostHog's asset host.

A path that includes an identifier SHALL be reported as its route's shape instead of its literal value, so
`/topics/<id>` reports as one page instead of one row per Topic, and no Topic, profile, or invite id is attached to
a visitor's page view. That rewrite SHALL run on every event as it is sent, and on every path and every url the
event includes, top-level or inside a web vitals metric, including the previous page's path that the client attaches
to a page view and a page leave, since the url repeats the path and the page leave and the web vitals are captured by
the client, not by the app.

No url an event includes SHALL keep its query string or its fragment. Each url SHALL be reported as its origin and
its route-shaped path, top-level or inside a web vitals metric, since a password reset token, an unsubscribe token,
or a consent code can travel in a page's address, and a referrer repeats the address of the page before. The
campaign parameters and click ids that PostHog's client records as properties of their own, such as `utm_source` and
`gclid`, SHALL stay, so attribution is unchanged.

#### Scenario: A visit to a public page is counted
- **WHEN** a signed-out visitor opens a public Topic page
- **THEN** one page view is sent, with the route's shape and the referrer, and no click or input is collected

#### Scenario: Reading several pages reports several views
- **WHEN** a visitor moves from the home page to a Topic and then to a profile without reloading
- **THEN** three page views are sent, one per route change

#### Scenario: An id in the path is not reported
- **WHEN** a visitor opens `/topics/<id>`
- **THEN** the page view reports the route's shape, and the Topic's id appears in no property of the page view

#### Scenario: The page leave is rewritten too
- **WHEN** the visitor leaves `/topics/<id>` and the client sends its own page leave
- **THEN** that event's path and url both report the route's shape, since the rewrite runs on the way out and not at
  the one call the app makes

#### Scenario: Nothing inside the page is captured
- **WHEN** a visitor types into the composer and scrolls
- **THEN** no event is sent for any of it, no session is recorded, and a click sends an event only if it is one of
  the named visit events

#### Scenario: Web vitals report the route's shape
- **WHEN** a visitor opens `/topics/<id>` and the page's web vitals are sent
- **THEN** the event's url and each metric's url report the route's shape, and the Topic's id appears in no property

#### Scenario: Web vitals load from the app
- **WHEN** the analytics client starts
- **THEN** the web vitals code arrives as a chunk from the app's own origin, and no script loads from PostHog's asset
  host

#### Scenario: The previous page's path is rewritten too
- **WHEN** a visitor moves from `/topics/<id>` to a profile, and the client attaches the previous page's path to the
  view
- **THEN** that path reports `/topics/:id`, and the Topic's id appears in no property

#### Scenario: A reset token never reaches PostHog
- **WHEN** a visitor opens the reset password page with `?token=<token>` in its address
- **THEN** every url the page view and the page leave include ends at the page's path, and the token appears in no
  property

#### Scenario: A referrer's query string is dropped
- **WHEN** a visitor arrives from another site whose address has a query string
- **THEN** the page view's referrer is that site's origin and path, with no query string

#### Scenario: Campaign attribution stays
- **WHEN** a visitor arrives from a link with `?utm_source=newsletter&gclid=<id>`
- **THEN** the page view's url has no query string, and `utm_source` and `gclid` arrive as properties of their own

#### Scenario: A public topic's visit events name the topic
- **WHEN** a visitor opens a public Topic's page, plays its latest episode to the end, and clicks a Finding
- **THEN** `visit_topic_viewed` with the `topicId`, `visit_episode_played` and `visit_episode_completed` with the
  `episodeId` and `topicId`, and `visit_finding_clicked` with the source's host are sent, each with its url
  rewritten to the route's shape

#### Scenario: A private topic's visit events have no id
- **WHEN** a signed-in user opens their private Topic's page and clicks a Finding
- **THEN** `visit_topic_viewed` and `visit_finding_clicked` are sent with no `topicId`, and a profile, a team, and an
  invite page send none either

#### Scenario: A tagged button reports its slug
- **WHEN** a visitor clicks the header's Sign up and later the plans page's Sign up
- **THEN** `visit_cta_clicked` is sent twice with `cta` `header` and `pricing`, and `signup_completed` later has
  the one that converted

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

A page view SHALL NOT be joined to a user account. The browser reports visits with no identity, the server reports
the user events keyed to a user, and the server reports bot events keyed to a bot's or an app's name, and the three
SHALL remain separate populations.

A question that needs both, such as which arrival path converts, SHALL be answered from `signup_completed`'s own `cta`
property instead of by identifying a visitor. Where that is not enough, the answer is to accept the gap instead of
storing an identifier.

#### Scenario: A signup does not claim the visits before it
- **WHEN** a visitor reads two public pages and then signs up
- **THEN** the two views stay anonymous, `signup_completed` is keyed to the new user, and nothing joins them

#### Scenario: Attribution still names the button
- **WHEN** a visitor converts from a tagged entry point
- **THEN** `signup_completed` has its `cta`, which is what answers where the signup came from

#### Scenario: A bot's events join nothing
- **WHEN** an AI app calls a tool as a visitor and a user later signs in through that app
- **THEN** the app's `mcp_tool_called` events stay keyed to the app's name with no person, and the user's events are
  keyed to the user, with nothing joining the two

### Requirement: PostHog reports a three-population event taxonomy

When `POSTHOG_API_KEY` is set, the server SHALL emit two populations of events that are never joined to each other or
to a visit: user events, keyed to a user id, and bot events, keyed to a bot's or an app's name. A bot event SHALL be
sent with `$process_person_profile` false, so no person profile is ever created for a bot or an app. The browser's
visit events are the third population, under "Visit analytics run in the browser".

Every server event SHALL have an `entryPoint`: `web` for a browser request, `mcp` for a tool call, `email` for a link
from an email, `feed` for a feed or its audio, `worker` for the scan pipeline, or `webhook` for a payment provider's
call. An event a browser request triggers SHALL have the user's `plan` and the three device properties, `platform`,
`browserPlatform`, and `isInAppBrowser`, read once from the request's own user agent, never from a value the client
sent, and a request with no user agent SHALL read as `desktop`, `other`, and not an in-app browser. An event from an
email's link or a feed SHALL have no plan and no device property, since no session is behind it, and an event from
the worker or a webhook SHALL have the plan the handler already loads and no device property. A topic-anchored
event SHALL have `topicId`, and `isTopicPublic` where the route holds the topic's row. A team-anchored event SHALL
have `teamId`. A route a user waits on SHALL NOT run a database query for an event: a property the route does not
already hold is left off instead of read. The payment webhook reads the plan it replaces, and an AI app's registered
name is read once per app. Properties SHALL be short identifiers, never content, and never an invite token or a
podcast feed token.

The user events SHALL be, by area:

- account and billing: `signup_completed` with `cta` where a tagged button brought the visitor, validated against a
  strict slug shape; `login_completed` with `method` `email` or the provider's name; `account_deleted`;
  `checkout_started` with `checkoutPlan` and `interval`; and from the payment provider's webhook `subscription_started`,
  `plan_changed` with `fromPlan` and `plan`, and `subscription_canceled`
- topics and scans: `topic_created`; `topic_updated` with `isTopicOwner` and `changedFields`, the names of the saved
  fields that differ from the row, never a value; `topic_deleted` with `isTopicOwner`; `topic_edited` for a prompt
  or field edit by a Topic Tool, with `tool` and `origin`; `source_added` and `source_removed` with `sourceType` on
  every path, the form and the tools alike; `attachment_added` with `kind`; `sources_suggested`; `scan_requested`;
  `scan_quota_reached`; `scan_completed` with `trigger`, `findingsKept`, and `status` for every Scan;
  `scan_stopped`; `first_scan_completed`; and `podcast_toggled` with `isEnabled`
- findings: `finding_rated`, `finding_bookmarked`, `finding_unbookmarked`, `finding_read`, `finding_unread`,
  `finding_opened`, and `finding_feedback_sent`
- subscriptions: `topic_subscribed` and `topic_unsubscribed` with `subscriptionSource`, `email_digest_toggled` with
  `isEnabled`, and `email_unsubscribed` from the unsubscribe link
- podcast: `episode_played` and `episode_completed` wherever a play or a finish is counted, in the app or through a
  listener's feed, `podcast_feed_added` on a feed's first fetch by a podcast app, and `podcast_feed_reset`
- chat: `chat_turn_sent` with `chatKind` `topic`, `team`, or `new_topic`, `chat_budget_reached`, and `room_message_sent`
  with `roomKind` `team` or `topic`, `mentionsCarl`, and `hasAttachment`
- teams and invites: `invite_created` and `invite_reused` with `source`, `invite_accepted` and `invite_declined`
  with `kind` (`email`, `username`, or `link`) and `pageKind`, `team_created`, `team_deleted`,
  `team_join_requested`, `team_join_approved`,
  `team_member_removed` with `isSelf`, `team_topic_added`, and `team_topic_removed`
- notes: `note_created`, `note_comment_added`, and `note_thread_resolved`
- trust: `content_flagged` with `kind`

The bot events SHALL be `mcp_connected` with `clientName` when an AI app trades its authorization code for a token,
and never on a refresh;
`mcp_tool_called` with `tool`, `clientName`, `callerKind` `visitor` or `user`, and `outcome` on every MCP tool call;
`crawler_fetched` with `botName`, `routeShape`, and `status` for a known crawler's fetch of an html page, a feed, the
sitemap, or an llms file, and never for an image, an avatar, a favicon, or a built asset; `link_unfurled` with
`botName`, `kind`, and `topicId` for a public Topic when a known unfurler fetches a page or a preview card; and
`feed_fetched` with `client`, `feedKind` `podcast` or `rss`, and `topicId` for a public Topic when a podcast app or a
feed reader pulls a feed. A bot SHALL be classified from a named, tested list of user agent tokens, and an unknown
user agent SHALL emit nothing. The product events a tool emits on a user's behalf stay keyed to the user, with
`entryPoint` `mcp`.

A server event SHALL NOT be a page view, which the browser captures. An event named `first_` SHALL fire only on a
genuine first occurrence established by a count, and an engagement event fires on every occurrence. `topic_updated`
and `topic_deleted` have `isTopicOwner`, so an admin's change to a Topic they do not own stays on the record.

#### Scenario: A change by someone other than the owner is on the record

- **WHEN** an admin edits or deletes a Topic they do not own
- **THEN** the event has their user id and `isTopicOwner` false, so the change is attributable afterwards

#### Scenario: A signup names the button that converted

- **WHEN** a visitor reaches signup from a tagged button and completes signup, on the password or the oauth path
- **THEN** their `signup_completed` event has that button's `cta` tag, while a direct-visit signup has none and a
  garbled cookie value is dropped, not sent

#### Scenario: A signup from inside another app's browser is visible

- **WHEN** a visitor completes signup from a webview such as the LinkedIn, Instagram, or Facebook in-app browser
- **THEN** `signup_completed` has `isInAppBrowser` true and the `browserPlatform` that decides whether they could
  be handed a way out

#### Scenario: A request with no user agent still reports a device

- **WHEN** a request with no user agent header triggers an event
- **THEN** the event reads `desktop`, `other`, and not an in-app browser

#### Scenario: Every event names its entry point and its plan

- **WHEN** a user rates a Finding from the site, from an AI app's tool, or the worker finishes their Scan
- **THEN** the events have `entryPoint` `web`, `mcp`, and `worker` and the user's plan, and the worker's has no
  device property

#### Scenario: A route reads nothing for an event

- **WHEN** a route emits an event
- **THEN** the plan, the device properties, the topic id, the team id, and whether the topic is public come from the
  session, the request, and the rows the route already loaded, and a property the route does not hold is left off

#### Scenario: A login names its method

- **WHEN** a user signs in with a password, and later through Google
- **THEN** `login_completed` fires twice, with `method` `email` and then `google`

#### Scenario: A plan change names both plans

- **WHEN** the payment provider reports a subscription moving from plus to premium
- **THEN** `plan_changed` has `fromPlan` `plus` and `plan` `premium` with `entryPoint` `webhook`, while a new
  subscription emits `subscription_started` and a cancellation `subscription_canceled`

#### Scenario: A source added by a tool and by the form report the same event

- **WHEN** a user adds an rss Source in the topic form, and an AI app adds one with the add-source tool
- **THEN** both emit `source_added` with `sourceType` `rss`, the tool's with `entryPoint` `mcp` and its `origin`, and
  neither emits `topic_edited`

#### Scenario: A topic update names what changed

- **WHEN** an owner saves a Topic with a new name and a new frequency
- **THEN** `topic_updated` has `changedFields` naming those two fields and no value of either

#### Scenario: Every scan reports its completion

- **WHEN** a scheduled Scan finishes with twelve kept Findings
- **THEN** `scan_completed` has `trigger` `scheduled`, `findingsKept` 12, and `status`, and a manual Scan has
  `trigger` `manual`

#### Scenario: A manual scan records the ask, not the outcome

- **WHEN** an owner starts a manual Scan by hand
- **THEN** `scan_requested` is emitted at the request, and `scan_completed` later from the worker

#### Scenario: Running out of manual scans is recorded as a paywall

- **WHEN** an owner asks for a manual Scan with their daily limit spent and no payment method on file
- **THEN** `scan_quota_reached` is emitted, while an owner whose card on file bills the extra Scan as overage emits
  `scan_requested` instead, and a caller rejected for authority emits neither

#### Scenario: The first scan fires the activation event once

- **WHEN** a user's first Scan completes, and later a second one completes
- **THEN** `first_scan_completed` is emitted for the first only

#### Scenario: A rating is reported as an occurrence, not as a first

- **WHEN** a user rates a Finding up or down
- **THEN** `finding_rated` is emitted for that user, and clearing a rating emits nothing

#### Scenario: A bookmark is reported once per bookmark

- **WHEN** a user bookmarks a Finding
- **THEN** `finding_bookmarked` is emitted for that user, while removing a bookmark emits `finding_unbookmarked` once
  and re-bookmarking one they already hold emits nothing

#### Scenario: Reading, unreading, and opening are told apart

- **WHEN** a user marks a Finding read, marks one unread, or opens one
- **THEN** `finding_read`, `finding_unread`, and `finding_opened` are emitted respectively, and an open emits only
  `finding_opened` even though it also marks the Finding read

#### Scenario: A listen is reported where it is counted

- **WHEN** a signed-in listener starts an episode in the app, and a podcast app pulls the same episode's audio
  through their feed
- **THEN** `episode_played` fires twice, with `entryPoint` `web` and then `feed`, and a finish in the app fires
  `episode_completed`

#### Scenario: A feed's first fetch fires once

- **WHEN** a podcast app fetches a listener's feed for the first time, and again an hour later
- **THEN** `podcast_feed_added` fires for the first fetch only, and the feed's token appears in no property

#### Scenario: A room message says what kind of room and whether Carl was asked

- **WHEN** a member posts a message with an attachment that mentions Carl in a Topic's team room
- **THEN** `room_message_sent` has `roomKind` `topic`, `mentionsCarl` true, and `hasAttachment` true

#### Scenario: A team's life is on the record

- **WHEN** a user creates a team, another asks to join, the leader approves, adds a Topic, and the member leaves
- **THEN** `team_created`, `team_join_requested`, `team_join_approved`, `team_topic_added`, and
  `team_member_removed` with `isSelf` true fire in turn, each with the `teamId`

#### Scenario: An MCP tool call is keyed to the app

- **WHEN** a visitor's AI app calls `read_topic_feed` and a user's AI app calls `rate_finding`
- **THEN** `mcp_tool_called` fires twice, keyed to each app's `clientName` with `callerKind` `visitor` and `user`
  and `$process_person_profile` false, and the user's `finding_rated` fires keyed to the user with `entryPoint` `mcp`

#### Scenario: A crawler's fetch creates no person

- **WHEN** Googlebot fetches a public Topic's page, the sitemap, and the page's favicon
- **THEN** `crawler_fetched` fires for the page and the sitemap with `botName`, `routeShape`, and `status`, nothing
  fires for the favicon, and no person profile is created

#### Scenario: An unfurler and a feed reader are told apart from a crawler

- **WHEN** Slackbot fetches a public Topic's preview card and Overcast pulls that Topic's podcast feed
- **THEN** `link_unfurled` fires with `botName` `slack`, `kind` `topic`, and the `topicId`, and `feed_fetched`
  fires with `client` `overcast`, `feedKind` `podcast`, and the `topicId`

#### Scenario: An unknown user agent emits nothing

- **WHEN** a request arrives with a user agent on no list
- **THEN** no bot event fires, and a user's own events are unaffected

#### Scenario: Signup and topic creation are captured

- **WHEN** a user completes signup and then creates a Topic
- **THEN** `signup_completed` and `topic_created` are emitted for that user's id

