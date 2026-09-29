## Context

Three vendors are already wired, and none of them measures a request.

- **Sentry** (`@sentry/bun` 10.69) starts in `shared/monitoring.ts` for the api and the worker, only in `prd` and only with `SENTRY_DSN`, with `tracesSampleRate` 0.1 that `SENTRY_TRACES_SAMPLE_RATE` overrides. Its Bun server integration already opens an `http.server` transaction per sampled request, named `<method> <pathname>` with source `url`. In the last 14 days Sentry recorded about 150,000 of them. Sentry's clustering folded some ids into `*` and left others, such as `GET /api/avatars/<a user id>`. Bot probes such as `/wp-admin/install.php` each got a name. The integration records the raw query string as `url.query` and on the event's request, and the query string is where password reset tokens, unsubscribe tokens, and MCP consent codes travel. The only child spans are Better Auth's own OpenTelemetry spans for the session lookup and its two reads. The three badge polls, `/api/rooms/mention-count`, `/api/note-badges`, and `/api/invites/topics/pending`, were about 60% of all transactions. `beforeSend` scrubs errors, and nothing scrubs transactions.
- **Langfuse** traces model calls per Scan, which this change leaves alone.
- **PostHog** counts page views from the browser in `ui/src/lib/visitAnalytics.ts`: cookieless, person profiles never, no autocapture, no recording. Its `before_send` rewrites each event's path and url to the route's shape, so no id leaves the browser.

The database client is one `@neondatabase/serverless` `Pool` per process in `db/index.ts`, with no `max`, so node-postgres' default of ten connections applies. The pool exposes `totalCount`, `idleCount`, and `waitingCount`. Drizzle sends every query through `client.query`. The scan queue is the Temporal task queue `topic-scans`, and `countScanQueuePollers` in `worker/temporal-client.ts` already describes it, from the scheduled sweep in `worker/schedule.ts`, to alert when nothing polls it. Production runs that sweep as a cron, and the long-running worker service is `worker/temporal.ts`.

## Goals / Non-Goals

**Goals:**
- A latency for every api route and every page the server renders, named by pattern, so percentiles group.
- Inside a slow request, the stage and the query that took the time.
- The connection pool's pressure, the event loop's lag, and the scan queue's depth, visible over time and joined to the requests they slow.
- Web vitals from real browsers, to see what the TanStack Start move did to largest contentful paint and interaction latency.
- A health check that proves the database responds, beside the one that proves the process does.
- A recorded baseline that later performance changes are measured against.

**Non-Goals:**
- Any performance fix. The pool size, caching, and sessions out of Postgres are separate changes, measured against this baseline.
- A new vendor, a new dependency, or an OpenTelemetry pipeline.
- Tracing the browser with Sentry. PostHog's web vitals cover the browser side.
- Autocapture, session recording, or any change to the visit analytics' privacy rules.

## Decisions

**A Hono middleware completes the transaction the Bun integration opens.** The integration's `http.server` span is already active when Hono runs, so a middleware registered first in `api/index.ts` reads it with `Sentry.getActiveSpan()` and `getRootSpan`, opens the request's query count, awaits the rest of the chain, and then renames the span and attaches the measurements. The send hook reports the transaction's urls by the same route. Opening a second, forced transaction instead would nest one transaction in another. The `honoIntegration` that `@sentry/bun` re-exports from `@sentry/node` depends on Node's module patching and Node's http server, which Bun's server does not use. A request Sentry is not recording, and every request without `SENTRY_DSN`, runs through the middleware with nothing counted, so the self-host path is unchanged.

**A transaction is named by the pattern of the handler that responded.** Hono's `routePath(context)` read after `await next()` returns the registered path of the last handler that ran, such as `/api/topic-feed` or `/api/topics/:id`, including the sub-app's prefix. The ui's server handler is registered as `*`, so every page would share one name. For that handler the name is the page's route shape instead, such as `/topics/:id/:slug`, from the same rule the visit analytics use. That rule, `toReportedPath` and its shape tables, moves from `ui/src/lib/visitAnalytics.ts` into `shared/`, so a page view in PostHog and a page render in Sentry name a page the same way. A page the ui responds to with a 404 is named `(not found)`, so a bot's probes share one name. Sentry's default `Http.ServerSpans` integration also drops a transaction whose response is 401 to 404 or a redirect, so today those probes are not sent at all, and the name keeps them grouped if that default changes. The name is `<method> <pattern>`, set through `updateSpanName`, and the pattern is also set as `http.route`.

