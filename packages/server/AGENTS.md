# packages/server/

`@carlnotes/server`, the server-only part of what every server module shares: everything that reads `Bun.env`, a Node
built-in, or a server SDK, and the package every server package imports. `@carlnotes/db`, `emails`, `models`, and
`pipeline`, `apps/api`, and `apps/worker` import it; it imports `@carlnotes/contracts`, `@sentry/bun`, and
`posthog-node`.

`monitoring.ts` starts Sentry in the api and the worker and defines what tracing reads and writes: the traces sampler, a
request's transaction name and measurements, the stage and query spans, and the threshold warnings. The send-time scrub
every outgoing event passes is `scrubContent` and `scrubTransaction` in `monitoringScrub.ts`. `reportError` sends one
stage's one error ten times an hour and skips the rest, and the next hour's first report says how many were skipped.
`runtimeGauges.ts` logs a long-running process's connection pool and event loop delay once a minute, reading the delay
from the histogram in `eventLoopDelay.ts`. Each line's `instance` field names the replica by its host name, so the
replicas' lines can be told apart. `analytics.ts` holds the PostHog clients: `trackEvent` for the user events keyed to
a user, `trackBotEvent` for the bot events keyed to a bot's or an app's name, and `toBotCapture`; the event types are
`@carlnotes/contracts/analyticsEvents`. `appUrl.ts` reads the app's base url from `BETTER_AUTH_URL`: `appUrl()` falls
back to the local dev server, and `appBaseUrl()` is undefined if unset, for the emails and notifications that skip
without a link. `envSettings.ts` reads a number that a setting holds: `toPositiveInteger` for a count or a duration,
and `readDollarSetting` for an amount in dollars. `savedEnvSettings.ts` saves the environment settings a test changes
and returns the call that puts them back, for every workspace's tests. `monitoringTestFixtures.ts` quiets the console
and the error report for the api, worker, and database tests. `hmac.ts` signs a value with HMAC-SHA256 for the signup
gate, the release webhook, the unsubscribe links, and the podcast cover keys. `voiceChat.ts` reads the transcription
model from `CHAT_TRANSCRIPTION_MODEL` and says whether voice chat is on, which needs that model and the podcast speech
model. `podcastEpisodeSettings.ts` reads `PODCAST_SPEECH_MODEL`, which defaults to `gemini-3.8-flash-tts`, and Podcast
Episodes are off if it is set empty. `podcastCoverPaths.ts` signs a cover's key through `hmac.ts` with
`toPodcastCoverKey` and builds its path with `toPodcastCoverPath`, over the sizes and the `PodcastCover` shape in
`@carlnotes/contracts/podcastEpisodes`. `docsContent.ts` names the docs markdown folder that the api's documents and
the worker's docs embed read, and `sourceFileTestFixtures.ts` lists the source files under repo folders for the tests
that scan them.

`concurrency.ts` runs tasks a few at a time for the review's scoring, the sweep's reads of each owner's daily Topics,
key budget, and daily scans cutoff, the stored object deletes, and the reset's replacements. `retry.ts` tries a failed
attempt again after a fixed wait, for the worker's first Temporal connection, a podcast episode's publish, and the
podcast episode smoke's chapters. Every fetch of a user-supplied url goes through `fetchPublicUrl` (`publicFetch.ts`),
which re-checks each redirect hop against the internal-address rule, with `readLimitedBody` bounding reads. A fetch
that a server responds to with an error status throws `FetchStatusError`, and `isRetryableFetchFailure` says whether a
failure is worth a retry: a timeout, an abort, a 429, or a 5xx.

- Imports: `@carlnotes/contracts` only among the packages, never `db` or anything after it. Only the monitoring and analytics clients and `publicFetch` reach the network, and nothing here touches
  the database.
- Tests: `bun test packages/server`.
