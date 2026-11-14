# Deployment

## Prompt registry

Git is the source of truth for prompt wording (`packages/models/prompts/*.md`).
`prompts:sync` pushes that wording to Langfuse as the `production` version that each prompt is served from. The sync is
idempotent: an unchanged prompt creates no new version. It needs `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` set.
`--candidate` uploads under the `candidate` label instead and leaves the served `production` label alone until someone
promotes the version in Langfuse by hand. The deploy job runs that form, while the two scripts below write `production`
directly.

Each Doppler config points at its own Langfuse project. The `doppler run` call picks the environment, so there is one
script per environment: `prompts:sync` for dev and `prompts:sync:prd` for production. The script names the environment
in its summary line, since a run against dev otherwise reads like a run against production:

```bash
bun run prompts:sync
```

```bash
bun run prompts:sync:prd
```

## MCP view bundles

A host locks to the MCP view resource a tool named when the host connected, so an old version has to keep working after
a deploy. `bun run mcp-views:freeze` stores the current version in object storage, then raises it. It builds the current
bundle, uploads its script and stylesheet, adds the version to `packages/contracts/mcpViewVersions.json`, and raises
`MCP_VIEW_VERSION` in `packages/contracts/mcpViews.ts`. Run it under production credentials and commit both files with
the change that ships the new MCP views:

```bash
doppler run --config prd -- bun run mcp-views:freeze
```

`--bundle <folder>` stores a bundle built in another checkout, with `bun run --cwd apps/web build:mcp-views`.
`--mcp-views search,topic` names the MCP views that bundle holds, if they differ from the current ones.

The api reads a stored bundle once and keeps it in memory. If the read fails, the api reports the failure, serves the
current bundle for that request, and tries again on the next read.

`MCP_VIEW_FILM_PLAYBACK` decides where an MCP view's film plays. It is off unless set to `true`. While it is off, a
podcast episode's film links to the film player on its page. While it is on, the MCP view's data includes the film's
video and captions urls under the caller's play token, and the film plays in the host's frame with no
picture-in-picture or fullscreen. Turn it on in a Doppler config once a host is known to play video in its frame, and
update the film sentence on the docs page `account/add-to-ai.md` in the same change.

## Container image

The app service is the Hono api plus the built web app it serves. It builds from the repo-root
`Dockerfile`. The Dockerfile copies the root `package.json`, `bun.lock`, and every workspace's `package.json` before the
install, so that layer caches until a dependency changes. Then it copies the packages and the two apps the image runs,
`apps/api` and `apps/worker`, beside the built web app and docs. The image starts under `doppler run`. The LiteLLM proxy
is a separate service with its own image in `infra/litellm/`. Build the app image with:

```bash
docker build --platform=linux/amd64 --build-arg VITE_TURNSTILE_SITE_KEY=<site-key> --build-arg VITE_POSTHOG_KEY=<project-key> --build-arg VITE_POSTHOG_HOST=<host> -t carlnotes-app .
```

`VITE_TURNSTILE_SITE_KEY`, `VITE_POSTHOG_KEY`, and `VITE_POSTHOG_HOST` are the settings that cannot wait for
`doppler run`. Vite inlines them into the bundle at build time, so they have to be present during the build. They are
public values that ship to every visitor.

`--platform=linux/amd64` matters on Apple Silicon. The Doppler CLI is copied from `dopplerhq/cli:3.77.0`, which
publishes amd64 only.

The image smoke test boots a built image the way production does, with no secrets. CI's `image-smoke` job builds the
image on every pull request and every push to `main`, then runs
[scripts/image-smoke.sh](../../scripts/image-smoke.sh) against it. The script starts Postgres with pgvector and Neon's
WebSocket proxy on one Docker network, migrates the empty database from the image, and starts the api with
`NODE_ENV=production` and dummy settings. It fails if the api exits, never responds to `/api/health` within 90 seconds,
or responds with anything but 200 for `/`, `/plans`, `/api/health`, or `/api/health/ready`, and it prints the
containers' logs on failure. The same steps run locally against an image built with Cloudflare's public always-pass
Turnstile key:

```bash
docker build --build-arg VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA -t carlnotes-smoke:local .
```

```bash
bun run smoke:image carlnotes-smoke:local
```

`DATABASE_WS_PROXY` points the database driver at the proxy. Only the smoke test sets it, and production never does.

## Release jobs

Migrations are a deploy job, not a start-up step. A push to `main` starts Northflank's `release-main` workflow through
its GitHub push trigger, without waiting for CI, so a failing or slow check never holds a release back. The workflow
builds the newest commit on `main` once and runs the migration job against it. Only then does it deploy `app`, purge
the edge, deploy `temporal-worker`, and finish with the docs embed. So new code never meets an old schema. Each deploy
step waits up to ten minutes for its replicas to run, and a rollout that never runs fails the workflow before the next
step. The workflow's definition is
[infra/northflank/release-main.json](../../infra/northflank/release-main.json). To redeploy `main` by hand, run
`release-main` from the Northflank console.