**A traces sampler decides by path.** The integration names a span by its path before anything else runs, so `tracesSampler` reads the path from that name. It returns zero for `/api/health`, `/api/health/deep`, `/assets/*`, `/docs/*`, and the static files at the site root, a tenth of the configured rate for the three badge polls, and the configured rate for everything else. The rate stays `SENTRY_TRACES_SAMPLE_RATE`, so the existing spec's "configurable without a code change" still applies. The polls are frequent and uniform, so a tenth of their samples still gives thousands a week, and the saving pays for the query spans every other transaction gains.

**No query string reaches Sentry, and a transaction's urls are its route's.** `scrubContent`, which `beforeSend` and `beforeSendTransaction` both run, drops every field named for a query string (`url.query`, `http.query`, `query_string`) and cuts every url or path at its `?` or its `#`, on the trace, on each span, on the request, and on the request's headers. The referer header needs this: a call from the reset password page includes `/reset-password?token=…` as its referer. The breadcrumb hook runs the same cut, since an outgoing request's breadcrumb records its query as `http.query`. `scrubTransaction` then replaces the path in the transaction's `url.full`, `url`, `url.path`, and request url with the route the middleware saved as `http.route`, so an id or a token in a path, such as an invite's, never reaches a transaction. The rewrite happens on the outgoing event because Sentry derives `url` and `http.query` from `url.full` when the span is exported, after the middleware has run. An error keeps its request's path, since the path is what makes an error debuggable, and only its query strings go, along with an invite link's token: the scrub replaces the token in `/invite/<token>` and in the api routes that read the link with `:token`, on every url and path it visits, since that token is a key to the invite. A Topic's or a user's id stays. Sentry's default filters mask a query parameter named like `token`, but the integration's `url.query` attribute is not filtered, and `consent_code` matches no filter at all.

**Each query gets a span and a per-request count, from one wrapper in `db/`.** `db/queryTracing.ts` wraps the `query` method of each client the pool creates, through the pool's `connect` event, so a query inside a transaction is covered too, and every query is counted exactly once. The span is `op: "db"` with `db.system: "postgresql"`, named by the statement Drizzle built. Drizzle sends values as parameters, so the statement includes placeholders and never a value, and the span never includes the parameters. The count lives in an `AsyncLocalStorage` store that the request middleware opens, together with the request's span, so a query outside a request, such as the worker's, is neither counted nor traced, each query span stays in the request's trace, under the stage that sent it, and the database module does not import the api. A full pool completes a waiting checkout from inside the request that releases a client, so without help a waiting request's queries would count toward the request that released the client. The wrapper binds each checkout's callback to the context of the request that asked for the client, which keeps each count and each span with its own request exactly when requests are waiting for a connection. Instrumenting at Drizzle's level was rejected: its logger reports a statement with no timing, and wrapping each call site would miss the ones not wrapped.

**The feed build and the topic page load get one span per stage.** `buildTopicFeeds` in `api/topic/feeds.ts` becomes `topic_feed.build` with child spans for reading the sections, loading the batched feed data, assembling each feed in memory, and reading favicon paths. `loadTopicPage` in `api/topic/topics.ts` becomes `topic_page.load` with child spans for the visibility gate and the page's parallel reads. The query spans nest under whichever stage sent them, so a slow stage shows its queries.

**Measurements go on the transaction when it ends.** `Sentry.setMeasurement` on the transaction records `db.query_count`, `pool.total`, `pool.idle`, `pool.waiting`, and `event_loop.lag` in milliseconds. Sentry can query a measurement and alert on it per route, which is how a slow `GET /api/topic-feed` joins the pool state it ran under. Only sampled requests have them, so the minute log below is the continuous record.

