# shared/

What every module may import, and the reason the boundary holds: `contracts/` is the zod response shapes and the
constants that the api validates with and the ui parses against, one module per domain (`chat.ts`, `teams.ts`,
`invites.ts`, `activity.ts`, `profiles.ts`, `admin.ts`, `search.ts`, `findings.ts`, `podcast.ts`,
`podcastEpisodePage.ts`, `topics.ts`, `notes.ts`, `pageHead.ts`, and `signupCta.ts`), imported by its own path,
`payloads.ts` is the request payload schemas the api validates with `zValidator` and the types inferred from them, with
the topic ones in `topicPayloads.ts`, `enums.ts` and `plans.ts` hold the values that both sides compare, `sources.ts`
defines the Sources that an ingester reads, `seo.ts` builds topic slugs and paths, meta descriptions, and the site's
structured data, `podcastEpisodes.ts` holds the podcast episode settings, a cover's key and path, the show's and the
hosts' names, and a turn's transcript text, and `appUrl.ts` reads the app's base url from `BETTER_AUTH_URL` for server
code: `appUrl()` falls back to the local dev server, and `appBaseUrl()` is undefined if unset, for the emails and
notifications that skip without a link.

`monitoring.ts` starts Sentry in the api and the worker and defines what tracing reads and writes: the traces sampler, a
request's transaction name and measurements, the stage and query spans, and the threshold warnings. The send-time scrub
every outgoing event passes is `scrubContent` and `scrubTransaction` in `monitoringScrub.ts`. `reportError` sends one
stage's one error ten times an hour and skips the rest, and the next hour's first report says how many were skipped.
`time.ts` holds an hour and a day in milliseconds and `withTimeLimit`, which fails work that outlasts a time limit with
the caller's error. `runtimeGauges.ts` logs a long-running process's connection pool and event loop delay once a minute,
reading the delay from the histogram in `eventLoopDelay.ts`. Each line's `instance` field names the replica by its host
name, so the replicas' lines can be told apart.
`reportedPath.ts` names a page by its route's shape, for PostHog's page views and Sentry's page renders alike.
`youtube.ts` builds a YouTube video's watch page url and its player url, and holds `TOPIC_TUTORIAL_VIDEO`, the video on
making a topic that the homepage, the menus, and the docs build all read, with the marker a docs page writes for it.
`savedEnvSettings.ts` saves the environment settings a test changes and returns the call that puts them back, for
the api, worker, and shared tests alike. `monitoringTestFixtures.ts` quiets the console and the error report for the
api, worker, and database tests.
`envSettings.ts` reads a number that a setting holds: `toPositiveInteger` for a count or a duration, and
`readDollarSetting` for an amount in dollars. `hmac.ts` signs a value with HMAC-SHA256 for the signup gate, the release
webhook, the unsubscribe links, and the podcast cover keys.
`analytics.ts` holds the three kinds of event, the user events keyed to a user, the bot events keyed to a bot's or an
app's name, and the names of the browser's visit events, and `userAgent.ts` reads a request's device properties and
names a known crawler, unfurler, podcast app, or feed reader from a token list.

- This module imports nothing app-level. It may not reach into `ui`, `api`, `worker`, or `db`, which
  is what lets all four depend on it.
- A shape both sides need lives here once. A shape only one module reads stays in that module.
- `payloads.ts` exports each request payload's zod schema, and the `contracts/` modules each response's; the api
  validates with them through `zValidator` and the ui parses responses with them, so a drifted field fails at the
  boundary instead of silently. `payloads.ts` imports the contracts for their constants, and the contracts import only
  types back, so the two never load each other's values. A contract module loads another's values only one way:
  `chat.ts` and `findings.ts` load `profiles.ts`, `topics.ts` loads `podcast.ts`, `findings.ts`, `chat.ts`,
  `invites.ts`, and `profiles.ts`, and `podcastEpisodePage.ts` loads `topics.ts`, `podcast.ts`, and `findings.ts`, so
  no two modules load each other.
- Nothing here touches the database or the DOM, and only the monitoring and analytics clients reach the network: the
  rest are values and their shapes.
- Tests: `bun test shared`.
