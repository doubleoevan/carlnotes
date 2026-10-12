## Why

A viral day is the one the app was built for and the one it has not had. The audit behind this change benchmarked the
api with the database and Redis stubbed, read every path a spike would push on, and found where the first few thousand
visitors an hour would turn a slow site into a down one: a render path with no admission control, a scan queue whose
waiting time counted against each scan's own timeout, a Redis command with no deadline, a signup gate cookie that one
check could reuse for any number of accounts, bodies of any size read for any caller, visitors who each cost a feed
build, and spend with no aggregate gauge. This change closes each one the code can close, adds the supply-chain checks a
public repository should run, and leaves the settings only a dashboard can change to a list the owner works through.

## What Changes

**Part 1: The api sheds load instead of falling over.** A visitor's page render past `RENDER_CONCURRENCY` (16 by
default) gets a 503 with a two-second retry while the edge serves its stale copy; a signed-in render, the cheap shell
the browser fills, is neither counted nor shed. A visitor's page requests at the origin (the ui's pages, the blog, and
the release pages) are limited to 120 a minute by address, except a request with a session cookie or with no trusted
address, and the search bar's three routes are limited to 60 a minute. Every body on an `/api` route without a limit of
its own is bounded at a megabyte, the note sync gets a limit of its own, and a signed-out chat post is rejected before
its body is read. A page url with a click id such as `fbclid` redirects permanently to the url without it, which is the
one the edge has, never to another host, and a permanent redirect is shared at the edge like a page. An unhashed public
file is cached an hour in the browser and a day at the edge. Every response includes `base-uri` and `form-action` in its
policy, `Referrer-Policy`, and `X-Content-Type-Options`.

**Part 2: Visitors share one copy.** The signed-out feed is served from one copy per view for half a minute across every
replica, and a visitor's topic page from one Redis copy for half a minute. Every edit or delete of a topic, every Source
added or removed, and every team attach or detach drops its page copy, and every change to the public listing drops the
feed copies with the featured and popular topic id lists. A topic made private leaves those copies once its save
returns, with two limits: a read already loading may write its copy once more for up to 30 seconds, and another topic's
page copy may list it among its Similar topics for up to 30 seconds.

**Part 3: Redis cannot wedge a request.** A command with no reply in two seconds fails as an error, three in a row
replace the client, and the minute line reads the server's memory and warns at eight tenths of its limit and at ten
errors a minute.

**Part 4: The scan queue survives a backlog.** A Scan's ingest and review, and a Source's screen, each wait in their
queue up to a day, while each attempt keeps its own running bound; the closing writes run on their own `scan-closing`
queue with their own Worker, so a full queue never starves a scan's finish; a sweep hands Temporal at most
`SCAN_DISPATCH_LIMIT` (100) scheduled scans minus the backlog; a scan that was dispatched and never picked up does not
spend its Topic's window; and a manual scan whose start throws gets a 503, with the row it opened deleted unless the
start hit its deadline. Screening runs `SCREEN_CONCURRENCY` (8) at a time on each of a replica's two screening Workers,
and a transient fetch failure runs up to three attempts and leaves the Source pending for the next sweep instead of
failing it, for up to a day after the save, after which the failure is recorded for the owner.

**Part 5: Spend has a gauge.** The sweep logs the day's recorded spend across scans, chat, and podcast episodes with the
day's signups, and warns past `GLOBAL_DAILY_SPEND_ALERT_USD`. The search ingester's query generation bills the Scan
owner's key, the Topic owner's for a scheduled Scan and the key of the user who started a manual one, like every other
model call a Scan makes. The daily suggestion limit is 30, and the suggestion route is limited like a tool caller.

**Part 6: Failure paths respond instead of hanging.** The signup gate token lives five minutes and one signup consumes
it. The mail hooks start their send in the background and respond at once. The Stripe webhook responds 400 to a bad
signature and 500 to a verified event it could not apply, both reported. A Temporal connect, start, and cancel each give
up after ten seconds. A call that would wait more than ten seconds for a Resend slot goes out without one, and every
wait adds jitter. A stage's repeated error is reported ten times an hour and the rest counted. The role's
`statement_timeout` is 30 seconds, the claim's transaction opts out of the idle timeout, and the duplicate check and the
new finding count read by index.

**Part 7: The supply chain is checked.** Dependabot for the Bun lockfile, the actions, and the image bases; `bun audit`
against the GitHub Advisory Database on every CI run, report-only; CodeQL on every push to main, every pull request into
main, and weekly; every action pinned to a commit and every image base to a digest; a three-day cooldown on new package
versions; a `SECURITY.md`; `@react-email/ui`, the email preview server, moved to the development dependencies at the
`react-email` version, so the production image no longer installs its Next.js; `hono`, `@hono/zod-validator`,
`@modelcontextprotocol/sdk`, `ai`, `@ai-sdk/openai`, and `zod` updated within their ranges; `better-auth` limited to
patch releases of 1.6; and the LLM Guard image at the compose file's 0.3.16.

