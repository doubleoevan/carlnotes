## 1. Shed load at the api

- [x] 1.1 Render admission in `api/index.ts`: count visitor renders, shed past `RENDER_CONCURRENCY` with a 503 and a
      two-second retry, never shed a signed-in render, and add the setting to `.env.example`
- [x] 1.2 The page render and search limiters in `api/rateLimit.ts`, the page render one mounted ahead of every render
      in `api/index.ts`, the search one on `/topics/search`, `/teams/search`, and `/users`
- [x] 1.3 The default body limit in `api/api.ts` under `except` for the chat, upload, and note sync paths, and
      `toSignedOutRejection` in `api/bodyLimit.ts` ahead of the chat and room posts
- [x] 1.4 The click id redirect, the baseline headers, the policy's `base-uri` and `form-action`, and the public file
      headers in `api/index.ts`; a permanent redirect shared and a purge timeout in `api/edgeCache.ts`; the release
      purge reported in `api/edgeCache.purge.ts`
- [x] 1.5 Tests: `api/index.test.ts` for the file and the headers, `api/pageGuards.test.ts` for the redirect and the
      shedding; `api/rateLimit.test.ts` for both limiters; `api/edgeCache.test.ts` for the redirect; `api/api.test.ts`
      for the limit and the visitor's post

## 2. Share one copy with every visitor

- [x] 2.1 `readVisitorTopicFeeds` and `clearSharedTopicFeedCaches` in `api/topic/feeds.ts`, called from the feed route
      and every listing change
- [x] 2.2 The visitor's topic page copy in `api/topic/topicsRoute.ts`
- [x] 2.3 Tests in `api/topic/feeds.test.ts`

## 3. Bound Redis

- [x] 3.1 The command deadline and the reconnect after three in `db/redis.ts`, the memory gauges in `db/redisGauges.ts`,
      with the stall and the info reply in `db/redisFakeServer.ts`
- [x] 3.2 Tests in `db/redis.test.ts`, `db/redisGauges.test.ts`, and `db/redisRateLimits.test.ts`

## 4. Keep the scan queue honest

- [x] 4.1 The ingest's queue timeout, `SCREEN_ATTEMPTS`, and `RETRYABLE_SCREEN_FAILURE_TYPE` in
      `worker/workflows/stageTimeouts.ts`; the ingest timeout and the `scan-closing` queue in
      `worker/workflows/runTopicScan.ts`; the closing Worker and `SCREEN_CONCURRENCY` in `worker/temporal.ts`; the
      dispatch margin in `worker/staleScans.ts`
- [x] 4.2 `SCAN_DISPATCH_LIMIT` less the backlog, the failed-before-pickup filter, and the daily spend report in
      `worker/schedule.ts` and `worker/scanQueue.ts`, with `worker/dailySpend.ts`
- [x] 4.3 The transient retry in `worker/workflows/screenSource.ts` and `screenSourceActivities.ts`
- [x] 4.4 The unavailable response in `api/topic/scans.ts`, and the client deadlines in `worker/temporalClient.ts`
- [x] 4.5 Tests: `worker/schedule.test.ts`, `worker/staleScans.test.ts`, `worker/dailySpend.test.ts`,
      `worker/workflows/screenSourceActivities.test.ts`, `api/topic/scans.test.ts`, `worker/temporalClient.test.ts`

## 5. Gauge and bill spend

- [x] 5.1 The Scan owner's key on the search query generation in `worker/ingest/search.ts`, the Topic owner's for a
      scheduled Scan and the starting user's for a manual one, and the note in `worker/models.ts`
- [x] 5.2 The suggestion limit of 30 in `db/quotas.ts` and its test, and the tool caller limit on the suggestion route
- [x] 5.3 `GLOBAL_DAILY_SPEND_ALERT_USD` in `.env.example`, and the spend note in `litellm-config.yaml`

## 6. Respond on every failure path

- [x] 6.1 The five-minute single-use gate token in `api/signupGate.ts`, with `api/signupGate.test.ts`
- [x] 6.2 The mail hooks and the registration limit in `api/auth.ts`
- [x] 6.3 The webhook's two error responses in `api/billingRoute.ts`, with the webhook tests in `api/billing.test.ts`
- [x] 6.4 The decode failure report limit in `api/avatarsRoute.ts` and its test
- [x] 6.5 The slot wait's deadline and jitter in `worker/email.ts` and its test
- [x] 6.6 The error report windows in `shared/monitoring.ts` and their tests
- [x] 6.7 The role's statement timeout in `db/migrate.ts`, the claim's idle timeout opt-out in `db/claim.ts`, the two
      indexes in `db/schema/scans.ts` with their migration, and the schema and claim tests
- [x] 6.8 `saveEnvSettings` in the tests that cleared a setting by assigning undefined

## 7. Check the supply chain

- [x] 7.1 `.github/dependabot.yml`, `.github/workflows/codeql.yml`, and `SECURITY.md`
- [x] 7.2 The pinned actions and the audit step across the workflows, the digests in the three Dockerfiles, the scanner
      image at the compose file's version, and the cooldown in `bunfig.toml`
- [x] 7.3 Move `@react-email/ui` to the development dependencies at the `react-email` version; update `hono`,
      `@hono/zod-validator`, `@modelcontextprotocol/sdk`, `ai`, `@ai-sdk/openai`, and `zod` through the pinned Bun

## 8. Fix what the review of this change found

- [x] 8.1 Collapse the leading slashes in the click id redirect, so `//evil.com?fbclid=1` stays on this site, with its
      test in `api/pageGuards.test.ts`
- [x] 8.2 Send the auth emails through `sendAuthEmailInBackground` in `api/auth.ts`, so a send that throws is reported
      instead of left as an unhandled rejection, with its test in `api/auth.test.ts`