The `app` service's startup, readiness, and liveness checks are
[infra/northflank/app-health-checks.json](../../infra/northflank/app-health-checks.json), the `healthChecks` body of
Northflank's `PATCH /v1/projects/carlnotes-prd/services/deployment/app`. Startup polls `/api/health` every 10 seconds
for up to two minutes. Readiness polls `/api/health/ready` every 10 seconds and takes a replica out of traffic after
three misses. Liveness restarts a replica after six missed `/api/health` polls. Both Northflank files are applied by
hand, with the Northflank CLI or console. Apply `release-main.json` with `northflank create workflow`, which upserts
(`update workflow` returns HTTP 500).

The migration job runs:

```bash
doppler run -- bun packages/db/migrate.ts
# or
bun run db:migrate
```

Prompts are a deploy job too, uploaded as candidates instead of promoted. The registry keeps serving the `production`
wording until someone promotes a candidate in Langfuse:

```bash
doppler run -- bun packages/models/prompts/sync.ts --candidate
# or
bun run prompts:sync --candidate
```

Promote a candidate to production in Langfuse once a real scan's note reads right. The runtime falls back to the bundled
template if a registry template names different variables than the bundled one, so a stale label can never break a
prompt. The runtime logs a prompt whose live wording differs from the bundled one, once per process.

The docs embed is a deploy job too. It embeds only the new and changed sections and deletes the rows of removed ones, so
a push that leaves the docs and the embedding model alone makes no embedding calls:

```bash
doppler run -- bun apps/worker/docsSync.ts
# or
bun run docs:embed
```

The edge purge is a deploy job too. It runs right after `app` deploys and clears the pages and the signed-out feed that
Cloudflare shares, so no cached page names assets the old build had. It needs `CLOUDFLARE_ZONE_ID` and
`CLOUDFLARE_API_TOKEN`. Without them, or if Cloudflare rejects the purge, the job logs why and the release goes on.
Those pages leave the edge within two minutes without a purge:

```bash
doppler run -- bun apps/api/edgeCache.purge.ts
# or
bun run edge:purge
```

The temporal worker is its own service and the scan sweep a cron job, both built from this same image with the command
overridden. They pick up new code on every deploy, as the api does. `schedule` decides what to scan and `temporal` does
the scan work. Each starts through a root script, so the command Northflank runs never names a file path and survives a
file move.

```bash
doppler run -- bun apps/worker/temporal.ts
# or
bun run temporal
```

```bash
doppler run -- bun apps/worker/schedule.ts
# or
bun run schedule
```

Without the `temporal` worker, `workflow.start` still succeeds against a queue nobody polls: scans wait in the queue
with no error, and the api looks healthy. The scan sweep reports to Sentry if no worker polls the scan queue, and that
report is the check to alert on.

The LiteLLM proxy builds outside the `release-main` pipeline. [infra/litellm/Dockerfile](../../infra/litellm/Dockerfile)
copies [litellm-config.yaml](../../litellm-config.yaml) into the image, and a Northflank path rule on those two files rebuilds
and redeploys the service on push. A model swap is the config edit and nothing else. The dev stack's
`docker-compose.yml` names the same image and digest as that Dockerfile, so a change of the proxy's version moves
both, and the smoke suite runs on the new version before production does.

## Spend control settings

Six Doppler settings set the defaults of the daily spend controls. Each one is optional, and an unset, empty, or
invalid value reads as the built-in default. Zero reads as the default too, except for `FIRST_SCAN_DISPATCH_LIMIT`,
where zero starts no waiting scans, and `TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT`, where zero
turns generated images off. The admin console overrides each one without a deploy or a restart, and clearing an
override returns to the Doppler value.

| Setting | Default | What it sets |
|---|---|---|
| `PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD` | 65 | the day's free-plan spend past which a free user's podcast episodes after a topic's first are skipped |
| `SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD` | 100 | the day's free-plan spend past which a free user's scheduled scans wait for the next day, and their first and manual scans wait for the first scan dispatch limit |
| `CHAT_DAILY_SPEND_CUTOFF_USD` | 150 | the day's free-plan spend past which a free user's chat with Carl pauses until midnight UTC |
| `FIRST_SCAN_DISPATCH_LIMIT` | 5 | how many waiting scans one sweep starts, oldest first. Zero starts none |
| `HOURLY_SIGNUP_ALERT_COUNT` | 50 | the accounts created in an hour at which the sweep crosses the `hourly-signups` threshold |
| `TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT` | 40 | how many generated images one film draws at most. The console takes 0 to 1,000 |

