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
builds the newest commit on `main` once and runs the migration job against it. Only then does it deploy `app`, then
`web`, purge the edge, deploy `temporal-films` and `temporal-worker`, and finish with the docs embed. So new code never
meets an old schema. Each deploy
step waits up to ten minutes for its replicas to run, and a rollout that never runs fails the workflow before the next
step. The workflow's definition is
[infra/northflank/release-main.json](../../infra/northflank/release-main.json). To redeploy `main` by hand, run
`release-main` from the Northflank console.

The `app` and `web` services share one set of startup, readiness, and liveness checks,
[infra/northflank/app-health-checks.json](../../infra/northflank/app-health-checks.json), the `healthChecks` body of
Northflank's `PATCH /v1/projects/carlnotes-prd/services/deployment/app` and of the same call for `web`. Startup polls
`/api/health` every 10 seconds for up to two minutes. Readiness polls `/api/health/ready` every 10 seconds and takes a
replica out of traffic after three misses. Liveness restarts a replica after six missed `/api/health` polls. Both
Northflank files are applied by hand, with the Northflank CLI or console. Apply `release-main.json` with `northflank
create workflow`, which upserts (`update workflow` returns HTTP 500). A deploy step that names a service that does not
exist fails every release, so create a service before applying a workflow that deploys it.

### Services and path routes

One image runs every service, each with its own command. `app` and `web` start the same entry, `apps/api/index.ts`,
and either serves every path. The public domain's path routes decide which one answers.

| Service | Command | Size and replicas | Public paths | Health checks |
|---|---|---|---|---|
| `app` | the image's command, the same as `bun run api` | 1 vCPU and 2,048 MB, 2 to 4 replicas autoscaled at 70% CPU | `/api`, `/mcp`, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` | `app-health-checks.json` |
| `web` | `bun run web` | the same plan and autoscaling as `app` | the base path, and the higher-priority routes below | `app-health-checks.json` |
| `temporal-worker` | `bun run temporal:main` | 2 vCPU and 4,096 MB, 2 to 4 replicas autoscaled on `carlnotes_scan_demand` at 16 | none | none |
| `temporal-films` | `bun run temporal:films` | 4 vCPU and 8 GB, 5 GB disk, `TOPIC_VIDEO_CONCURRENCY=2`, 1 to 4 replicas autoscaled on `carlnotes_film_demand` at 2 | none | none |
| `scan-sweep` cron job | `bun run schedule` | 1 vCPU and 1,024 MB | none | the `scan-sweep` cron monitor |
| `reset-monthly-budgets` cron job | `bun run reset:monthly-budgets` | **Owner** | none | the `reset-monthly-budgets` cron monitor |

The routes of a higher priority than `/api`, all to `web`, so no public image streams through the process that holds
the chat streams:

- every `preview.png` after `/api`: a Topic's, a profile's, a Team's, an invite's, a podcast episode's, and a Topic
  Post's
- the prefixes `/api/podcast-covers`, `/api/favicons`, `/api/avatars`, and `/api/team-avatars`
- the stored image prefixes `/api/topic-images`, `/api/podcast-episode-images`,
  `/api/topic-podcast-episode-video-images`, `/api/topic-post-images`, and `/api/topic-post-body-images`
- the one exact path `/api/health/ready`, so the external monitor watches the service that renders pages

`/api/podcast-feeds` stays on `app`, because its one route counts a play with its place. Northflank's own probes reach
each service by its port, whatever the public routes say. `GET /api/health` names the process that answered, `api` or
`web`, so one request on the public domain shows where a route sends a path.

A page render on `web` reads the api of its own process, because `API_ORIGIN` is unset. The page reads' queries then
run off the process that holds the chat streams, and a render never meets another build's api in the middle of a
release. To try renders that read `app` instead, set `API_ORIGIN` in the `web` service's own Northflank variables,
never in Doppler, where `app` would read it too and call itself over the network.

