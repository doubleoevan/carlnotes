## Why

Every boundary in the repo holds by convention. `shared/` mixes modules the browser may load with modules that read
`Bun.env`, import `posthog-node` or `@sentry/bun`, or import a Node built-in; 59 files in `api/` and 59 in `evals/`
import `worker/` directly; and the one `package.json` lets any module reach Drizzle, Temporal, Stripe, or satori. A
React Native bundler follows whatever a module can reach, so the mobile app the Notion Mobile page plans cannot start
until the universal code is a package whose runtime closure is proven free of server code. The same one-process topology
that makes the boundary invisible also puts page renders, generated images, and a 10 MB PDF's text extraction on the
event loop that holds every live chat stream, and both budget checks are check-then-spend, so a streaming turn or four
parallel review items can finish past the budget they passed.

## What Changes

**Phase one: structure only, and the Bun upgrade.** The repo becomes Bun workspaces: four thin apps (`apps/web`,
`apps/api`, `apps/worker`, `apps/docs`) over private `@carlnotes/<name>` packages that export TypeScript source with no
build step. Universal packages (`contracts`, `client`, `core`, `tokens`) depend only on universal packages, a Biome rule
forbids the browser and runtime globals in them, and a preflight check walks their runtime dependency closure for the
server-only packages. Server packages (`server`, `db`, `emails`, `models`, `pipeline`) hold what the apps, `evals/`,
and `scripts/` share. `shared/podcastEpisodes.ts` splits into its universal constants and its server functions. Apps
never import apps, except that `@carlnotes/client` imports the api's `AppType` as a type. `scripts/check-structure.sh`
enforces the new package rule and `scripts/check-ui-boundary.ts` becomes the package boundary check. Every root script
keeps its name, a stable `temporal` script lands first on the current layout so Northflank switches to it before the
move, and Bun moves from 1.3.14 to 1.4.3 in `.bun-version`, both Dockerfile stages, `@types/bun`, and the README pin
together. No URL, response, schema, UI, or deploy topology changes. Captures of the documents, a rendered topic page, a
podcast feed, a share image, and a podcast cover are diffed before and after, and the production image is built and run.

**Phase two: render split at the deployment layer.** The page routes that the api serves today, the ui render, the blog,
the docs, the documents, the feeds, the share and cover images, the avatars, and the favicons, move into a server
package that both `apps/api` and a new `apps/web` server mount, so the `app` service keeps serving every path while a
new `web` service takes over pages through Northflank path routing. `apps/web`'s loaders call `apps/api` over
Northflank's private network. Chat attachment text extraction moves to a Bun worker thread in `apps/api`. The default
pool count grows to cover the web replicas, and each service answers its own health checks. Rolling back is pointing the
base path back at `app`.

**Phase three: spend reservations.** Before a chat turn, a voice turn, or a scored resource, the call's largest possible
cost is reserved against the remaining budget, less what is spent and less every open reservation. A call whose maximum
does not fit is refused before anything posts, with today's rejection wording. The reservation settles when the call
ends, releases when it fails, and expires if the process dies. User reservations live in Redis with the same
degrade-not-stop rule as every other Redis path, so a Redis outage falls back to today's check. A Scan reserves inside
its own `Budget` object, so parallel review can no longer overshoot the Scan limit, and a budget resumed from heartbeat
details carries settled spend only. Podcast episodes keep their cutoff pause instead of reserving.

## Capabilities

### New Capabilities
- `workspace-structure`: the apps-over-packages layout, the universal and server package rules, the checks that enforce
  them in preflight and the edit hooks, the stable root scripts for every Northflank process, the single Bun pin, and
  the runtime paths the image carries.
- `spend-reservations`: reserving a call's largest cost before it runs, settling it at the actual cost, releasing it on
  failure, expiring it after a crash, the Redis store for user reservations with its fallback, and the in-memory
  reservation inside a Scan's budget.

### Modified Capabilities
- `static-serving`: the one-process requirement becomes two services from one image, the web service serving pages and
  images and the api service keeping every path.
- `deploy-mechanics`: the replica and pool rule and the health checks cover the web service, and the budget reset and
  the other Northflank processes start through root scripts.
- `request-capacity`: the default pool count counts the web service's replicas.
- `performance-telemetry`: the minute gauge line is written by the web service too.
- `ui-routing`: the boundary check that rejects a value import of server code becomes the workspace check over
  `apps/web` and the universal packages.
- `docs-site`: the built docs are served by the web service, and the app service keeps serving them.
- `topic-chat`: a turn is metered by reserving its largest cost, and attachment text is extracted off the event loop.
- `curation`: the per-Scan spend limit becomes hard; the accepted overshoot of `concurrency - 1` Resources ends.
- `durable-scans`: a resumed budget carries settled spend only, never an attempt's open reservations.

## Impact

- Nearly every file moves: `ui/` to `apps/web`, `api/` to `apps/api`, `worker/` to `apps/worker` and the `models`,
  `pipeline` packages, `db/`, `emails/`, and `shared/` to packages. `evals/`, `scripts/`, `content/`, `infra/`,
  `openspec/`, `litellm-config.yaml`, and the Dockerfile stay at the root. Every open worktree needs a rebase afterward.
- `package.json` splits into the root and thirteen workspace package.json files at today's versions; the lockfile is
  regenerated with Bun 1.4.3; no dependency and no task runner is added. Dependabot's PR #22, the Dockerfile-only Bun
  bump, is closed in favor of this change.
- The Dockerfile copies every workspace package.json before the frozen install and every package and app the runtime
  needs. `drizzle.config.ts`, `biome.json`, `bunfig.toml`, `components.json`, `.dockerignore`, `.github/workflows`,
  `.claude/settings.json`, and the root `tsconfig.json` name the new folders.
- Northflank: the `temporal-worker` command, the `migrate`, `edge-purge`, and `docs-sync` jobs, and the two cron jobs
  switch to root scripts before the move; phase two adds the `web` service, its path routes, and its release step, and
  raises `DATABASE_POOL_COUNT`.
- Docs: the root and per-module `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, the skills under
  `.agents/skills` and `.claude/skills`, `.opencode`, and `openspec/specs` name the new paths;
  `openspec/changes/archive` stays untouched. Open questions 2 and 3 on the Notion Mobile page close.
- Phase three adds a Redis sorted set per user and a `reservedDollars` field on the in-memory `Budget`; no schema
  change.