**Event loop lag comes from `monitorEventLoopDelay`.** Node's `perf_hooks.monitorEventLoopDelay` histogram works in Bun 1.3.14, the version the image runs: a 100 ms block measured as 98 ms. One histogram per process, at a 20 ms resolution, records every delay. A transaction's `event_loop.lag` is the histogram's p99 over the current minute, and the minute reporter reads the p99 and the largest, then resets it. A timer's drift was the fallback, and is coarser and costs a timer of its own. The event loop utilization that Sentry's `bunRuntimeMetricsIntegration` reports is a different number, the busy fraction, and does not show a single long stall.

**Both long-running processes log their gauges once a minute.** A shared reporter writes one JSON line a minute: the process name, the pool's three counts, and the event loop lag's p99 and largest values. The worker's line adds the scan queue: pollers, backlog depth, and the oldest pending task's age. The api runs the same reporter, since its pool is the one web traffic can exhaust, and a transaction only samples it at 10%. The reporter's timer is unref'd, and the cron sweep does not start one. A log line needs no quota and no setup. Sentry's `metrics.gauge`, on by default in this SDK version, could send the same numbers to a chart, and would be the next step if the logs prove too hard to read. It stays out of this change to keep a single new data type in Sentry.

**The scan queue's stats come from the same describe call as its pollers.** `countScanQueuePollers` becomes `describeScanQueue`, returning the poller count, the backlog depth, and the oldest pending task's age for the queue's activity tasks, which wait for one of the worker's eight scan slots. It asks with `reportStats`, which returns `approximateBacklogCount` and `approximateBacklogAge` on current servers. The production Temporal server's version is not in the repo, so an older server's missing `stats` falls back to the legacy `backlogCountHint`, with the age reported as unknown. The same timeout as today guards the call. The scheduled sweep keeps its no-poller report and adds a backlog report.

**Alerting uses Sentry, from two sides.** In code, the minute reporter and the sweep send a warning event, one issue per condition through a fixed fingerprint, while a condition is true: the pool has a waiting request, the event loop lagged over 200 ms in the minute, or the scan backlog's oldest task has waited over 15 minutes. Each condition is sent at most once an hour per process. Each event is tagged `alert: performance`, and an issue alert rule on that tag emails it, since Sentry's default rule only notifies for issues it rates high priority, which a warning often is not. In Sentry, metric alert rules watch the p95 duration of `GET /api/topic-feed` and of the topic page, and the largest `pool.waiting` measurement. The issue rule and the metric rules are configured by hand in Sentry and listed in the tasks. The 15 minutes sits far inside the stale-scan limit of 171 minutes, so a backlog alerts long before the reaper starts failing waiting Scans.

**Web vitals load from the app's own build after startup.** The client is initialized with `capture_performance: { web_vitals: true, web_vitals_attribution: false }` and `disable_external_dependency_loading: true`. After init, a dynamic `import("posthog-js/dist/web-vitals")` registers the callbacks and calls `posthog.webVitalsAutocapture.startIfEnabled()`. The chunk is 10 KB, about 4 KB gzipped, and never enters the entry bundle, which grows by about half a kilobyte gzipped for the import and the path rewrite. No script loads from PostHog's asset host. The client still fetches its remote config there as JSON, as it did before this change. Largest contentful paint, first contentful paint, and cumulative layout shift observers read buffered entries, so starting after init loses none of them. PostHog documents web vitals as supported in cookieless mode, where the nested metric payloads omit the session ids.

**The path rewrite reaches every path and url an event includes.** A `$web_vitals` event includes the page url at its top level and again in each `$web_vitals_<metric>_event` object, as `$current_url` and `navigationURL`, and a page view or a page leave includes the previous page's path as `$prev_pageview_pathname`. `toReportedEvent` rewrites every property named for a pathname and every absolute url, at the top level and inside each metric, so a property the client adds later is covered without a list to keep. Attribution stays off, since it would add the element's CSS selector and the url of the largest image, which can be an avatar or a card with an id in it. A local run of the built ui confirmed it: the `$web_vitals` event carried FCP and LCP with every url at `/topics/:id/:slug`, and the topic's id appeared in no event.