**Owner:** create `web` by hand before applying `release-main.json`: from the build image, with the command
`bun run web`, the health checks in `app-health-checks.json`, the plan `app` has, and 2 to 4 replicas autoscaled at
70% CPU. Then raise `DATABASE_POOL_COUNT` as [How to add capacity](#how-to-add-capacity) says, restart every process,
apply the workflow, and add the routes. To roll back, point the base path back at `app` and remove the other routes.
No deploy is needed.

The migration job runs:

```bash
doppler run -- bun packages/db/migrate.ts
# or
bun run db:migrate
```

#### An index on a table that already has rows

Build it by hand in production before the push that holds its migration. Every pending migration runs in one
transaction, where Postgres rejects `CREATE INDEX CONCURRENTLY`, so a migration's plain `CREATE INDEX` would block
every write to its table while it builds, and the role's 30-second statement timeout would cancel a long build and
fail the release. A new table's indexes are created with the table and need none of this.

1. Connect to production with `psql` and turn the statement timeout off for the session: `SET statement_timeout = 0;`.
2. Run each `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statement by itself, outside a transaction.
3. Check that every build finished: `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;` returns no row.
   A build that failed leaves an invalid index under its name, which the migration's `IF NOT EXISTS` would skip for
   good. Drop it with `DROP INDEX CONCURRENTLY "<name>";` and build it again.
4. Push. The migration opens with a 3-second lock timeout and declares each index with `IF NOT EXISTS`, so it finds
   them built and adds nothing.

The launch hardening release holds eleven, in `0187_launch_hardening.sql`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "episodes_recording_created_idx" ON "episodes" USING btree ("created_at") WHERE "episodes"."status" = 'recording';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_turns_created_idx" ON "chat_turns" USING btree ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "personal_source_distillation_spends_created_idx" ON "personal_source_distillation_spends" USING btree ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "episodes_created_idx" ON "episodes" USING btree ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "topic_videos_created_idx" ON "topic_videos" USING btree ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "scans_started_idx" ON "scans" USING btree ("started_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "scans_running_started_idx" ON "scans" USING btree ("started_at","id") WHERE "scans"."status" = 'running';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "topic_image_renders_created_idx" ON "topic_image_renders" USING btree ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "topic_post_discussions_created_idx" ON "topic_post_discussions" USING btree ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sources_pending_topic_idx" ON "sources" USING btree ("topic_id") WHERE "sources"."status" = 'pending';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_created_idx" ON "users" USING btree ("created_at");
```

The page reads release holds one more, in `0188_episodes_published_at.sql`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "episodes_published_at_idx" ON "episodes" USING btree ("published_at" DESC NULLS LAST) WHERE "episodes"."status" = 'published';
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

The edge purge is a deploy job too. It runs right after `app` and `web` deploy and clears the pages and the signed-out
feed that Cloudflare shares, so no cached page names assets the old build had. It needs `CLOUDFLARE_ZONE_ID` and
`CLOUDFLARE_API_TOKEN`. Without them, or if Cloudflare rejects the purge, the job logs why and the release goes on.
After the purge, `bun run check:edge` checks that each shared path is stored at the edge again, as Edge cache below
says. Those pages leave the edge within two minutes without a purge:

```bash
doppler run -- bun apps/api/edgeCache.purge.ts
# or
bun run edge:purge
```

The temporal workers are their own services and the scan sweep a cron job, all built from this same image with the
command overridden. They pick up new code on every deploy, as the api does. `schedule` decides what to scan and
`temporal` does the scan work. Each starts through a root script, so the command Northflank runs never names a file
path and survives a file move. `temporal-worker` runs `bun run temporal:main` and `temporal-films` runs
`bun run temporal:films`. With no queue group set, one process hosts every Worker, as in development:

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

Set `OPENAI_API_KEY` on the Northflank `litellm` service before deploying the app that calls the
`image-moderation` alias. The app also uses `OPENAI_API_KEY` to enable image moderation.

## Edge cache

Cloudflare's cache rules, its bypass rule, and its zone settings live in the carlnotes.com zone, not in the repo. This
section is their record. The origin decides what is shared: a response is stored at the edge only if a rule below makes
its path eligible and the origin sends it `CDN-Cache-Control` or a public `Cache-Control`. A response without a
`Cache-Control` header is never stored. `bun run check:edge` reads the live result after a release.

SSL/TLS:

- Overview: encryption mode **Full (strict)**. Northflank serves a certificate valid for carlnotes.com.
- Edge Certificates: **Always Use HTTPS** on, **Minimum TLS Version** 1.2.

Caching → Configuration:

- **Caching Level**: Standard, so the query string is part of the cache key and `?v=` works.
- **Browser Cache TTL**: Respect Existing Headers. A fixed value would replace `no-cache` on the way to the browser.

Caching → Tiered Cache: **Smart Tiered Cache Topology** on, so a miss in one data center asks an upper tier before the
origin.

Caching → Cache Rules, in this order. The last matching rule wins a conflict, so the bypass comes second.

1. **Cache by the origin's headers**
   - Expression:
     ```
     (not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/mcp") and not starts_with(http.request.uri.path, "/.well-known/acme-challenge/"))
     or http.request.uri.path eq "/api/topic-feed"
     or http.request.uri.path eq "/api/home"
     or (starts_with(http.request.uri.path, "/api/") and ends_with(http.request.uri.path, "/page"))
     or starts_with(http.request.uri.path, "/api/counts/")
     or starts_with(http.request.uri.path, "/api/status/")
     or (starts_with(http.request.uri.path, "/api/topics/") and http.request.uri.query contains "poll=1")
     or starts_with(http.request.uri.path, "/api/dashboards/")
     or starts_with(http.request.uri.path, "/api/avatars/")
     or starts_with(http.request.uri.path, "/api/team-avatars/")
     or starts_with(http.request.uri.path, "/api/favicons/")
     or ends_with(http.request.uri.path, "/preview.png")
     ```
   - Cache eligibility: Eligible for cache.
   - Edge TTL: Use cache-control header if present, bypass cache if not.
   - Browser TTL: Respect origin.
   - Cache key: the default, which includes the whole query string.
   - Serve stale content while revalidating: on.
2. **Bypass signed-in requests**
   - Expression:
     ```
     http.cookie contains "better-auth.session_token=" or http.cookie contains "better-auth-session_token="
     or any(http.request.headers["authorization"][*] ne "")
     ```
     The cookie names match every name `getSessionCookie` accepts, the `__Secure-` names production uses included. The
     `Authorization` clause keeps a bearer token's request from reading a visitor's stored copy. Confirm the rule
     editor accepts it, because a zone's plan limits which header fields a cache rule reads.
   - Cache eligibility: Bypass cache.

The page reads are `/api/profiles/:userId/page`, `/api/topics/:id/page`,
`/api/topics/:id/episodes/:season/:episodeNumber/page`, `/api/topic-posts/:id/page`, and `/api/teams/:id/page`. A
Dashboard's page read is after `/api/dashboards/`, which the rule already named.

**Manual step for the launch-hardening-page-reads release.** The zone's rule 1 before this release names
`/api/topic-feed`, `/api/counts/`, `/api/dashboards/`, the avatars, the team avatars, the favicons, and the cards. Edit
it to the expression above, which adds `/api/home`, the page reads, `/api/status/`, and a topic page's poll reload,
and add the `Authorization` clause to rule 2. Until then `bun run check:edge` fails on each of those paths with
`DYNAMIC`. Then set `PAGE_READS_EDGE_CACHED=true` in Doppler prd and restart the `app` and `web` services. Until the
setting is on, every page read, status read, and poll reload is sent `private`, which Cloudflare reports as `BYPASS`,
so the check fails on those paths whatever the rule says. Run the check after both. A third rule after the bypass, for
the versioned public file paths, is a separate manual step: it serves a public image from the edge to a signed-in
request too, and the check's card read with a made-up session cookie fails with anything but `HIT` until it exists.

What the rules never cache: every other api route, every authenticated one included, the SSE streams after `/api/`, and
`/mcp`. Also any response without a `Cache-Control` header, any response the origin marks `private` or `no-store`, and
any response with `Set-Cookie`. Cloudflare does not cache a `Set-Cookie` response while Origin Cache Control is on, and
the origin never marks one shared.

Security → WAF → Custom rules, first in the list:

- **Let certificate renewals through**: expression `starts_with(http.request.uri.path, "/.well-known/acme-challenge/")`.
  Action **Skip**: all remaining custom rules, all rate limiting rules, all managed rules, and every component under
  "More components to skip". Log matching requests on.
- Security → Bots: **Bot Fight Mode** off. A custom rule cannot skip it, and it can challenge the certificate
  authority.

Features that rewrite the HTML, all off: Rocket Loader, Email Address Obfuscation, Automatic HTTPS Rewrites, Cloudflare
Fonts, and Web Analytics' automatic setup. A server-rendered page that changes in transit no longer matches what the
client hydrates, and the content security policy blocks an injected script.

Compression: Cloudflare's default, on. No compression rule is needed.

The purge token: My Profile → API Tokens → Create Token, permission **Zone → Cache Purge → Purge**, zone resources
**carlnotes.com** only. It is saved in Doppler prd as `CLOUDFLARE_API_TOKEN`, beside `CLOUDFLARE_ZONE_ID` from the
zone's Overview page. A purge that Cloudflare rate limits waits as long as its `Retry-After` names, at most a minute,
and is sent once more.

### Checking the edge after a release

`bun run check:edge` is read-only and sends GET requests alone. It reads the live sitemap for one Topic, podcast
episode, Topic Post, and team, and the Topic's page read for its owner. It then requests each shared path twice: the
pages, the documents, `/api/topic-feed`, `/api/home`, each page read with the owner's profile and both Dashboards, and
the Topic's Scan status. It fails on a second response whose `cf-cache-status` is `DYNAMIC` or `BYPASS`, on an error
status, and on a response with no `cf-cache-status`, and it names each failing path. It also reads a Topic's card at
its versioned url with a made-up session cookie, which fails on anything but `HIT`. It takes the origin,
`https://carlnotes.com` by default, then any further shared paths, such as another status read:

```bash
bun run check:edge
bun run check:edge https://carlnotes.com /api/status/<subject>
```

## Spend control settings

Six Doppler settings set the defaults of the daily spend controls. Each one is optional, and an unset, empty, or
invalid value reads as the built-in default. Zero reads as the default too, except for `FIRST_SCAN_DISPATCH_LIMIT`,
where zero starts no waiting scans, and `TOPIC_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT`, where zero
turns generated images off. The admin console overrides each one without a deploy or a restart, and clearing an
override returns to the Doppler value.

| Setting | Default | What it sets |
|---|---|---|
| `PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD` | 65 | the day's free-plan spend past which a free user's podcast episodes after a topic's first are skipped |
| `SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD` | 100 | the day's free-plan spend past which a free user's scheduled scans wait for the next day, and their first and manual scans wait for the first scan dispatch limit |
| `CHAT_DAILY_SPEND_CUTOFF_USD` | 150 | the day's free-plan spend past which a free user's chat with Carl pauses until midnight UTC |
| `FIRST_SCAN_DISPATCH_LIMIT` | 5 | how many waiting scans one sweep starts, oldest first. Zero starts none |
| `HOURLY_SIGNUP_ALERT_COUNT` | 50 | the accounts created in an hour at which the sweep crosses the `hourly-signups` threshold |
| `TOPIC_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT` | 40 | how many generated images one film draws at most. The console takes 0 to 1,000 |

Four permissions have no Doppler setting. Each is on by default in the console. Turning one off has these effects.

- **Allow unverified email sign-ups to scan and chat.** The first and manual scans of a free account that signed up with a password
  and has not verified its email wait for the first scan dispatch limit, whatever the day's spend, and Carl does not
  answer that account in chat or voice.
- **Allow new podcast episodes.** No scan records a new podcast episode.
- **Allow new films.** A podcast episode that publishes gets no film.
- **Allow unfeatured items on the home page.** The home's sections list their featured items alone.

The free-plan spend that the three cutoffs read sums what bills a free user who is not an admin, the user's own rows
in the `spends` table among them: a url attachment's fetch, a url Source's check, and a source suggestion's search.
A `spends` row with no user is the platform's own cost: a backfilled film's render minutes and images, a Free
owner's first animated picture of the month, the topic memory backfill's model calls, and text moderation. No cutoff
and no user's monthly budget reads the platform's spend. The day's spend line and its alert do.

The `spend_control_settings` row stores the numeric overrides and the restrictions behind the permission switches.
The [Launch runbook](#launch-runbook) lists what each restriction stops and when it takes effect.

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

## Job monitors

Every Northflank job runs its command through `apps/worker/runMonitoredJob.ts`, inside `doppler run`. The two cron
jobs each have a Sentry cron monitor, named for the job. A run checks in when it starts and again with its result, and
the check-in creates or updates the monitor from the schedule in that file.

| Monitor | Schedule (UTC) | Margin | Longest run | Alerts after |
| --- | --- | --- | --- | --- |
| `scan-sweep` | every 15 minutes | 5 minutes | 10 minutes | 2 missed or failed runs |
| `reset-monthly-budgets` | 00:05 daily | 30 minutes | 60 minutes | 1 missed or failed run |

A run that never starts its command, such as one whose Doppler token is revoked, sends no check-in. Its monitor reports
the run as missed. A change to a job's Northflank cron schedule or time limit changes its monitor in the same commit.

A sweep run counts as failed if any of its stages threw. Each stage runs in its own try, so the stages after a failed
one still run: one failure never skips the viewer counts, the daily counts, the deletion retries, the emails, or the
day's spend. The run then exits with code 1 once its reports are sent. A sweep that stops running and a sweep that
keeps failing a stage both reach the owner through `scan-sweep`, after two runs in a row.

Every sweep run is a new process, so the hourly limits that a long-running process keeps in memory would start from
zero on each run. Each error report and threshold warning from the sweep first takes a one-hour slot in Redis, under
`sweep-report:` and the report's stage and message or the warning's condition. One sweep in the hour sends it and the
others send nothing. If Redis cannot say, the report is sent. The sweep reports:

- **A scan queue it could not read**, in the `scheduled-scan` stage with the queue's name. That run starts no scheduled
  Scan, and every Topic stays scheduled for the next one.
- **A start that could not reach Temporal**, once. It is that run's last start, for the scheduled Scans, the rows that
  were never dispatched, and the pending Source screens, because each later start would wait out its own deadline.
- **A daily count batch that could not be saved**, in the `database` stage, with how many sweeps in a row have failed
  one. A take that found Redis down is reported too, and so is a failed batch that Redis could not put back, which is
  lost.
- **A stage that threw**, under its own stage, with the stage's name in `sweepStage`.

The release jobs, `migrate`, `docs-sync`, and `edge-purge`, have no schedule for a monitor to miss. A release job that
exits non-zero is reported as an error under the `job` stage. One that fails before its secrets load fails the
`release-main` workflow. Only a Northflank notification for a failed workflow run reports that. **Owner:** turn it on in
Northflank's notification settings for the `carlnotes-prd` project, by email.

**Connect each monitor to the alerts.** **Owner:** a monitor exists only after its first check-in. After the first deploy
with the monitors, open **Monitors** in Sentry. Wait for `scan-sweep` to appear, and for `reset-monthly-budgets` after
00:05 UTC. Add both to the **prd: monitors (uptime + error spike)** automation, which already emails the owner for the
uptime checks. The push to the Sentry mobile app follows the notification settings under [Deploy alerts](#deploy-alerts).

## Launch runbook

Read this while a wave of new people arrives. It is ordered on purpose: the checks to make before the wave, what to
watch, how to add capacity, and only then the switches. Meet load with capacity first. Every switch takes something
away from someone, so each is a last resort.

### Before the wave

Each step says where to look and what value is wanted. A fact that only a dashboard knows is marked **Owner** and is
filled in by hand.

1. **Size the cutoffs for the wave.** The three daily spend cutoffs are thresholds in force at their defaults ($65,
   $100, and $150). A new free user costs about $0.66 on their first day against the cutoffs: a Scan $0.098, a short
   podcast episode $0.218, and a film $0.240, measured 2026-11-13, and about 10 cents for the animation plans of a
   version 4 film, estimated 2026-11-19. So 3,000 signups spend about $1,980 and the $100 cutoff passes after 150 to
   1,000 signups. Past it every free user's first and manual Scan waits, and past $150 chat pauses for every free
   user until midnight UTC. In the admin console's **Limits** section, set the three cutoffs to the expected signups
   times $0.66 with the margin you choose, and set **First scan limit** to the waiting Scans you want started each
   sweep. Production's sweep runs every 15 minutes, so a limit of 5 starts 20 waiting Scans an hour. The platform
   also pays about 36 cents for each Free owner's first animated picture of the month, about $1,080 for 3,000
   signups. No cutoff reads the platform's own spend. The day's spend line shows it as `platformDollars`, inside
   `totalDollars`, so size `GLOBAL_DAILY_SPEND_ALERT_USD` in step 3 with it.
2. **Add three Sentry rules.** The four Deploy alerts above miss a threshold warning and a repeating error. In
   Sentry, **Alerts → Create Alert → Issues**, for the `prd` environment, each notifying the owner:
   - Every threshold warning: when "The issue is seen more than 0 times in one hour", if "The event's tags match
     `alert` equals `performance`". The app sends each condition under a fixed fingerprint, so "A new issue is
     created" fires only the first time a condition is ever crossed.
   - A repeating error: when "The issue is seen more than 5 times in 15 minutes". One repeating error sends at most
     20 events an hour, which never reaches the error rate alert's 50 in 5 minutes.
   - No Temporal worker, or a Temporal server that cannot be read: when "The issue is seen more than 0 times in one
     hour", if the event's message contains any of `no temporal worker is polling the scan queue`,
     `no temporal worker is polling the film queue`, `could not read the scan task queue`, and
     `could not read a task queue`.
3. **Set the spend alert.** Set `GLOBAL_DAILY_SPEND_ALERT_USD` in Doppler to the day's spend that should warn you.
   Unset, the sweep logs the day's spend and warns nobody. The sweep reads it at its next run, with no restart.
4. **Close the origin to everything but the edge.** **Owner:** in Northflank, add an IP policy on the `app` service's
   public port that allows Cloudflare's published address ranges alone. Without it a request to the service's own
   hostname skips the edge cache and Cloudflare's protection, and each one is a server render.
5. **Send the visitors' places.** **Owner:** in Cloudflare, **Rules → Transform Rules → Managed Transforms**, turn on
   **Add visitor location headers**. Without it Cloudflare sends only `cf-ipcountry`, so the Specials maps and the
   paragraph's places stop at the country. A view counted before the switch keeps its country alone.
6. **Read each service's termination grace.** **Owner:** in Northflank, each service's advanced deployment settings. The
   worker gives a running activity two minutes to finish on a stop (`SHUTDOWN_GRACE_MS` in
   `apps/worker/temporalWorkers.ts`), so `temporal-worker` needs a grace period longer than two minutes. `app` and `web`
   drain for up to 125 seconds on a stop: 5 seconds of answering while the platform stops routing to the replica
   (`API_DRAIN_ROUTING_GRACE_MS`), then up to 120 seconds for the requests in flight (`API_DRAIN_LIMIT_MS`), so each
   needs a grace period of 150 seconds, which also covers the flush's 10 seconds. A drain ends as soon as its last
   request does, so a quiet replica stops in seconds. A chat reply that streams past the limit is cut. To let a longer
   reply finish across a deploy, raise the service's grace period and `API_DRAIN_LIMIT_MS` together, and to stop sooner,
   lower both. Record each value in the Services table below.
7. **Give the film service its two slots and its autoscaling.** **Owner:** in Northflank, on `temporal-films`: set
   `TOPIC_VIDEO_CONCURRENCY=2` in the service's own environment, raise its disk from 2 GB to 4 GB, and turn on
   autoscaling from 1 to 4 replicas on the custom metric `carlnotes_film_demand` at a target of 2, read from
   `/metrics` on port 9464. If the plan has no custom metric autoscaling, scale on cpu at 70%. Then raise
   `DATABASE_POOL_COUNT` for the replicas the autoscaler may add, as How to add capacity says. With the release that
   adds them, `temporal-worker` polls `episode-video-writes`, which every new film's first step waits on, and
   `temporal-films` polls `episode-video-rebuilds`: check both in the Temporal UI after that release.
8. **Give the main worker its autoscaling and check its new queues.** **Owner:** in Northflank, on
   `temporal-worker`: turn on autoscaling from 2 to 4 replicas on the custom metric `carlnotes_scan_demand` at a
   target of 16, read from `/metrics` on port 9464, or on cpu at 70% if the plan has no custom metric autoscaling.
   Count four `temporal-worker` replicas in `DATABASE_POOL_COUNT`, two pool shares each. After the release that
   adds them, check in the Temporal UI that `topic-scans-scheduled` and `episode-encodes` each have a poller: a
   scheduled Scan starts on the first, and every podcast episode's encode waits on the second. The release also
   adds the settings `SCHEDULED_SCAN_CONCURRENCY` (8) and `PODCAST_ENCODE_CONCURRENCY` (2), which need no value in
   Doppler at their defaults, and raises `SCAN_CONCURRENCY`'s default from 8 to 16. If Doppler sets
   `SCAN_CONCURRENCY=8`, remove it to take the new default.
9. **Read each plan and quota.** **Owner**, each in its own dashboard. The wanted value is room for the wave: a
   quota that runs out fails quietly.
   - Sentry: the plan's monthly errors and spans. Past the quota Sentry drops errors and the alerts stop with them.
   - PostHog and Langfuse: the plan's monthly events and traces.
   - Resend: the plan's daily and monthly emails, and its requests a second. The app sends at most nine a second.
   - Fireworks, and Gemini speech and images: the spend limit and the requests a minute on each key.
   - Exa and Firecrawl: the plan's monthly searches and scrapes. A spent Firecrawl credit warns once an hour as
     `firecrawl-credit-spent`, and until it is topped up every new page is scored on its snippet and read again by
     the next Scan that finds it.
   - YouTube: the Data API's daily units, 10,000 by default.
   - Google Maps: the daily map loads on the Dashboard map's key.
   - The moderation endpoint: the requests a minute on `OPENAI_API_KEY`. Its limit is recorded nowhere.
   - Redis: `maxmemory` above zero, which the memory warning needs, and the eviction policy `noeviction`. Another
     policy drops a buffered count or a spend reservation without an error. The minute line showed `maxMemoryBytes`
     at 332 MB on 2026-11-13.
   - Neon: the compute's maximum size. The pools were sized from `max_connections` 901 on 2026-11-13.
   - Temporal: the free disk on the `temporal-db` addon, 20 GB on 2026-11-13.
10. **Freeze deploys if you want none during the wave.** See Rollback below. A docs commit deploys too.
11. **Check the store links.** The docs' Get the app page (`apps/docs/src/content/docs/get-the-app.md`) links to the
   live App Store and Google Play listings. Its App Store line was still a placeholder on 2026-11-13.
12. **Check the edge cache.** Run `bun run check:edge` after the release before the wave, once the rules are edited
   and `PAGE_READS_EDGE_CACHED` is on. Every line must read `ok`. A `DYNAMIC` line names a path the zone's cache rules
   leave out, and a `BYPASS` line on a page read means the setting is off: fix it as Edge cache above says, and run the
   check again.

Three things stay unguarded after this work:

- Text moderation lets text through if its check cannot run.
- A generated image gets no image check, and only a film's chapter images are checked.
- An unset `OPENAI_API_KEY` skips every image check with no report, so every upload posts unchecked. With the key set,
  an upload whose check fails is saved as unchecked until the sweep can check it, and a worker with no key keeps every
  image unchecked.

### What to watch

Each process logs one line a minute, and the sweep logs the day's spend every run. The spend is summed at most once in
five minutes, so a sweep that runs more often logs the same figures until then. Filter the service's logs in Northflank
on `"gauges":"runtime"` or `"gauges":"daily-spend"`. A crossed threshold also sends one Sentry warning an hour for each
condition, tagged `alert: performance`.

The normal ranges below are the median, the 99th percentile, and the largest value in the lines of 2026-11-06 18:00
UTC to 2026-11-13 18:00 UTC: 20,100 from `app`, 20,088 from `temporal-worker`, and 672 from the sweep. That was a
quiet week before launch, so a wave reads above them. Read them again after the wave.

The api's minute line, from each `app` replica. Each `web` replica writes the same line with `"process":"web"`, and
its event loop warns at the same two readings:

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
| `renders.waitedCount` of `renders.startedCount` | no lines before this release | none | it climbs minute after minute: the replicas are full, so raise the autoscaler's maximum before renders start to shed |
| `renders.shedCount` of `renders.startedCount` | no lines before this release | `render-shed` above 0 | it is above 0 for more than a minute: add a replica of the service that renders pages |
| `residentMemoryMb` | 550 to 595 in the built image under 16 visitors' renders, 2026-11-20 | none | on `app` it passes 700 MB: two attachment reads may take 512 MB each beside it on a 2,048 MB replica, so raise the plan's memory |
| `coverChainLength` | no lines before this release | none | it stays above 2: podcast covers are being drawn by requests, one a second, in a child process of 340 MB |

The worker's minute line, from each `temporal-worker` replica, adds the queues it gauges:

| Field | Normal range | Warning | Add capacity if |
|---|---|---|---|
| `scanQueue.backlogCount` | 0, 0, 0 | none | it grows from one minute to the next |
| `scanQueue.oldestBacklogAgeMs` | 0, 0, 0 | `scan-backlog` past 15 minutes | it passes 5 minutes |
| `scanQueue.pollerCount` | 2, 4, 6: one for each replica, more while a deploy overlaps | the sweep's "no temporal worker" error at 0 | never: at 0 the worker is down |
| `scheduledScanQueue.backlogCount` | no lines before this release | none: the sweep's dispatch limit bounds it | it stays near `SCAN_DISPATCH_LIMIT` from one sweep to the next: add a replica |
| `scheduledChapterQueue.oldestBacklogAgeMs` | no lines before this release | `scheduled-chapter-backlog` past an hour | it passes 15 minutes: raise `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY` or add a replica |
| `podcastEncodeQueue.oldestBacklogAgeMs` | no lines before this release | `podcast-encode-backlog` past 15 minutes | it passes 5 minutes: add a replica, and keep `PODCAST_ENCODE_CONCURRENCY` at the replica's cores |
| `topicMemoryQueue.oldestBacklogAgeMs` | no lines before this release | `topic-memory-backlog` past 15 minutes | it passes 5 minutes: raise `TOPIC_MEMORY_CONCURRENCY` |
| a queue's field reads `null` | never | the worker's "could not read a task queue" error | never: the worker cannot reach Temporal |
| `pool.waitingCount` | 0, 0, 16: one minute of the week, with the pool full at 81 | `pool-waiting` above 0 | it is above 0 for more than a minute |
| `eventLoopDelayMs.p99Ms`, `maxMs` | 0, 21, 50 and 10, 76, 2,393 | none for the worker | never by itself |

Each line names its replica's queue group in `queueGroup`. A `temporal-films` replica's line has the film queues in
place of the scan queues:

| Field | Normal range | Warning | Add capacity if |
|---|---|---|---|
| `topicVideoQueue.oldestBacklogAgeMs` | no lines before this release | `topic-video-backlog` past an hour | it passes 15 minutes: add a `temporal-films` replica |
| `topicVideoQueue.pollerCount` | one for each film replica | the sweep's "no temporal worker is polling the film queue" error at 0 | never: at 0 no film replica runs |
| `topicVideoWriteQueue.oldestBacklogAgeMs` | no lines before this release | `topic-video-write-backlog` past 15 minutes | never: no `temporal-worker` replica polls `episode-video-writes`, and every new film waits at its first step |
| `topicVideosLeftCount` | no lines before this release | none | never: it is the backfill's work left, each Topic's latest podcast episode with no film and each ready film below the current render version |

The minute lines have the `topic-scans`, `episode-scheduled-chapters`, `topic-memories`, `episode-videos`, and
`episode-video-writes` queues. Read every other queue's backlog in the Temporal UI, or with `temporal task-queue
describe --task-queue <name>`.

The sweep's lines, every 15 minutes:

| Line | Normal range | Warning | What it means |
|---|---|---|---|
| `"gauges":"daily-spend"` `totalDollars` | a day's largest total ran from $1.11 to $22.73 | `daily-spend` at `GLOBAL_DAILY_SPEND_ALERT_USD` | compare it with the cutoffs you set in step 1 |
| the same line's `platformDollars` and `otherDollars` | no lines before this release | none | the platform's own spend, which no cutoff reads, and the users' paid fetches and searches, both inside `totalDollars` |
| the same line's `newUserCount` | 0 to 2 a day | `hourly-signups` at the hourly signup alert, 50 by default | the wave has started |
| `scheduled scan sweep: ...` | 0 started on most runs | none | "left for the next sweep behind the backlog" above 0 means the scan dispatch limit held Scans back, and "because Temporal could not be reached" above 0 means the sweep could not read the queue or start a Scan |
| `dispatching ... waiting scans` | not logged while nothing waits | none | Scans are waiting on a cutoff or on the unverified accounts switch |

### How to add capacity

Every process holds a database pool, so the pool count comes first.

1. **Raise the pool count, then restart.** One pool share is the connection pooler's share of `max_connections`
   divided by `DATABASE_POOL_COUNT`, 10 in production on 2026-11-13 (81 connections a share). An `app` replica, a `web`
   replica, a `temporal-films` replica, the sweep, and the monthly budget reset each hold one pool share, and a
   `temporal-worker` replica holds two, because a worker replica peaked at 78 open connections where an `app` replica
   peaked at 28. Count the pool shares that can be held at once after the change, with every service at its
   autoscaling maximum, and add three for the replicas a rolling deploy overlaps with and the release jobs: 25 with
   `app`, `web`, `temporal-worker`, and `temporal-films` at four replicas each. Set `DATABASE_POOL_COUNT` in Doppler
   to that number and restart every service before adding a replica. A process reads the setting only at its start,
   and its startup line reads `database pool sized to 64 connections, 2 of 25 pool shares, from max_connections 901`.
2. **Add the replicas or the size**, in Northflank, from the table below.

| Service | What it runs | Size and replicas | Termination grace | Health checks | To add capacity |
|---|---|---|---|---|---|
| `app` | the api, the MCP server, and every stream | 1 vCPU and 2,048 MB, 2 to 4 replicas autoscaled at 70% CPU | 150 seconds | startup and liveness on `/api/health`, readiness on `/api/health/ready` | raise the autoscaler's maximum, then the plan |
| `web` | every page render, document, and public image, once its routes are added | the same as `app` | 150 seconds | the same as `app` | raise the autoscaler's maximum, then the plan |
| `temporal-worker` | every Temporal queue but the three that render films, with the films' short writes | 2 vCPU and 4,096 MB, 2 to 4 replicas autoscaled on `carlnotes_scan_demand` at 16, 2 GB disk | 150 seconds | none | raise the autoscaler's maximum, or add replicas by hand |
| `temporal-films` | the film queue, the rebuild queue, and the backfill's queue | 4 vCPU and 8 GB, 1 to 4 replicas autoscaled on `carlnotes_film_demand` at 2, 5 GB disk, `TOPIC_VIDEO_CONCURRENCY=2` | 180 seconds | none | raise the autoscaler's maximum, or add replicas by hand |
| `temporal` | the Temporal server | 1 vCPU and 1,024 MB, 1 replica | **Owner** | TCP liveness on 7233 | raise the plan |
| `litellm` | the proxy in front of every model call | 1 vCPU and 4,096 MB, 2 replicas | **Owner** | liveness on `/health/liveliness` | add replicas |
| `redis` addon | Redis 8.10.1, eviction `allkeys-lru` | 0.2 vCPU and 512 MB, 1 replica, 6 GB NVMe disk | not applicable | the platform's | raise the plan |
| `temporal-db` addon | Temporal's Postgres 16 | 1 vCPU and 4,096 MB, 2 replicas with automatic failover, 20 GB disk | not applicable | the platform's | raise the plan or the disk |

The sizes were read on 2026-11-13, and the `app`, `web`, `temporal-worker`, `temporal-films`, and `redis` rows again
on 2026-11-20.
| `scan-sweep` cron job | the sweep, every 15 minutes, one at a time, 10 minutes at most | 1 vCPU and 1,024 MB | not applicable | none | raise the plan |

A visitor's page render past `RENDER_CONCURRENCY`, 16 on a replica by default, waits up to `RENDER_SLOT_WAIT_MS`, 2
seconds, for a free slot, so a short burst becomes slower pages instead of errors. Only a render whose wait ends with
no free slot gets "CarlNotes is busy, this page will try again in a moment" with a retry of two to six seconds. The
minute line's `renders` counts the waits and the sheds apart: waits alone say the replica is full, and a shed says it
needs another replica, `web` once its routes are added and `app` before. Raising either setting needs a restart of
that service.

Keep the limit at 16. On 2026-11-20 a burst of 120 requests against a public topic page in dev, run three times at 16,
held the event loop for 427 to 453 ms at its worst, past the 100 ms warning. The wait rendered all 120 in two of the
three runs and shed 14 in the third. The readings are in `logs/launch-hardening/page-reads/render-limit/`. Load past one
replica's renders goes to another replica, not a higher limit.

A chat post over 3.25 MB waits its turn among 104 MB of large chat bodies on a replica, one at a time for each user.
A post that waits 20 seconds gets "Carl is busy reading other files" and the api logs "a large body waited 20000 ms
for its turn and got the busy response". That line is the reading that `app` needs another replica.

A Worker's slots are fixed when the worker starts, so during a wave the way to add scan or recording capacity is to
add `temporal-worker` replicas, and the way to add film capacity is to add `temporal-films` replicas. Each replica
adds the slots below on each of its service's queues. Changing a setting means a restart. A restart costs a film
render the shot in progress and none of its three attempts: the render is scheduled again and downloads the shots it
had stored. It costs a review one of its three attempts, and the next attempt skips the pages already scored. Three
restarts inside one review fail that Scan.

| Queue | Service | Slots on a replica | Setting |
|---|---|---|---|
| `topic-scans` | `temporal-worker` | 16 | `SCAN_CONCURRENCY` |
| `topic-scans-scheduled` | `temporal-worker` | 8 | `SCHEDULED_SCAN_CONCURRENCY` |
| `scan-closing` | `temporal-worker` | 8 | fixed |
| `scan-emails`, `personal-sources-email` | `temporal-worker` | 4 each | fixed |
| `push-notifications` | `temporal-worker` | 4 | fixed |
| `source-screening`, `attachment-processing`, `personal-sources`, `topic-images`, `topic-posts` | `temporal-worker` | 8 each | `SCREEN_CONCURRENCY` |
| `episode-recordings` | `temporal-worker` | 16 | `PODCAST_RECORDING_CONCURRENCY` |
| `episode-scheduled-chapters` | `temporal-worker` | 32 | `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY` |
| `episode-encodes` | `temporal-worker` | 2, one for each of the replica's cores | `PODCAST_ENCODE_CONCURRENCY` |
| `topic-memories` | `temporal-worker` | 2 | `TOPIC_MEMORY_CONCURRENCY` |
| `dashboard-snapshots` | `temporal-worker` | 2 | fixed |
| `episode-video-writes` | `temporal-worker` | 8 | fixed |
| `episode-videos` | `temporal-films` | 1, and 2 once `TOPIC_VIDEO_CONCURRENCY=2` is set | `TOPIC_VIDEO_CONCURRENCY` |
| `episode-video-rebuilds` | `temporal-films` | 1 | fixed |
| `episode-video-backfill` | `temporal-films` | 1 | `TOPIC_VIDEO_BACKFILL_CONCURRENCY` |

A film replica renders `TOPIC_VIDEO_CONCURRENCY` films at once, and a new film's render and a backfill's render wait
in one line for those slots. A render is about two cores wide, so two fill the service's four cores. A render gives
its slot back while it waits on a provider for an image, a chapter's plan, or a clip. The backfill starts no render
while a new film waits in `episode-videos` for a film Worker, so the first step for a film backlog is to leave the
backfill alone, and the second is another `temporal-films` replica. Each attempt may use 1 GiB of the replica's
disk, and a replica holds three attempts at once, two renders and a rebuild.

Each worker replica serves its demand for the platform's autoscaling at `/metrics` on `WORKER_METRICS_PORT`, 9464 by
default. A film replica serves `carlnotes_film_demand`: the renders its film Workers have taken plus the film queue's
backlog divided by its pollers. Each replica takes an equal share of the backlog, so the replicas' average is the
whole demand divided by the replicas, and a target of 2 is one replica's render slots in use and nothing waiting. A
main worker serves `carlnotes_scan_demand` the same way over both scan queues. Its target is 16, the slots of a
person's Scans, not 24, all the replica's scan slots. At 24, a replica with its 8 scheduled slots idle reads at most
26 while 10 of a person's Scans wait, which is under the 26.4 that a 10% tolerance needs to add a replica. At 16, a
person's Scans that fill their slots scale the service as soon as more wait, and scheduled Scans running beside them
add replicas sooner. A replica that cannot read its queue answers 503 with no number.

A person's first Scan and a Scan started by hand run on `topic-scans`, and the sweep's scheduled Scans on
`topic-scans-scheduled`, so a wave of scheduled Scans never holds a slot that a person waits for. The sweep sizes
its scheduled starts from the scheduled queue's backlog. A podcast episode's audio is joined on `episode-encodes`,
where encodes that arrive together wait for a core. A container reports its host's cores, so the worker cannot count
its own: if `temporal-worker` moves to a plan with another vCPU count, set `PODCAST_ENCODE_CONCURRENCY` to it.

### Switches, as a last resort

The **Limits** permissions are on by default. Each process caches the shared settings row for up to 60 seconds.
Changes from the admin console take effect within a minute without a restart. If reading the row fails, the process
reports the failure and uses the default permissions. For Doppler changes, restart `app` and `temporal-worker`.
The sweep reads Doppler settings on its next run.

To stop new podcast episodes, turn off **Allow new podcast episodes**.

| Switch | Set in | Restart | What it stops | What keeps working | What a person sees | Undo | Test |
|---|---|---|---|---|---|---|---|
| Podcast episodes daily cutoff, `PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD`, $65 | Limits, with the Doppler default | none | a free user's podcast episodes after a Topic's first, once the day's free-plan spend passes it | the Scan and its Findings, and paid users | nothing: the Scan succeeds with no new podcast episode | raise or clear the override; the day ends at midnight UTC | `packages/pipeline/podcast/planPodcastEpisode.test.ts` |
| Scheduled scans daily cutoff, `SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD`, $100 | Limits, with the Doppler default | none | free owners' scheduled Scans for the day; their first and manual Scans wait for the first scan limit | paid users, and Scans already under way | a Scan under way, with no word about waiting | raise or clear the override | `apps/worker/schedule.test.ts` |
| Chat daily cutoff, `CHAT_DAILY_SPEND_CUTOFF_USD`, $150 | Limits, with the Doppler default | none | a free user's chat turn, voice request, and message to Carl | paid users, and every page | "Carl is taking a break until midnight UTC. Ask him again then." | raise or clear the override | `apps/api/chat/chatTurnAuthorization.test.ts` |
| First scan limit, `FIRST_SCAN_DISPATCH_LIMIT`, 5 | Limits, with the Doppler default | none | nothing by itself: it paces the waiting Scans, and 0 starts none | every Scan that is not waiting | a Scan under way for as long as it waits | raise or clear the override | `apps/worker/scanQueue.test.ts` |
| Unverified accounts, the unchecked "Allow unverified email sign-ups to scan and chat" | Limits only | none | for a free account that signed up with a password and has not verified its email: its first and manual Scans wait for the first scan limit whatever the day's spend, and chat and voice do not answer | verified accounts, provider sign-ins, and paid accounts | a Scan under way for as long as it waits, and in chat "Carl will answer once your email is verified. Check your inbox." | check the box again; a Scan that was waiting starts on the next sweep | `packages/db/dailySpendCutoffs.test.ts`, `apps/api/chat/chatTurnAuthorization.test.ts`, `apps/api/chat/voiceAuthorization.test.ts` |
| Allow new podcast episodes, turned off | Limits only | none | every new podcast episode and recording, whoever it bills | the Scan, its Findings, and its email; a recording under way; every published podcast episode, the feeds, and voice | a Scan with no new podcast episode | turn it back on; a skipped podcast episode is not recorded later | `packages/pipeline/podcast/planPodcastEpisode.test.ts` |
| Allow new films, turned off | Limits only | none | the film of a podcast episode that publishes while the permission is off | the podcast episode as audio; a render under way; ready films; a film's rebuild; the backfill | a podcast episode with no film | turn it back on; only the backfill renders a skipped film, for each Topic's latest podcast episode | `apps/worker/workflows/recordPodcastEpisodeActivities.test.ts` |
| Generated image limit, over `TOPIC_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT`, 40 | Limits, with the Doppler default | none for Limits, the worker for Doppler | at 0, every generated chapter image in the films rendered meanwhile | the film renders with its Resource Images, the podcast card, and its own image | a film with fewer generated images, for good | clear the override | `packages/pipeline/topicVideo/videoChapterImages.test.ts` |
| Allow unfeatured items on the home page, turned off | Limits only | none | every unfeatured card in the home's seven sections, within a minute for a signed-in user and about three for a visitor | featured items, Your topics, the news, every item at its own url, and the Topics directory | fewer cards on the home page | turn it back on | `apps/api/home/homeCardIds.test.ts` |
| `SCAN_DISPATCH_LIMIT`, 100 | Doppler | none: the sweep's next run | at 0, every scheduled Scan and every Scan that was opened and never started | waiting Scans within the first scan limit; Scans the api starts; every Topic stays scheduled | a scheduled Scan that comes later | remove the value | `apps/worker/scanQueue.test.ts`, `packages/server/scanSettings.test.ts` |
| `TOPIC_VIDEO_BACKFILL_CONCURRENCY`, 1 | Doppler | the worker | at 0, the film backfill's start and its Worker; a backfill under way waits at its next step | a new podcast episode's film, and rebuilds | nothing | remove the value and restart the worker | `packages/server/podcastEpisodeSettings.test.ts` |
| `TOPIC_VIDEO_CONCURRENCY`, 1 | Doppler | the worker | at 0, both film Workers, the backfill, and a new podcast episode's film. The api still queues a rebuild, which waits until films are on again | recording, and ready films play | a new podcast episode with no film | remove the value and restart the worker | `packages/server/podcastEpisodeSettings.test.ts`, `apps/worker/workflows/recordPodcastEpisodeActivities.test.ts` |
| Mobile minimum version | the admin console's **Mobile apps** section | none, within 60 seconds | every api request from an older build, with a 426 | the web, and newer builds | "Carl needs a newer app" with the store link | lower the minimum | `apps/api/appVersionGate.test.ts` |
| Edge purge | `bun run edge:purge`, and every release | none | nothing. It empties the edge, so every visitor page reaches the origin until the edge fills again | everything | nothing | none needed | `apps/api/edgeCache.purge.test.ts` |
| `PODCAST_SPEECH_MODEL` set empty | Doppler | `app` and the worker | far more than recording: it hides every published podcast episode from its Topic's page and its own page, the public and listener feeds respond 404, podcast episodes leave the sitemap, voice chat and spoken replies turn off, and a podcast episode being recorded fails at its next chapter. A Topic Post Discussion still starts and pays for its script, then fails at the speech call | Scans, chat in text, and Topic Posts | no podcast section, a missing page, and a feed that is gone | set the model again and restart both | `packages/pipeline/podcast/planPodcastEpisode.test.ts` |

### Rollback

- **Roll a request-serving service back by itself.** In Northflank, open the `app` service, pick the previous build
  from its list of builds, and deploy it to that service alone. The database stays at the new release's schema,
  because the release migrates before any service deploys and no migration is undone.
- **Never roll the worker back past a `patched` workflow change.** `patched` lets an old workflow history replay on
  new code, never a new history on old code. A workflow that recorded the patch would no longer replay on the older
  worker, and it would stay stuck until the worker moves forward again. Fix the worker forward.
- **A worker from before a queue was added does not poll it.** The api and the sweep start a scheduled Scan on
  `topic-scans-scheduled`, and a recording schedules its encode on `episode-encodes`. Both wait there with no error
  until a worker that polls the queue runs again, so a worker rolled back past this release leaves them waiting.
  The sweep reports a scan queue with no poller as "no temporal worker is polling the scan queue".
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

Neon holds every row: accounts, Topics, Findings, chat, and the pointers to every stored object, in the Neon project
`carlnotes`. Read from the Neon console on 2026-11-19 and 2026-11-20:

- **Plan:** Launch, which autoscales to 16 CU. The compute runs from 0.25 to 8 CU.
- **Branch `production`:** the default branch, 2.86 GB. Its restore window is 7 days, and a snapshot is taken daily at
  00:00 UTC and kept 14 days.
- **Branch `dev`:** a child of `production`.

The privacy page promises that deleted data leaves backups within 90 days, so the restore window and the snapshots'
14 days have to stay at 90 days or less.

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

One R2 bucket holds every file, through one client (`packages/db/store.ts`): `carlnotes-prod`, in Western North
America. On 2026-11-19 it had no versioning and no bucket lock, and its one lifecycle rule aborts an unfinished upload
after 7 days. So a deleted object cannot be recovered.

- **Gone for good if deleted:** an avatar, a Topic's attachments, chat and chat room attachments, a Topic Post's
  body images, an uploaded Topic image, and a published podcast episode's audio, which no code records again.
- **Comes back for a cost:** a generated image (one image call, and the new image differs), a film (a render, which
  nothing starts for a film already marked ready), and a Topic Post Discussion (a regenerate, on that person's
  bill).
- **Comes back by itself:** share cards, podcast covers, Dashboard share images, a Resource's content and images,
  link previews, and favicons.

### Redis

Redis holds what can be built again, and a few things that cannot. The `redis` addon ran Redis 8.10.1 on one
instance with 0.2 vCPU, 512 MB of memory, and a 6 GB NVMe disk on 2026-11-20, with the eviction policy `allkeys-lru`
and no backups. A restart on 2026-11-14 lost the buffered view counts, so treat its data as not persistent.

A loss of Redis's data costs:

- the buffered daily counts that had not reached Postgres
- the day's view claims, so a repeat view that day counts again
- every day-long count: suggestions, social writes, reports, and Dashboard paragraphs
- the sign-up tokens signed in the last five minutes, so those people pass the challenge again
- the day's recap, and the open spend reservations
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

Temporal's store holds the running workflows: Scans, recordings, renders, and the steps after a publish. The
`temporal-db` addon runs a replica with automatic failover, and it is backed up daily at 3 am Pacific with each backup
kept 7 days (read 2026-11-19).

**Start a lost store empty. Never restore it from an older copy**, those daily backups included, because old workflows
would run again against rows that have moved on. No schedule has to be made again: the sweep starts the nightly
Dashboard build, the worker's start begins the film backfill, and the sweep and the monthly reset are Northflank cron
jobs.

A lost workflow leaves its row behind. The sweep handles these:

- **A Scan** that was running is marked failed after 48 hours and 21 minutes, and one that never reached a worker
  after 24 hours and 15 minutes. A Scan that was opened and never started is started again on the next sweep.
- **A Source's screen** starts again on every sweep.
- **Personal sources work** is recovered by the sweep.
- **A podcast episode at `recording`, a film at `rendering`, a Topic Post Discussion at `recording`, a Topic image
  render at `pending`, and an attachment at `pending`** are each started again once on the same row, after the
  workflow's longest run and 15 minutes: 9 hours 9 minutes for a podcast episode. A row that was already started
  again is marked failed.

Nothing closes out a Topic Post's steps after its publish (its summary, image, and first discussion), so each stays
as it is until someone acts on it by hand.

### LiteLLM's database

LiteLLM's own Postgres holds every virtual key and its budget. If it is lost, every stored key in
`users.litellm_virtual_key` names a key the proxy no longer knows, and those users' model calls fail until each key
is made again. It runs in its own Neon project, `carlnotes-litellm-prd`, whose restore window is 1 day, with no
snapshot schedule (read 2026-11-19).

The proxy encrypts the provider credentials it stores with `LITELLM_SALT_KEY`, or with `LITELLM_MASTER_KEY` if no
salt is set (`.env.example`). Production's `litellm` service sets `LITELLM_SALT_KEY`, so its stored credentials are
encrypted with it, not with the master key. A restored database is unreadable to a proxy that holds another salt, so
keep a copy of `LITELLM_SALT_KEY` with the two secrets below.

### The two secrets

Doppler holds two secrets that cannot be made again without losing data. Keep a copy of each outside Doppler.

- **`CHAT_TEXT_KEY`** encrypts chat text and Personal sources content. Without the same key every encrypted row is
  unreadable for good.
- **`BETTER_AUTH_SECRET`** signs session cookies, unsubscribe links, podcast cover keys, sign-up tokens, and the
  person hashes in the daily counts. A new secret signs everyone out, breaks every unsubscribe link already sent,
  and makes each person count as new in the daily counts.

Cloudflare's rules, Northflank's cron schedules and service sizes, and the Sentry alerts live in no config file. The
[Edge cache](#edge-cache) section, the Services table above, and the Deploy alerts section are their only record.

### Animated film chapters

The [film worker guide](film-rendering.md) covers admission, resource limits, measured compute costs and selected upgrades.
