## 1. Shared pieces

- [x] 1.1 Move `toReportedPath` and its route shape tables from `ui/src/lib/visitAnalytics.ts` into a module under `shared/`, import it back into the visit analytics, and keep their tests passing
- [x] 1.2 Add `beforeSendTransaction` to the Sentry init in `shared/monitoring.ts`, running the same `scrubContent` as `beforeSend`, and make both hooks strip any query string from the event's request. Test that a transaction's content-named field, page-sized string, and query string are removed
- [x] 1.3 Replace `tracesSampleRate` with a `tracesSampler` that reads the path from the span's name: zero for the health checks, `/assets/*`, `/docs/*`, and the static files at the site root, a tenth of `SENTRY_TRACES_SAMPLE_RATE` for the three badge polls, and the rate for everything else. Test each tier
- [x] 1.4 Add the event loop delay histogram to `shared/`: `monitorEventLoopDelay` at a 20 ms resolution, a reader for the p99 and the largest in milliseconds, and a reset. Test that a forced 100 ms block reads as roughly 100 ms
- [x] 1.5 Add the minute gauge reporter to `shared/`: one JSON line a minute with the process name, the pool counts, and the delay's p99 and largest, then a reset, with an optional extra section a caller supplies. Its timer is unref'd
- [x] 1.6 Add the threshold alerts to the reporter: a pool with a waiting request, a delay over 200 ms, and a scan backlog older than 15 minutes, each a Sentry warning with its own fingerprint and the tag `alert: performance`, sent at most once an hour per condition per process. Test the throttle, the fingerprints, and that nothing is sent without `SENTRY_DSN`

## 2. Langfuse beside Sentry

- [x] 2.1 Replace the `@opentelemetry/sdk-node` dependency with `@opentelemetry/sdk-trace-node`, which it already installs
- [x] 2.2 In `worker/telemetry.ts`, build a `NodeTracerProvider` with `AlwaysOnSampler` and the `LangfuseSpanProcessor`, hand its tracer to `LangfuseVercelAiSdkIntegration`, point `setLangfuseTracerProvider` at it when Sentry is running and register it globally when not, and flush it on shutdown
- [x] 2.3 Export whether monitoring started from `shared/monitoring.ts`, and start Sentry before Langfuse in `worker/temporal.ts` and `worker/schedule.ts`, as `api/index.ts` already does
- [x] 2.4 Test that with Sentry running the Langfuse provider is isolated and records a span whose parent is unsampled, and that without Sentry it is the global provider
- [x] 2.5 Run a model call locally with Sentry pointed at a local capture server and Langfuse's dev keys, and confirm the call reaches Langfuse and not the captured Sentry envelopes, while the request's transaction does reach them
- [x] 2.6 Leave Sentry's `VercelAI` integration, which records model calls from the AI SDK's `ai:telemetry` diagnostics channel, out of the integrations `startMonitoring` passes, and test that it is off beside Langfuse

## 3. The database

- [x] 3.1 Add the per-request query count to `db/queryTracing.ts`: an `AsyncLocalStorage` store a caller opens around a request with the request's span, and a reader for the count, with a reader for the pool's `totalCount`, `idleCount`, and `waitingCount` in `db/index.ts`
- [x] 3.2 Trace the pool from `db/index.ts`: wrap the `query` method of each client the pool creates, through the pool's `connect` event, with a Sentry span with `op` `db`, `db.system` `postgresql`, and the statement as its name, with no parameter values, and an increment of the open store's count, the span parented to the store's request span and created only inside a store. Bind each checkout's callback to the context of the request that asked for the client, so a request that waited for a client counts its own queries
- [x] 3.3 Test that two concurrent stores keep their own counts while one waits for the other's client, that a query outside any store is not counted, and that each statement inside a database transaction is counted once

## 4. The api

