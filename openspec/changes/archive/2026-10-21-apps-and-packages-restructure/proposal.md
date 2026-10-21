## Why

Every boundary in the repo holds by convention. `shared/` mixes modules the browser may load with modules that read
`Bun.env`, import `posthog-node` or `@sentry/bun`, or import a Node built-in; 59 files in `api/` and 59 in `evals/`
import `worker/` directly; and the one `package.json` lets any module reach Drizzle, Temporal, Stripe, or satori. A
React Native bundler follows whatever a module can reach, so the mobile app the Notion Mobile page plans cannot start
until the universal code is a package whose runtime closure is proven free of server code.

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

Phases two and three, the render split into a `web` service and spend reservations, moved to the
serve-pages-from-a-web-service and reserve-spend-before-calls changes when phase one shipped.

## Capabilities

### New Capabilities
- `workspace-structure`: the apps-over-packages layout, the universal and server package rules, the checks that enforce
  them in preflight and the edit hooks, the stable root scripts for every Northflank process, the single Bun pin, and
  the runtime paths the image carries.

### Modified Capabilities
- `deploy-mechanics`: the budget reset and the other Northflank processes start through root scripts.
- `ui-routing`: the boundary check that rejects a value import of server code becomes the workspace check over
  `apps/web` and the universal packages.

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
  switch to root scripts before the move.
- Docs: the root and per-module `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, the skills under
  `.agents/skills` and `.claude/skills`, `.opencode`, and `openspec/specs` name the new paths;
  `openspec/changes/archive` stays untouched. Open questions 2 and 3 on the Notion Mobile page close.
