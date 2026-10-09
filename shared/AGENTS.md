# shared/

What every module may import, and the reason the boundary holds: `contracts.ts` is the zod request and response shapes
that the api validates with and the ui parses against, `enums.ts` and `plans.ts` hold the values that both sides
compare, `sources.ts` defines the Sources that an ingester reads, `seo.ts` builds topic slugs and paths, meta
descriptions, and the site's structured data, `podcastEpisodes.ts` holds the podcast episode settings, a cover's key and
path, the show's and the hosts' names, and a turn's transcript text, and `appUrl.ts` reads the app's base url from
`BETTER_AUTH_URL` for server code: `appUrl()` falls back to the local dev server, and `appBaseUrl()` is undefined if
unset, for the emails and notifications that skip without a link.

`monitoring.ts` starts Sentry in the api and the worker and defines what tracing reads and writes: the traces sampler,
a request's transaction name and measurements, the stage and query spans, the send-time scrub, and the threshold
warnings. `runtimeGauges.ts` logs a long-running process's connection pool and event loop delay once a minute, reading
the delay from the histogram in `eventLoopDelay.ts`. Each line's `instance` field names the replica by its host name,
so the replicas' lines can be told apart.
`reportedPath.ts` names a page by its route's shape, for PostHog's page views and Sentry's page renders alike.
`analytics.ts` holds the three kinds of event, the user events keyed to a user, the bot events keyed to a bot's or an
app's name, and the names of the browser's visit events, and `userAgent.ts` reads a request's device properties and
names a known crawler, unfurler, podcast app, or feed reader from a token list.

- This module imports nothing app-level. It may not reach into `ui`, `api`, `worker`, or `db`, which
  is what lets all four depend on it.
- A shape both sides need lives here once. A shape only one module reads stays in that module.
- `contracts.ts` exports each payload's zod schema; the api validates with it through `zValidator`
  and the ui parses responses with it, so a drifted field fails at the boundary instead of silently.
- Nothing here touches the database or the DOM, and only the monitoring and analytics clients reach the network: the
  rest are values and their shapes.
- Tests: `bun test shared`.
