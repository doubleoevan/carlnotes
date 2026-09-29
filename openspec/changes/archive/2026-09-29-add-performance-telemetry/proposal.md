## Why

The performance work ahead (the connection pool's size, caching the feed, moving sessions out of Postgres) needs numbers to aim at and to check itself against. Sentry's Bun integration already sends a transaction for one request in ten, but names each one by its url. Sentry's clustering folds some ids into `*` and leaves others, such as a user id in `GET /api/avatars/<id>`, every bot probe gets its own name, and the raw query string is sent too, which is where password reset tokens, unsubscribe tokens, and consent codes travel. Inside a transaction only Better Auth's session lookup has spans. The app's own queries and stages have none, and nothing records the pool, the event loop, or the scan queue. Northflank shows CPU and memory, Neon shows connections, and Temporal shows workflows, but nothing joins a slow request to what slowed it.

## What Changes

- Every request's transaction is named by its route pattern, such as `GET /api/topics/:id`, instead of its url. A page the ui renders is named by the page's route shape, such as `GET /topics/:id/:slug`, the same shape the visit analytics already report, and a page the ui responds to with a 404 is named `GET (not found)`.
- No query string reaches Sentry, and a request's url is reported by its pattern, on transactions and on errors alike.
- Health checks, built assets, the docs site, and the static files at the site root are not traced. The three badge polls, which were 60% of the sampled transactions in the last two weeks, are sampled at a tenth of the rate.
- The feed build in `api/topic/feeds.ts` and the topic page load in `api/topic/topics.ts` get spans around their stages, and every database query gets its own span with its SQL statement and no parameter values, so a slow request shows where its time went.
- Each transaction includes measurements: the queries the request sent, the connection pool's `totalCount`, `idleCount`, and `waitingCount`, and the event loop's recent lag. A waiting count above zero means a request waited for a connection.
- The worker logs the same gauges once a minute, together with the scan queue's backlog depth and the age of its oldest pending task. The scheduled sweep reads the backlog beside its existing check that something is polling the scan queue.
- Alerting uses Sentry: a warning event for a pool with waiting requests, a lagging event loop, or a scan backlog past its age limit, plus metric alert rules on route latency and the pool's waiting count.
- Web vitals: the browser's PostHog client captures largest contentful paint, interaction to next paint, cumulative layout shift, and first contentful paint. It stays cookieless, with no autocapture, no recording, and no attribution. The web vitals code loads from the app's own build after startup, and the path rewrite covers the urls inside each web vitals event.
- A deep health check at `GET /api/health/deep` runs one trivial query and returns its latency and the pool gauges. The shallow `/api/health` stays query-free, since the platform restarts the container on it.
- The design records a baseline: route latency, queries per request, the pool's waiting count, event loop lag, and scan queue depth. The outside-in numbers, the query counts, and the server-side durations of Sentry's existing transactions are recorded now. The pool, the event loop, and the queue are recorded after this change deploys and before any later performance change ships.
- Model calls made in the api reach Langfuse again. The api starts Sentry first, so Sentry has had the global tracer provider there, and a chat reply's or an MCP search's model calls went to Sentry instead of Langfuse. Langfuse gets its own provider beside Sentry's, with a sampler that records every call whatever Sentry samples, so Langfuse keeps every model call's cost. The worker starts in the same order as the api, so both processes work the same way.
- No new vendor and no new dependency. Sentry, PostHog, and the Temporal client are already installed, and `@opentelemetry/sdk-trace-node`, already installed under `@opentelemetry/sdk-node`, replaces it as the direct dependency. Without their keys every measurement stays off, the way error reporting does now.

## Capabilities

### New Capabilities

- `performance-telemetry`: request transactions and their names, spans on the feed build, the topic page load, and database queries, the per-request measurements, the event loop lag sampler, the worker's minute log, the scan queue's backlog reading, the alert conditions, and the recorded baseline.

### Modified Capabilities

- `monitoring-analytics`: sampled tracing skips health checks and static files and samples the badge polls at a tenth of the rate. The send-time scrub covers transactions as well as errors and drops every query string. The visit analytics send web vitals, with the path rewrite applied to every url the event includes.
- `deploy-mechanics`: adds the deep health check beside the shallow one, which stays query-free.
- `observability`: model calls reach Langfuse in the api as well as the worker, recorded whatever Sentry samples, and Langfuse's spans never reach Sentry.

## Impact

- **api:** `api/index.ts` gets the request transaction middleware and `/api/health/deep`. `api/topic/feeds.ts` and `api/topic/topics.ts` get stage spans.
- **db:** `db/index.ts` instruments each query with a span and a per-request count, and exposes the pool gauges.
- **shared:** `shared/monitoring.ts` gets the request transaction helpers, the transaction scrub, the traces sampler, and the event loop lag sampler. The route shape rule moves from `ui/src/lib/visitAnalytics.ts` into `shared/`, so page transactions and page views name a page the same way.
- **worker:** `worker/telemetry.ts` gives Langfuse its own tracer provider, and the worker starts Sentry before Langfuse, as the api does. `worker/temporal-client.ts` reads the scan queue's stats beside its pollers. `worker/schedule.ts` reports a backlog past its limit. `worker/temporal.ts` logs the gauges once a minute.
- **ui:** `ui/src/lib/visitAnalytics.ts` turns on web vitals and extends the rewrite. The web vitals code loads as its own chunk after startup, so the entry bundle does not grow.
- **Sentry quota:** a sampled transaction now includes one span per query, so ten to twenty-five spans each. Sampling the badge polls at a tenth, and not tracing static files, cuts the transaction count by more than half, which pays for the added spans.
- **Manual setup:** Sentry metric alert rules, and a raised trace sample rate in `prd` while the baseline is measured, both configured outside the code.