- [x] 4.1 Register the request middleware first in `api/index.ts`: let a request Sentry is not recording through untouched, and for a recorded one open the query count store, await `next()`, then name the active `http.server` span through `updateSpanName` as `<method> <routePath>`, or the page's route shape for the ui's `*` handler, or `(not found)` for a 404 page, set `http.route`, and attach `db.query_count`, the pool counts, and `event_loop.lag`, in a `finally` so a request that throws is still named by its route
- [x] 4.2 Test the names for a nested api route, a parameterized api route, a rendered page, and a 404 page, and that an untraced request passes through untouched
- [x] 4.3 Add stage spans to `buildTopicFeeds` in `api/topic/feeds.ts` (sections, batched feed data, assembly, favicon paths) and to `loadTopicPage` in `api/topic/topics.ts` (visibility gate, parallel reads), each named at its call site, and parent a query's span to the active span if its root is the request's span. Test that a query nests under its stage and never under a model call's span
- [x] 4.4 Add `GET /api/health/deep` beside `/api/health`: `select 1` with a two-second limit, 200 with the latency and the pool counts, 503 on a failure or a timeout, `Cache-Control: no-store`, and no session lookup. Test the 200, the 503, and that `/api/health` still sends no query
- [x] 4.5 Start the minute gauge reporter in the api process
- [x] 4.6 Report a transaction's urls by its route in `beforeSendTransaction`, and drop every field named for a query string and cut every url or path at its `?` in the shared scrub, on the request's headers and in the breadcrumb hook too, and replace an invite link's token in every url and path with `:token`. Test a transaction with a token in its path, its query, and its referer, an error that keeps its path, and an invite token on the page, its referer, and the api routes that read it
- [x] 4.7 Run the api locally with Sentry pointed at a capture server, and confirm each transaction's name, its stage and query spans, its measurements, its urls, and that no query string or path token is in any envelope

## 5. The worker

- [x] 5.1 Replace `countScanQueuePollers` in `worker/temporal-client.ts` with `describeScanQueue`: the poller count, and with `reportStats` the activity backlog's depth and oldest pending age, falling back to `backlogCountHint` with the age unknown, under the existing time limit
- [x] 5.2 In `worker/schedule.ts`, keep the no-poller report and add the backlog report past the 15-minute age limit. Test both against a stubbed describe, and that neither fails the sweep
- [x] 5.3 Start the minute gauge reporter in `worker/temporal.ts` once the workflow bundles are built, with the scan queue's numbers in its line and its backlog threshold, and confirm the one-shot sweep starts no reporter
- [x] 5.4 Run the worker locally against the dev Temporal server, and confirm its line reports the queue's depth and age, and that its first minute does not count building the bundles as a stall

## 6. Web vitals

- [x] 6.1 In `ui/src/lib/visitAnalytics.ts`, initialize with `capture_performance: { web_vitals: true, web_vitals_attribution: false }` and `disable_external_dependency_loading: true`, then import `posthog-js/dist/web-vitals` dynamically after init and start the capture through `posthog.webVitalsAutocapture`
- [x] 6.2 Extend `toReportedEvent` to rewrite every property named for a pathname and every absolute url, at the top level and inside every `$web_vitals_<metric>_event`, which covers `$current_url`, `navigationURL`, and `$prev_pageview_pathname`, and test an event with nested metrics and a previous page's path
- [x] 6.3 In a browser, confirm the web vitals chunk loads from the app's own origin, no script loads from PostHog's asset host, the entry bundle does not include the web vitals code, nothing is written to cookies or storage, and a `$web_vitals` event reports the route's shape at every url

## 7. Docs

- [x] 7.1 Describe the new modules and the deep health check in `shared/AGENTS.md`, `db/AGENTS.md`, `api/AGENTS.md`, and `worker/AGENTS.md`
- [x] 7.2 Note in `.env.example` beside `SENTRY_TRACES_SAMPLE_RATE` that it is raised to 1.0 for the baseline week and set back

## 8. After the deploy

- [ ] 8.1 Confirm in Sentry a transaction per route named by its pattern, with its stage and query spans nested and its measurements present, and confirm the worker's first lines in the Northflank logs, including whether the production Temporal server reports the queue's age
- [ ] 8.2 In Sentry, add the issue alert on the tag `alert: performance`, and metric alerts on the p95 duration of `GET /api/topic-feed` and of the topic page render and on the largest `pool.waiting`, dropping the last if the plan cannot alert on a custom measurement
- [ ] 8.3 Raise `SENTRY_TRACES_SAMPLE_RATE` to 1.0 in Doppler `prd` for seven days
- [ ] 8.4 After the seven days, fill in the in-app baseline table in `design.md` from Sentry, the worker's log lines, and PostHog's web vitals, then set `SENTRY_TRACES_SAMPLE_RATE` back to 0.1