Four switches have no Doppler setting, and each is off until an admin turns it on in the console:

- **The unverified accounts switch.** The first and manual scans of a free account that signed up with a password
  and has not verified its email wait for the first scan dispatch limit, whatever the day's spend, and Carl does not
  answer that account in chat or voice.
- **Pause new podcast episodes.** No scan records a new podcast episode.
- **Pause new films.** A podcast episode that publishes gets no film.
- **Show only pinned items on the home.** The home's sections list their pinned items alone.

The overrides and the switches live in the `spend_control_settings` row, and every reader sees a save within its
next read. The [Launch runbook](#launch-runbook) lists what each one stops and what keeps working.

## Deploy alerts

Four alerts tell the owner that carlnotes.com stopped rendering. They are set up by hand in Sentry and in the
external monitor, so nothing in the repo applies them. Each one notifies the owner by email and by a push to the Sentry
mobile app, or to the external monitor's own app. In Sentry, the push needs the mobile app signed in, and **User
Settings → Notifications → Issue Alerts** and **Metric Alerts** set to deliver by email and mobile push.

1. **The external monitor polls readiness.** In the external uptime monitor, change the monitor's url from
   `https://carlnotes.com/api/health` to `https://carlnotes.com/api/health/ready`, expecting a 200, and turn on its
   email and app push alerts. `/api/health` stays the platform's liveness check. It responds 200 even if no page can
   render.
2. **A new issue in a release.** In Sentry, **Alerts → Create Alert → Issues**, for the `prd` environment. When "A new
   issue is created", if "The event is from the latest release", notify the owner. The release is the deployed commit
   SHA, so the alert names the commit that introduced the error.
3. **An error rate spike.** In Sentry, **Alerts → Create Alert → Errors → Number of Errors**, for the `prd`
   environment, critical above 50 errors in 5 minutes, notifying the owner. It catches an error Sentry has seen before
   that a release makes common again.
4. **The home page renders.** In Sentry, **Alerts → Create Alert → Uptime Monitor**, for `https://carlnotes.com/`
   every minute, failing on any status other than 200, notifying the owner. It catches a page that fails while
   readiness, which renders only the privacy page, still passes.

## Launch runbook

Read this while a wave of new people arrives. It is ordered on purpose: the checks to make before the wave, what to
watch, how to add capacity, and only then the switches. Meet load with capacity first. Every switch takes something
away from someone, so each is a last resort.

### Before the wave

Each step says where to look and what value is wanted. A fact that only a dashboard knows is marked **Owner** and is
filled in by hand.

1. **Size the cutoffs for the wave.** The three daily spend cutoffs are thresholds in force at their defaults ($65,
   $100, and $150). A new free user costs about $0.56 on their first day (a Scan $0.098, a short podcast episode
   $0.218, and a film $0.240, measured 2026-11-13), so 3,000 signups spend about $1,670 and the $100 cutoff passes
   after 180 to 1,000 signups. Past it every free user's first and manual Scan waits, and past $150 chat pauses for
   every free user until midnight UTC. In the admin console's **Limits** section, set the three cutoffs to the
   expected signups times $0.56 with the margin you choose, and set **First scan limit** to the waiting Scans you
   want started each sweep. Production's sweep runs every 15 minutes, so a limit of 5 starts 20 waiting Scans an
   hour.
2. **Add three Sentry rules.** The four Deploy alerts above miss a threshold warning and a repeating error. In
   Sentry, **Alerts → Create Alert → Issues**, for the `prd` environment, each notifying the owner:
   - Every threshold warning: when "The issue is seen more than 0 times in one hour", if "The event's tags match
     `alert` equals `performance`". The app sends each condition under a fixed fingerprint, so "A new issue is
     created" fires only the first time a condition is ever crossed.
   - A repeating error: when "The issue is seen more than 5 times in 15 minutes". One repeating error sends at most
     20 events an hour, which never reaches the error rate alert's 50 in 5 minutes.
   - No Temporal worker: when "The issue is seen more than 0 times in one hour", if the event's message contains
     `no temporal worker is polling the scan queue`.
3. **Set the spend alert.** Set `GLOBAL_DAILY_SPEND_ALERT_USD` in Doppler to the day's spend that should warn you.
   Unset, the sweep logs the day's spend and warns nobody. The sweep reads it at its next run, with no restart.
4. **Close the origin to everything but the edge.** **Owner:** in Northflank, add an IP policy on the `app` service's
   public port that allows Cloudflare's published address ranges alone. Without it a request to the service's own
   hostname skips the edge cache and Cloudflare's protection, and each one is a server render.
5. **Read each service's termination grace.** **Owner:** in Northflank, each service's advanced deployment settings.
   The worker gives a running activity two minutes to finish on a stop (`SHUTDOWN_GRACE_MS` in
   `apps/worker/temporal.ts`), so `temporal-worker` needs a grace period longer than two minutes. Record each value
   in the Services table below.
6. **Read each plan and quota.** **Owner**, each in its own dashboard. The wanted value is room for the wave: a
   quota that runs out fails quietly.
   - Sentry: the plan's monthly errors and spans. Past the quota Sentry drops errors and the alerts stop with them.
   - PostHog and Langfuse: the plan's monthly events and traces.
   - Resend: the plan's daily and monthly emails, and its requests a second. The app sends at most nine a second.
   - Fireworks, and Gemini speech and images: the spend limit and the requests a minute on each key.
   - Exa and Firecrawl: the plan's monthly searches and scrapes.
   - YouTube: the Data API's daily units, 10,000 by default.
   - Google Maps: the daily map loads on the Dashboard map's key.
   - The moderation endpoint: the requests a minute on `OPENAI_API_KEY`. Its limit is recorded nowhere.
   - Redis: `maxmemory` above zero, which the memory warning needs, and the eviction policy `noeviction`. Another
     policy drops a buffered count or a spend reservation without an error. The minute line showed `maxMemoryBytes`
     at 332 MB on 2026-11-13.
   - Neon: the compute's maximum size. The pools were sized from `max_connections` 901 on 2026-11-13.
   - Temporal: the free disk on the `temporal-db` addon, 20 GB on 2026-11-13.
7. **Freeze deploys if you want none during the wave.** See Rollback below. A docs commit deploys too.
8. **Check the store links.** The docs' Get the app page (`apps/docs/src/content/docs/get-the-app.md`) links to the
   live App Store and Google Play listings. Its App Store line was still a placeholder on 2026-11-13.

Three things stay unguarded after this work:

- Text moderation lets text through if its check cannot run.
- A generated image gets no image check, and only a film's chapter images are checked.
- An unset `OPENAI_API_KEY` skips every image check with no report, so every upload posts unchecked. With the key set,
  an upload whose check fails is saved as unchecked until the sweep can check it, and a worker with no key keeps every
  image unchecked.

### What to watch

Each process logs one line a minute, and the sweep logs the day's spend every run. Filter the service's logs in
Northflank on `"gauges":"runtime"` or `"gauges":"daily-spend"`. A crossed threshold also sends one Sentry warning an
hour for each condition, tagged `alert: performance`.

The normal ranges below are the median, the 99th percentile, and the largest value in the lines of 2026-11-06 18:00
UTC to 2026-11-13 18:00 UTC: 20,100 from `app`, 20,088 from `temporal-worker`, and 672 from the sweep. That was a
quiet week before launch, so a wave reads above them. Read them again after the wave.

The api's minute line, from each `app` replica:

| Field | Normal range | Warning | Add capacity if |
|---|---|---|---|
| `pool.waitingCount` | 0, 0, 0 | `pool-waiting` above 0 | it is above 0 for more than a minute |
| `pool.totalCount`, `pool.idleCount` | 0, 15, 81, where 81 is the pool's size | none | the total stays at the pool's size with nothing idle |
| `eventLoopDelayMs.p99Ms` | 0, 3, 18 | `event-loop-delay` past 100 | it passes 50 for several minutes |
| `eventLoopDelayMs.maxMs` | 13, 258, 2,113 | `event-loop-delay` past 2,000 | stalls past 1,000 come every few minutes: 28 minutes of the week had one |
| `redis.isConnected` | true every minute | `redis-down` if false | never: restore Redis, see Recovery |
| `redis.errorCount` | 0, 0, 0 | `redis-errors` at 10 in a minute | never: read the Redis addon's own logs |
| `redis.cacheHitCount`, `redis.cacheMissCount` | 0, 7, 745 and 0, 6, 86 | none | misses stay above hits during a wave, which means the cache is not holding |
| `redis.usedMemoryBytes` of `redis.maxMemoryBytes` | 2.4 MB, 3.9 MB, 6.3 MB of 332 MB | `redis-memory` at 80% | it passes 50%: raise the addon's plan |

The worker's minute line, from each `temporal-worker` replica, adds the scan queue:

| Field | Normal range | Warning | Add capacity if |
|---|---|---|---|
| `scanQueue.backlogCount` | 0, 0, 0 | none | it grows from one minute to the next |
| `scanQueue.oldestBacklogAgeMs` | 0, 0, 0 | `scan-backlog` past 15 minutes | it passes 5 minutes |
| `scanQueue.pollerCount` | 2, 4, 6: two for each replica, more while a deploy overlaps | the sweep's "no temporal worker" error at 0 | never: at 0 the worker is down |
| `pool.waitingCount` | 0, 0, 16: one minute of the week, with the pool full at 81 | `pool-waiting` above 0 | it is above 0 for more than a minute |
| `eventLoopDelayMs.p99Ms`, `maxMs` | 0, 21, 50 and 10, 76, 2,393 | none for the worker | never by itself |

Only the `topic-scans` queue is in the minute line. Read every other queue's backlog in the Temporal UI, or with
`temporal task-queue describe --task-queue <name>`.

The sweep's lines, every 15 minutes:

| Line | Normal range | Warning | What it means |
|---|---|---|---|
| `"gauges":"daily-spend"` `totalDollars` | a day's largest total ran from $1.11 to $22.73 | `daily-spend` at `GLOBAL_DAILY_SPEND_ALERT_USD` | compare it with the cutoffs you set in step 1 |
| the same line's `newUserCount` | 0 to 2 a day | `hourly-signups` at the hourly signup alert, 50 by default | the wave has started |
| `scheduled scan sweep: ...` | 0 started on most runs | none | "left for the next sweep" above 0 means the scan dispatch limit held Scans back |
| `dispatching ... waiting scans` | not logged while nothing waits | none | Scans are waiting on a cutoff or on the unverified accounts switch |

### How to add capacity

Every process holds a database pool, so the pool count comes first.

1. **Raise the pool count, then restart.** Each process sizes its pool to the connection pooler's share of
   `max_connections` divided by `DATABASE_POOL_COUNT`, 10 in production on 2026-11-13 (81 connections a pool). Count
   the processes that can hold a pool at once after the change: every `app` replica, every `temporal-worker` replica,
   the sweep, the monthly budget reset, the replicas a rolling deploy overlaps with, and the release jobs. Set
   `DATABASE_POOL_COUNT` in Doppler to that number and restart `app` and `temporal-worker` before adding a replica. A
   process reads the setting only at its start.
2. **Add the replicas or the size**, in Northflank, from the table below.

| Service | What it runs | Size and replicas on 2026-11-13 | Termination grace | Health checks | To add capacity |
|---|---|---|---|---|---|
| `app` | the api and every page render | 1 vCPU and 2,048 MB, 2 to 4 replicas autoscaled at 70% CPU | **Owner** | startup and liveness on `/api/health`, readiness on `/api/health/ready` | raise the autoscaler's maximum, then the plan |
| `temporal-worker` | every Temporal queue | 2 vCPU and 4,096 MB, 2 replicas, no autoscaling, 2 GB disk | **Owner**, longer than two minutes | none | add replicas |
| `temporal` | the Temporal server | 1 vCPU and 1,024 MB, 1 replica | **Owner** | TCP liveness on 7233 | raise the plan |
| `litellm` | the proxy in front of every model call | 1 vCPU and 4,096 MB, 2 replicas | **Owner** | liveness on `/health/liveliness` | add replicas |
| `redis` addon | Redis 8 | 0.2 vCPU and 512 MB, 1 replica, 6 GB disk | not applicable | the platform's | raise the plan |
| `temporal-db` addon | Temporal's Postgres 16 | 1 vCPU and 4,096 MB, 2 replicas, 20 GB disk | not applicable | the platform's | raise the plan or the disk |
| `scan-sweep` cron job | the sweep, every 15 minutes, one at a time, 10 minutes at most | 1 vCPU and 1,024 MB | not applicable | none | raise the plan |

A visitor's page render past `RENDER_CONCURRENCY`, 16 on a replica by default, gets "the site is busy, try again in
a moment" with a two-second retry. That is the reading that `app` needs another replica. Raising the setting needs a
restart of `app` and gives a replica more renders than its one vCPU serves well.

A chat post over 3.25 MB waits its turn among 104 MB of large chat bodies on a replica, one at a time for each user.
A post that waits 20 seconds gets "Carl is busy reading other files" and the api logs "a large body waited 20000 ms
for its turn and got the busy response". That line is the reading that `app` needs another replica.

A Worker's slots are fixed when the worker starts, so during a wave the way to add scan or recording capacity is to
add `temporal-worker` replicas. Each replica adds the slots below on every queue. Changing a setting means a
restart, and a worker restart costs each film render in progress one of its three attempts and up to four hours of
work, and a review one of its two attempts. Two restarts inside one review fail that Scan.

| Queue | Slots on a replica | Setting |
|---|---|---|
| `topic-scans` | 8 | `SCAN_CONCURRENCY` |
| `scan-closing` | 8 | fixed |
| `scan-emails`, `personal-sources-email` | 4 each | fixed |
| `push-notifications` | 4 | fixed |
| `source-screening`, `attachment-processing`, `personal-sources`, `topic-images`, `topic-posts` | 8 each | `SCREEN_CONCURRENCY` |
| `episode-recordings` | 16 | `PODCAST_RECORDING_CONCURRENCY` |
| `dashboard-snapshots` | 2 | fixed |
| `episode-videos` | 1 | `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY` |
| `episode-video-backfill` | 1 | `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY` |

### Switches, as a last resort

Every switch is off until someone sets it, which `apps/api/emergencySwitches.test.ts` checks. A switch in the admin
console's **Limits** section is one row that every process reads through a 60-second cache, and a save clears the
cache, so it takes effect within a minute with no restart. A Doppler setting reaches a process only at its start:
`app` and `temporal-worker` need a restart, and the sweep reads it at its next run. If the settings row cannot be
read, the failure is reported and every switch reads as off.

To stop new podcast episodes, use the pause. The empty speech model is the last row for a reason.

| Switch | Set in | Restart | What it stops | What keeps working | What a person sees | Undo | Test |
|---|---|---|---|---|---|---|---|
| Podcast episodes daily cutoff, `PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD`, $65 | Limits, with the Doppler default | none | a free user's podcast episodes after a Topic's first, once the day's free-plan spend passes it | the Scan and its Findings, and paid users | nothing: the Scan succeeds with no new podcast episode | raise or clear the override; the day ends at midnight UTC | `packages/pipeline/podcast/planPodcastEpisode.test.ts` |
| Scheduled scans daily cutoff, `SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD`, $100 | Limits, with the Doppler default | none | free owners' scheduled Scans for the day; their first and manual Scans wait for the first scan limit | paid users, and Scans already under way | a Scan under way, with no word about waiting | raise or clear the override | `apps/worker/schedule.test.ts` |
| Chat daily cutoff, `CHAT_DAILY_SPEND_CUTOFF_USD`, $150 | Limits, with the Doppler default | none | a free user's chat turn, voice request, and message to Carl | paid users, and every page | "Carl is taking a break until midnight UTC. Ask him again then." | raise or clear the override | `apps/api/chat/chatTurnAuthorization.test.ts` |
| First scan limit, `FIRST_SCAN_DISPATCH_LIMIT`, 5 | Limits, with the Doppler default | none | nothing by itself: it paces the waiting Scans, and 0 starts none | every Scan that is not waiting | a Scan under way for as long as it waits | raise or clear the override | `apps/worker/scanQueue.test.ts` |
| Unverified accounts, the unchecked "Allow unverified email sign-ups to scan and chat" | Limits only | none | for a free account that signed up with a password and has not verified its email: its first and manual Scans wait for the first scan limit whatever the day's spend, and chat and voice do not answer | verified accounts, provider sign-ins, and paid accounts | a Scan under way for as long as it waits, and in chat "Carl will answer once your email is verified. Check your inbox." | check the box again; a Scan that was waiting starts on the next sweep | `packages/db/dailySpendCutoffs.test.ts`, `apps/api/chat/chatTurnAuthorization.test.ts`, `apps/api/chat/voiceAuthorization.test.ts` |
| Pause new podcast episodes | Limits only | none | every new podcast episode and recording, whoever it bills | the Scan, its Findings, and its email; a recording under way; every published podcast episode, the feeds, and voice | a Scan with no new podcast episode | turn it off; a skipped podcast episode is not recorded later | `packages/pipeline/podcast/planPodcastEpisode.test.ts` |
| Pause new films | Limits only | none | the film of a podcast episode that publishes while it is on | the podcast episode as audio; a render under way; ready films; a film's rebuild; the backfill | a podcast episode with no film | turn it off; only the backfill renders a skipped film, for each Topic's latest podcast episode | `apps/worker/workflows/recordPodcastEpisodeActivities.test.ts` |
| Generated image limit, over `TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT`, 40 | Limits, with the Doppler default | none for Limits, the worker for Doppler | at 0, every generated chapter image in the films rendered meanwhile | the film renders with its Resource Images, the podcast card, and its own image | a film with fewer generated images, for good | clear the override | `packages/pipeline/topicPodcastEpisodeVideo/videoChapterImages.test.ts` |
| Show only pinned items on the home | Limits only | none | every unpinned card in the home's seven sections, within a minute for a signed-in user and about three for a visitor | pinned items, Your topics, the news, every item at its own url, and the Topics directory | a home with fewer cards, and no copy | turn it off | `apps/api/home/homeCardIds.test.ts` |
| `SCAN_DISPATCH_LIMIT`, 100 | Doppler | none: the sweep's next run | at 0, every scheduled Scan and every Scan that was opened and never started | waiting Scans within the first scan limit; Scans the api starts; every Topic stays scheduled | a scheduled Scan that comes later | remove the value | `apps/worker/scanQueue.test.ts`, `packages/server/scanSettings.test.ts` |
| `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY`, 1 | Doppler | the worker | at 0, the film backfill's start and its Worker; a backfill under way waits at its next step | a new podcast episode's film, and rebuilds | nothing | remove the value and restart the worker | `packages/server/podcastEpisodeSettings.test.ts` |
| `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY`, 1 | Doppler | the worker | at 0, both film Workers, the backfill, and a new podcast episode's film. The api still queues a rebuild, which waits until films are on again | recording, and ready films play | a new podcast episode with no film | remove the value and restart the worker | `packages/server/podcastEpisodeSettings.test.ts`, `apps/worker/workflows/recordPodcastEpisodeActivities.test.ts` |
| Mobile minimum version | the admin console's **Mobile app** section | none, within 60 seconds | every api request from an older build, with a 426 | the web, and newer builds | "Carl needs a newer app" with the store link | lower the minimum | `apps/api/appVersionGate.test.ts` |
| Edge purge | `bun run edge:purge`, and every release | none | nothing. It empties the edge, so every visitor page reaches the origin until the edge fills again | everything | nothing | none needed | `apps/api/edgeCache.purge.test.ts` |
| `PODCAST_SPEECH_MODEL` set empty | Doppler | `app` and the worker | far more than recording: it hides every published podcast episode from its Topic's page and its own page, the public and listener feeds respond 404, podcast episodes leave the sitemap, voice chat and spoken replies turn off, and a podcast episode being recorded fails at its next chapter. A Topic Post Discussion still starts and pays for its script, then fails at the speech call | Scans, chat in text, and Topic Posts | no podcast section, a missing page, and a feed that is gone | set the model again and restart both | `packages/pipeline/podcast/planPodcastEpisode.test.ts` |

### Rollback

- **Roll a request-serving service back by itself.** In Northflank, open the `app` service, pick the previous build
  from its list of builds, and deploy it to that service alone. The database stays at the new release's schema,
  because the release migrates before any service deploys and no migration is undone.
- **Never roll the worker back past a `patched` workflow change.** `patched` lets an old workflow history replay on
  new code, never a new history on old code. A workflow that recorded the patch would no longer replay on the older
  worker, and it would stay stuck until the worker moves forward again. Fix the worker forward.
- **A migration adds in one release and removes in a later one.** That keeps the previous build running against the
  schema. A test in `packages/db/schema.test.ts` fails a migration that holds `DROP COLUMN`, `DROP TABLE`, or
  `RENAME` unless its first comment says the previous release no longer reads what it removes.
- **Freeze deploys by taking the push trigger off `release-main`.** Every push to `main` releases, a docs commit
  included. To freeze, apply [infra/northflank/release-main.json](../../infra/northflank/release-main.json) with an
  empty `triggers` list, using `northflank create workflow`, or remove the trigger in the workflow's settings in the
  console. To deploy again, apply the file as it is committed. During a freeze `release-main` still runs by hand
  from the console.
- **Every deploy purges the edge.** After a deploy or a rollback of `app` every visitor page reaches the origin until
  the edge fills again, so a deploy during a wave adds load at the worst time.

## Recovery

What each store holds, what losing it costs, and how the data comes back. A fact that only a dashboard knows is
marked **Owner** and is not stated here.

### Postgres

Neon holds every row: accounts, Topics, Findings, chat, and the pointers to every stored object. **Owner:** the
plan, the restore window, and the branches. The privacy page promises that deleted data leaves backups within 90
days, so the restore window has to be 90 days or less.

To restore:

1. Pause `app`, `temporal-worker`, the sweep, and the monthly budget reset in Northflank, so nothing reads or writes
   the database while it is restored.
2. Restore to a point in time in the Neon console, on a new branch or in place.
3. Set `DATABASE_URL` in Doppler to the restored database if its address changed.
4. Run the migration job, so the schema matches the deployed code. As in a release, the code starts only after the
   migrations, so it never meets an older schema.
5. Resume `app` and `temporal-worker`, then the sweep and the monthly budget reset. Each reads `DATABASE_URL` at its
   start.

A restore also brings back what it should not, and leaves out what it cannot hold:

- **Rows that people deleted after the restore time come back.** Delete them again by hand, inside the privacy
  page's 90 days: closed accounts, deleted Topics, and removed content.
- **Stored objects are not restored with it.** A row restored after its object was deleted points at nothing.
- **A user's LiteLLM key may be one the proxy has retired.** The app returns a stored key without asking the proxy
  (`packages/models/litellm.ts`), so those users' model calls fail until their keys are replaced.
- **Stripe is mirrored by webhook alone.** Send again, from the Stripe dashboard, the events since the restore time.
- **Encrypted rows need the same `CHAT_TEXT_KEY`.**

### Object storage

One R2 bucket holds every file, through one client (`packages/db/store.ts`). **Owner:** whether the bucket has
versioning or lifecycle rules. Nothing in the repo sets either.

- **Gone for good if deleted:** an avatar, a Topic's attachments, chat and chat room attachments, a Topic Post's
  body images, an uploaded Topic image, and a published podcast episode's audio, which no code records again.
- **Comes back for a cost:** a generated image (one image call, and the new image differs), a film (a render, which
  nothing starts for a film already marked ready), and a Topic Post Discussion (a regenerate, on that person's
  bill).
- **Comes back by itself:** share cards, podcast covers, Dashboard share images, a Resource's content and images,
  link previews, and favicons.

### Redis

Redis holds what can be built again, and a few things that cannot. **Owner:** persistence, `maxmemory`, and the
eviction policy on the `redis` addon. It ran one replica with no backups on 2026-11-13.

A loss of Redis's data costs:

- the buffered daily counts that had not reached Postgres
- the day's view claims, so a repeat view that day counts again
- every day-long count: suggestions, social writes, reports, and Dashboard paragraphs
- the sign-up tokens signed in the last five minutes, so those people pass the challenge again
- the day's opener, and the open spend reservations
- chat room messages published while the subscriber was down
- every cache, which loads again from Postgres

Nobody is signed out: a session is read from Postgres until its next refresh. After Redis returns, the next sweep
builds the unique viewer counters again from Postgres with no step from the owner.

While Redis is unreachable every other request still succeeds, and these fail:

- **Closing an account responds 503**, by design, so a closed account's session cannot survive in Redis.
- **The nightly Dashboard build fails**, because its viewer counts are unions that Redis computes. A Topic Post's
  publish leaves its owner's Specials pages showing their last snapshots. A Topic made private, deleted, or moved to
  another team still deletes its Dashboards' snapshots at once, and those pages stay empty until the next good build.
- **Related reads rank from each process's own copy of the embedding centroid**, kept for an hour. A process with no
  copy computes it once.
- **Not confirmed by a test:** a sign-out during the outage cannot delete the session's Redis copy. If Redis returns
  with its data, the old cookie may work until that session's next refresh, up to a day.

### Temporal

Temporal's store holds the running workflows: Scans, recordings, renders, and the steps after a publish. **Owner:**
the `temporal-db` addon's backups.

**Start a lost store empty. Never restore it from an older copy**, because old workflows would run again against
rows that have moved on. No schedule has to be made again: the sweep starts the nightly Dashboard build, the worker's
start begins the film backfill, and the sweep and the monthly reset are Northflank cron jobs.

A lost workflow leaves its row behind. The sweep handles these:

- **A Scan** that was running is marked failed after 48 hours and 21 minutes, and one that never reached a worker
  after 24 hours and 15 minutes. A Scan that was opened and never started is started again on the next sweep.
- **A Source's screen** starts again on every sweep.
- **Personal sources work** is recovered by the sweep.

Nothing closes these out, so each stays as it is until someone acts on it by hand: a podcast episode at
`recording`, a film at `rendering`, a Topic Post Discussion at `recording`, a Topic image render at `pending`, an
attachment at `pending`, and a Topic Post's steps after its publish (its summary, image, and first discussion).

### LiteLLM's database

LiteLLM's own Postgres holds every virtual key and its budget. If it is lost, every stored key in
`users.litellm_virtual_key` names a key the proxy no longer knows, and those users' model calls fail until each key
is made again. **Owner:** where that database runs and its backups.

The proxy encrypts the provider credentials it stores with `LITELLM_SALT_KEY`, or with `LITELLM_MASTER_KEY` if no
salt is set (`.env.example`). A restored database is unreadable to a proxy that holds another value, so keep a copy
of it with the two secrets below. **Owner:** which of the two production's `litellm` service uses.

### The two secrets

Doppler holds two secrets that cannot be made again without losing data. Keep a copy of each outside Doppler.

- **`CHAT_TEXT_KEY`** encrypts chat text and Personal sources content. Without the same key every encrypted row is
  unreadable for good.
- **`BETTER_AUTH_SECRET`** signs session cookies, unsubscribe links, podcast cover keys, sign-up tokens, and the
  person hashes in the daily counts. A new secret signs everyone out, breaks every unsubscribe link already sent,
  and makes each person count as new in the daily counts.

Cloudflare's rules, Northflank's cron schedules and service sizes, and the Sentry alerts are in no file. The
Services table above and the Deploy alerts section are their only record.