## Capabilities

### New Capabilities

- `supply-chain`: Dependabot, the advisory audit, CodeQL, the pinned actions and image digests, the install cooldown,
  and the security policy

### Modified Capabilities

- `request-capacity`: render admission, the page render and search limits, the default body limit, the visitors' shared
  copies, the statement timeout, and two indexes
- `edge-caching`: a permanent redirect is shared, a click id redirects away, and the release purge is reported
- `static-serving`: a public file is cached an hour in the browser and a day at the edge, the page guards ahead of the
  ui's handler, and the baseline headers
- `redis-store`: a command deadline, a reconnect after three, and the memory and error gauges
- `performance-telemetry`: the Redis memory, Redis errors, and daily spend thresholds
- `durable-scans`: the queue wait for ingest and review, the closing queue, and the client deadline
- `scheduled-scans`: the dispatch limit, a scan never picked up, the daily spend gauge, and the unavailable response
- `source-screening`: the screen concurrency, the screen's queue wait, and the transient retry, bounded to a day after
  the save
- `user-auth`: the single-use gate token, the mail hooks, the registration limit, and the search query billing
- `source-suggestion`: the limit of 30 and the tool caller limit on the route
- `email-delivery`: the slot wait's deadline and jitter
- `monitoring-analytics`: the error report windows
- `subscription-billing`: the webhook's two error responses
- `topic-chat`: a signed-out post is rejected before its body, a chat room's with a 404
- `user-avatars`: the decode failure reports are limited
- `deploy-mechanics`: the migrate job sets the statement timeout

## Impact

- `api/`: `index.ts`, `api.ts`, `rateLimit.ts`, `edgeCache.ts`, `edgeCache.purge.ts`, `signupGate.ts`, `auth.ts`,
  `billing.ts`, `avatars.ts`, `profiles.ts`, `content.ts`, `releases.ts`, `chat/privateChat.ts`, `chat/roomRoute.ts`,
  `note/notes.ts`, `team/teamsRoute.ts`, `topic/attachments.ts`, `topic/feeds.ts`, `topic/topicsRoute.ts`,
  `topic/scans.ts`, `topic/search.ts`, `topic/featuring.ts`, and the callers of `clearVisitorTopicCaches`:
  `topic/saveTopic.ts`, `topic/deleteTopic.ts`, `tool/topicTools.ts`, `tool/topicSourceTools.ts`, and `team/teams.ts`.
  New: `bodyLimit.ts`, the Better Auth hooks split out of `auth.ts` into `authHooks.ts`, and the routes split out of
  their modules, `avatarsRoute.ts` and `billingRoute.ts`.
- `worker/`: `temporal.ts`, `temporalClient.ts`, `schedule.ts`, `staleScans.ts`, `scan.ts`, `budget.ts`, `email.ts`,
  `suggest.ts`, `ingest/index.ts`, `ingest/ingester.ts`, `ingest/search.ts`, `ingest/feed.ts`, `ingest/bluesky.ts`,
  `ingest/x.ts`, `models.ts`, `workflows/runTopicScan.ts`, `workflows/runTopicScanActivities.ts`,
  `workflows/stageTimeouts.ts`, `workflows/screenSource.ts`, `workflows/screenSourceActivities.ts`, `publicFetch.ts`,
  `scrape.ts`, `litellm.ts`, and the new `dailySpend.ts`, with three files split out of their modules: `scanQueue.ts`
  out of `schedule.ts`, `transcripts.ts` out of `scrape.ts`, and `suggestedSourceChecks.ts` out of `suggest.ts`.
- `db/`: `redis.ts`, `redisFakeServer.ts`, `claim.ts`, `migrate.ts`, `quotas.ts`, `schema/scans.ts` with one migration,
  and the new `redisGauges.ts` and `redisRateLimits.ts`, split out of `redis.ts`.
- `shared/`: `monitoring.ts`, `scanFailure.ts`, and the new `time.ts`, `envSettings.ts`, `hmac.ts`, and
  `monitoringScrub.ts`, the last split out of `monitoring.ts`, with `monitoringTestFixtures.ts` for the tests.
- Tests: the new `api/testSession.ts` and the existing `api/indexTestFixtures.ts`, extended, which the api tests share,
  and the test files split beside their modules.
- Repository: `.github/dependabot.yml`, `.github/workflows/codeql.yml`, `.github/actions/setup-bun`, `.bun-version`, the
  four workflows' pins and the audit step, `SECURITY.md`, `bunfig.toml`, the three Dockerfiles, `litellm-config.yaml`,
  `package.json` and `bun.lock`.
- Docs: the module `AGENTS.md` files, `.env.example`, `.agents/commands/audit-structure.md`, and the README's process
  table and new Security section.
- Manual steps: the Northflank, Neon, Cloudflare, Sentry, vendor, and GitHub settings this change cannot reach, listed
  in design.md's Non-Goals.