- [x] 8.3 `clearVisitorTopicCaches` in `api/topic/feeds.ts`, called from the topic save, the Topic Tool edits, and the
      delete, so a save that makes a topic private drops the visitors' copies of it, with its test in
      `api/topic/feeds.test.ts`
- [x] 8.4 Scope the role's statement timeout to the app's database in `db/migrate.ts`
- [x] 8.5 Bound the transient screen retry to a day after the save in `worker/workflows/screenSourceActivities.ts`, with
      its test
- [x] 8.6 Drop the page render limiter's unreachable api branch in `api/rateLimit.ts`, and name the scanner Dockerfile
      in the LLM Guard update issue's steps

## 9. Fix what the ship verification found

- [x] 9.1 Wait a day in the queue for review and the Source screen as for ingest, through `QUEUED_STAGE_TIMEOUT_MS` in
      `worker/workflows/stageTimeouts.ts`, and derive the stale scan window from it in `worker/staleScans.ts`, with
      `worker/staleScans.test.ts`
- [x] 9.2 Count only a visitor's render in `api/index.ts`, and mount the page guards (the rendered cache headers, the
      page render limiter, and the click id redirect) ahead of the blog and release routes as well as the ui's render,
      with the tests in `api/pageGuards.test.ts`
- [x] 9.3 Give the note sync its own body limit through `toBodyLimit` in `api/bodyLimit.ts`, and respond 404 to a
      signed-out chat room post in `api/chat/roomRoute.ts`, with the tests in `api/api.test.ts`
- [x] 9.4 Drop a topic's page copy through `clearVisitorTopicPages` from the team attach and detach in
      `api/team/teams.ts`, and through `clearVisitorTopicCaches` from the Source tools in
      `api/tool/topicSourceTools.ts`, which also drops the visitors' feed copies for a public topic, with the tests in
      `api/topic/feeds.test.ts` and `api/tool/topicSourceTools.test.ts`
- [x] 9.5 Keep the daily spend warning to its measured values, keep `@react-email/ui` as a development dependency at the
      `react-email` version, and correct the comments in `worker/scan.ts`, `api/topic/scans.ts`, and `worker/models.ts`
- [x] 9.6 Record only reconnect timers in the Redis tests' instant timer, `toInstantReconnectSetTimeout` in
      `db/redisFakeServer.ts`, so a command's deadline no longer counts as a reconnect
- [x] 9.7 One home for each second copy: `DAY_MS`, `HOUR_MS`, and `withTimeLimit` in `shared/time.ts`,
      `toPositiveInteger` and `readDollarSetting` in `shared/envSettings.ts`, `toHmacDigest` in `shared/hmac.ts`,
      `quietErrorReports` in `shared/monitoringTestFixtures.ts`, `loadSpendSince` in `db/quotas.ts`, `FetchStatusError`
      and `isRetryableFetchFailure` in `worker/publicFetch.ts`, `toRateLimiter` in `api/rateLimit.ts`, the cache header
      values in `api/edgeCache.ts`, `readVisitorTopicPage` in `api/topic/feeds.ts`, `signInAs` and `toSignedInApp` in
      `api/testSession.ts`, and the CI setup in `.github/actions/setup-bun`
- [x] 9.8 Split the files past 400 lines: `db/redisGauges.ts`, `db/redisRateLimits.ts`, `shared/monitoringScrub.ts`,
      `api/avatarsRoute.ts`, `api/billingRoute.ts`, `worker/scanQueue.ts`, `api/authHooks.ts`, `worker/transcripts.ts`,
      `worker/suggestedSourceChecks.ts`, `api/pageGuards.test.ts` over the existing `api/indexTestFixtures.ts`,
      `worker/scheduledTopicFilter.test.ts`, and `db/redisRateLimits.test.ts` and `db/redisGauges.test.ts`
- [x] 9.9 Bound what reaches a route: Bun's `maxRequestBodySize` and the default body limit on `/mcp/*` in
      `api/index.ts`, a visitor rejected before the upload and note sync limits through `toSignedOutRejection`, no rate
      limit headers on a shared page, and `stale-if-error` on the rendered pages in `api/edgeCache.ts`, with their tests
- [x] 9.10 Close the failure paths the reviewers found: a 500 for a webhook with no `STRIPE_WEBHOOK_SECRET` in
      `api/billing.ts`, 600 MCP registrations an hour per address in `api/auth.ts`, a manual scan's row kept after a
      client deadline in `worker/scan.ts`, the queue description under a time limit in `worker/temporalClient.ts`, the
      original error kept if `failScan` fails in `worker/workflows/runTopicScan.ts`, every scan activity on the closing
      Worker in `worker/temporal.ts`, a missed deadline counted only against the current client in `db/redis.ts`,
      `STALE_SCAN_MS` only lengthening the default in `worker/staleScans.ts`, and the feed copies dropped after a public
      topic's prompt edit in `api/tool/topicTools.ts`, with their tests
- [x] 9.11 Correct the comments, names, and terms the wording audit found across the code, the module docs, and this
      change's artifacts, and list the shipped names this change renamed in `.agents/commands/audit-structure.md`

## 10. Docs and gate

- [x] 10.1 `api/AGENTS.md`, `db/AGENTS.md`, `shared/AGENTS.md`, `worker/AGENTS.md`, `.env.example`,
      `.agents/commands/audit-structure.md`, and the README's process table and Security section
- [x] 10.2 The spec deltas under `specs/` for every capability the proposal names
- [x] 10.3 The gate: Biome, the ui boundary check, `tsc -b`, the workflow bundle check, and `bun test`
