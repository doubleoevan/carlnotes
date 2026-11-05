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

Migrations are a deploy job, not a start-up step. CI starts the release. On a push to `main`, once the gate and the
image smoke pass, the `release` job in [ci.yml](../../.github/workflows/ci.yml) starts Northflank's `release-main` workflow
through its api with that commit's SHA as the `sha` argument. It reads `NORTHFLANK_API_TOKEN` from the secrets of
the `production` GitHub environment, whose deployment branch rule allows only `main`, so a pull request's run cannot
read the token. The token needs the Northflank permission Project > Workflows > Runs > Start. The job reads
`NORTHFLANK_WORKFLOW_ID` (`release-main`) from the repository variables and skips while it is unset. The workflow builds
that commit once and runs the migration job against it. Only then does it deploy `app`, purge the edge, deploy
`temporal-worker`, and finish with the docs embed. So new code never meets an old schema. Each deploy step waits up to
ten minutes for its replicas to run, and a rollout that never runs fails the workflow before the next step. The
workflow's definition is
[infra/northflank/release-main.json](../../infra/northflank/release-main.json), which has no git trigger. In an emergency, run
`release-main` from the Northflank console with the commit's full SHA as `sha`. That skips CI, so it is for a commit
that already passed it.

The `app` service's startup, readiness, and liveness checks are
[infra/northflank/app-health-checks.json](../../infra/northflank/app-health-checks.json), the `healthChecks` body of
Northflank's `PATCH /v1/projects/carlnotes-prd/services/deployment/app`. Startup polls `/api/health` every 10 seconds
for up to two minutes. Readiness polls `/api/health/ready` every 10 seconds and takes a replica out of traffic after
three misses. Liveness restarts a replica after six missed `/api/health` polls. Both Northflank files are applied by
hand, with the Northflank CLI or console. Apply `release-main.json` with `northflank create workflow`, which upserts
(`update workflow` returns HTTP 500). Do it before setting `NORTHFLANK_WORKFLOW_ID`, so a push never deploys twice.

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
and redeploys the service on push. A model swap is the config edit and nothing else.

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