**The deep health check is its own route and responds 503 when the database does not.** `GET /api/health/deep` runs `select 1` with a two-second limit and returns `{ status, databaseLatencyMs, pool }`, where `pool` has `totalCount`, `idleCount`, and `waitingCount`. It is registered beside `/api/health`, ahead of the api tree, so no session lookup runs, and it is sent with `Cache-Control: no-store`. It is public: it reveals only counts, and a trivial query costs less than any page. An external monitor can poll it to learn that the database responds, while the platform keeps restarting on the shallow check alone.

**The scrub runs on transactions too.** `beforeSendTransaction` applies the same `scrubContent` as `beforeSend`, so a span's attached data is filtered by field name and length the way an error's is. Query spans name their statement and include no parameters. A stage span has no data of its own.

**Langfuse gets its own tracer provider beside Sentry's.** The api starts Sentry before Langfuse, so Sentry registered the global tracer provider there, Langfuse's `NodeSDK` lost the registration, and the AI SDK spans of a chat reply or an MCP search went to Sentry instead of Langfuse. Sentry recorded them as child spans, such as `embeddings embed-model`. Sentry also records model calls by a second path: its `VercelAI` integration, on by default, subscribes to the AI SDK's `ai:telemetry` diagnostics channel and records each call as a span of its own, with no patch to the `ai` package. `startMonitoring` leaves that integration out, so model calls are traced in Langfuse alone. The worker started Langfuse first, so scan traces were fine there, and Sentry's context manager was the one that lost. `worker/telemetry.ts` now builds a `NodeTracerProvider` from `@opentelemetry/sdk-trace-node` with the `LangfuseSpanProcessor`, and hands its tracer to the AI SDK integration. When Sentry is running, the provider stays off the global slot and `setLangfuseTracerProvider` points Langfuse's own observations at it, while Sentry keeps the global provider and its context manager. When Sentry is not running, the provider registers itself globally, as the `NodeSDK` did, so dev and self-host behave as before. Both processes start Sentry first, so the choice is the same in each.

Two details keep Langfuse whole. The providers share OpenTelemetry's context, so a model call's span has the request's span as its parent, and a provider's default sampler follows the parent's decision, which would drop nine calls in ten under Sentry's 10% rate. The Langfuse provider uses `AlwaysOnSampler`, so every model call is recorded. In the other direction, a query span must never be parented to a Langfuse span that Sentry never sees, such as a model call's while Carl's tool reads the database. The query wrapper parents each query span to the active span only if that span's root is the request's span that its count store keeps, which a stage span's is, and to the request's span otherwise. Joining Langfuse's processor to Sentry's provider through `openTelemetrySpanProcessors` was rejected, since Sentry's sampler would then decide which model calls Langfuse sees.

## Baseline

Every later performance change is measured against these numbers. They are recorded before any of those changes ships.

**Outside in, measured 2026-09-29 03:50 UTC** from a Mac on residential broadband, as a signed-out visitor: 30 sequential requests per path against production, time to the first byte and to the last, in milliseconds. `/api/health` does no work, so its time is the network floor to subtract.

| Path | First byte p50 | First byte p95 | Total p50 | Total p95 |
|---|---|---|---|---|
| `/api/health` | 43 | 49 | 43 | 49 |
| `/api/topic-feed` | 188 | 408 | 212 | 463 |
| `/api/topics/:id` | 151 | 162 | 151 | 166 |
| `/topics/:id/:slug` (server-rendered) | 185 | 272 | 196 | 272 |
| `/` (server-rendered) | 260 | 350 | 294 | 375 |

**Server side, from the transactions Sentry already records**, split at the TanStack Start deploy at about 03:20 UTC on 2026-09-29. Durations are the `http.server` span's, in milliseconds, under Sentry's clustered names. The requests after the deploy include the outside-in measurement above.

| Transaction | Before, 14 days: samples, p50, p95 | After, 12 hours: samples, p50, p95 |
|---|---|---|
| `GET /api/topic-feed` | 630, 303, 478 | 120, 199, 314 |
| `GET /api/topics/*` | 510, 315, 422 | 110, 114, 567 |
| `GET /topics/*` | 290, 195, 320 | not yet sampled under the new route |
| `GET /` | 720, 3, 7 (the static shell) | 40, 214, 279 (rendered on the server) |
| `GET /api/rooms/mention-count` | 31,410, 156, 202 | 110, 162, 210 |
| `GET /api/note-badges` | 30,940, 260, 314 | 70, 291, 310 |
| `GET /api/topic-findings/*/link-preview` | 19,300 in the 14 days | 590, 1,414, 2,574 |

**Queries per call, measured 2026-09-29** against the dev database by counting what the pool sent on a second, warm call:

| Call | Queries |
|---|---|
| `buildTopicFeeds`, visitor | 10 |
| `buildTopicFeeds`, signed in | 16 |
| `loadTopicPage`, visitor | 10 |
| `loadTopicPage`, signed in | 24 |

A signed-in request adds the session read and the quota reads the route makes around these calls.

**In app, recorded once this change is live and before any later performance change ships:** the trace sample rate in `prd` is raised to 1.0 for seven days, since prelaunch traffic is small, and then set back. From that week the table below is filled in, and the rate goes back to 0.1.

| Measure | Value |
|---|---|
| `GET /api/topic-feed` p50 and p95, visitor and signed in | to record |
| topic page render p50 and p95 | to record |
| `GET /api/topics/:id` p50 and p95 | to record |
| `db.query_count` per route, median and largest | to record |
| `pool.waiting`, largest, and the share of requests above zero | to record |
| event loop lag, p95 of the minute maximums, and the largest | to record |
| scan queue backlog, largest depth and oldest age, from the worker's lines | to record |
| largest contentful paint and interaction to next paint p75, from PostHog | to record |

## Risks / Trade-offs

- **A sampled transaction now has 10 to 25 query spans.** → Sentry recorded about 150,000 transactions and 710,000 child spans in the last 14 days, 60% of the transactions from the three badge polls, which are one or two queries each. Sampling the polls at a tenth and dropping static files removes more than half of the transactions, and the rest gain their query spans. During the week at 1.0 the polls run at 0.1, today's rate, so the week adds the feed and page traffic at full rate and nothing else.
- **A span per query adds overhead to every query.** → Without `SENTRY_DSN` the span does nothing, and in production an unsampled request records no span data. The overhead is one wrapper call and one counter per query.
- **`routePath` after `next()` depends on Hono keeping the last handler's index.** → A test asserts the name for a nested api route, a parameterized route, and a page, so an upgrade that changes it fails the suite.
- **The production Temporal server may not return `reportStats`.** → Depth falls back to `backlogCountHint`, and the age reads as unknown, instead of failing the sweep.
- **The lag histogram is per process and reset each minute.** → A transaction's lag describes the minute it ran in, not its own instant, which is enough to tell a stalled process from a slow query.
- **Web vitals add an event per page view.** → They double PostHog's event count at most. The rewrite covers them, and the tests cover the nested urls.
- **The in-app baseline needs a week of traffic.** → The outside-in numbers and the query counts are recorded now, so a change that ships sooner still has a comparison.

## Migration Plan

Deploy as one change. Nothing migrates, and no new environment variable is required. After the deploy: raise `SENTRY_TRACES_SAMPLE_RATE` to `1.0` in Doppler `prd`, configure the Sentry alert rules, and after seven days record the baseline and set the rate back to `0.1`. To roll back, revert the change. The middleware, the query wrapper, and the reporter have no state to undo.

## Open Questions

- The production Temporal server's version, which decides whether the queue's age is reported or unknown. The first worker log line after the deploy shows which.
- Whether Sentry's metric alerts can watch a custom measurement on this account's plan. If not, the minute reporter's pool warning is the alert, and the rule is dropped.
