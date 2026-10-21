## Context

One `package.json` holds every dependency, and six top-level folders (`ui`, `api`, `worker`, `db`, `emails`, `shared`)
are joined by tsconfig project references and a `@shared/*` path alias. The boundaries hold by convention: the ui's
boundary is one preflight script that rejects a value import of `api`, `worker`, or `db` under `ui/src`, and nothing
else is checked. Measured on 2026-10-20:

- `shared/` has 29 modules. Nine read `Bun.env`, `Bun.CryptoHasher`, a Node built-in, `posthog-node`, or `@sentry/bun`:
  `analytics`, `appUrl`, `envSettings`, `eventLoopDelay`, `hmac`, `monitoring`, `runtimeGauges`, `savedEnvSettings`,
  `voiceChat`, and `podcastEpisodes`, which the ui imports in 19 places for its constants while its
  `podcastEpisodeSpeechModel` reads `Bun.env` and `toPodcastCoverKey` signs with the auth secret through `hmac`.
- 59 files in `api/` import `worker/` (the barrel, `litellm`, `speech`, `budget`, `transcription`, `store`, `guard`,
  `chat/*`, `scan`, `screen`, `prompts/*`, `email`, `notify`, `ffmpeg`, `imageText`, `meanVectors`, `staleScans`), 59
  in `evals/` do, and `evals/` and `scripts/` also import `api/`.
- The ui imports `api` twice, both as types: `AppType` and the `auth` type.
- Root scripts already exist for the sweep (`schedule`), the budget reset (`reset:monthly-budgets`), the migrate job
  (`db:migrate`), the edge purge (`edge:purge`), and the docs embed (`docs:embed`). None exists for the Temporal worker;
  the README documents it as `doppler run -- bun worker/temporal.ts`, and `dev:temporal` is the only script that runs
  it. Bun is 1.3.14 in `.bun-version`, both Dockerfile stages, `@types/bun ~1.3.14`, and the README's `bunx bun@` pin.
  Dependabot's PR #22 bumps the Dockerfile alone to 1.4.3 at digest
  `sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598`; `@types/bun` 1.4.3 is published.

The Notion Mobile page decided on Expo, TanStack Query over the typed Hono client, and `posthog-react-native` and
`@sentry/react-native` in place of the server clients, and left open question 2 (the workspace split) and 3 (the
shared boundary enforcement), both of which this change closes.

## Goals / Non-Goals

**Goals:**

- Phase one: a Bun workspaces layout of thin apps over private packages, with the universal packages proven free of
  server code by compilation and by a dependency closure check, every boundary declared in a `package.json` and
  mirrored in a tsconfig, and no change to any URL, response, schema, UI, or deploy topology. Bun 1.4.3 everywhere.
- Phases two and three, the `web` service and spend reservations, were split into the serve-pages-from-a-web-service
  and reserve-spend-before-calls changes when phase one shipped.

**Non-Goals:**

- The mobile app itself, Metro configuration, frozen contracts, and the 426 lever: their own change.
- Making `@carlnotes/tokens` the single source for the emails: the Nightshift design tokens change.
- Per-package builds, publishing, versioning, or a task runner.

## Decisions

### 1. The workspace map

Workspaces are `apps/*` and `packages/*`. Packages are private, named `@carlnotes/<name>`, and export source through
`"exports": { "./*": "./*.ts" }` (plus `"."` for an `index.ts` where one exists), so `@shared/contracts/chat` becomes
`@carlnotes/contracts/chat` and nothing is built. Dependency order among packages, which the boundary check and tsc's
own reference cycle detection both enforce: `contracts` → `client` → `core` (universal, with `tokens` standing apart as
CSS alone) and `server` → `db` → `emails` → `models` → `pipeline` (server). A package imports only packages before
it in its chain, and a server package may import a universal one.

| Workspace | Holds | Depends on | Reason for the boundary |
|---|---|---|---|
| `apps/web` | today's `ui/` minus what moves to `client`, `core`, and `tokens`: routes, pages, components, providers, the DOM-bound hooks, lib, and stores, `vite.config.ts`, `voiceActivityAssetsPlugin.ts`, `globals.css` importing the tokens | `contracts`, `client`, `core`, `tokens`; `api` as a type-only dev dependency | the one browser entry; everything DOM-bound lives here |
| `apps/api` | today's `api/` | `server`, `db`, `emails`, `models`, `pipeline`, `contracts` | the Hono and MCP server, one process entry `index.ts` |
| `apps/worker` | `temporal.ts`, `schedule.ts`, `resetMonthlyBudgets.ts`, `docsSync.ts`, `workflows/` with its activities, and the sweep-only modules nothing else imports: `dailySpend`, `scanQueue`, `scheduledTopicLimits` with its test fixtures, `retryPendingObjectDeletions` | `pipeline`, `models`, `emails`, `db`, `server`, `contracts`; `@temporalio/worker` | the process entries and the workflow code the worker bundles |
| `apps/docs` | today's `docs/` | `contracts`; `astro`, `@astrojs/starlight`, `sharp` for Astro's image service | the Starlight site, built to static files |
| `@carlnotes/contracts` | the universal part of `shared/`: `contracts/*` flattened to the package root, `payloads`, `topicPayloads`, `enums`, `plans`, `sources`, `seo`, `scanFailure`, `userAgent`, `avatars`, `usernames`, `usernameWords`, `emails`, `chatMentions`, `spokenText`, `text`, `time`, `reportedPath`, `youtube`, `podcastEpisodes` reduced to its constants and transcript functions, and `analyticsEvents`, the event types split out of `analytics` | `zod` | what both clients and the server compare and parse |
| `@carlnotes/client` | `ui/src/clients/*` with `configureApiClient`, `apiClient()`, and `showClientError`; a failed write shows through the app's `showError`, the billing client returns Stripe's urls for the app to open, and the invite url moves to `apps/web/src/lib/inviteUrl.ts` | `contracts`; `hono`, `better-auth`, `zod`, `yjs`, `y-protocols`; `api` as a type-only dev dependency | the typed api client the Mobile page decided to reuse |
| `@carlnotes/core` | the DOM-free stores, hooks, and lib from `ui/src`, classified by the universal build (section 3) | `contracts`, `client`; `react` | state and rules the web and mobile apps share |
| `@carlnotes/tokens` | `tokens.css`: the `@theme inline` block and the `:root` and dark variables from `globals.css`, moved as they are | none | the design tokens, imported by `globals.css` as `@import "@carlnotes/tokens/tokens.css"` |
| `@carlnotes/server` | the server-only part of `shared/`: `envSettings`, `savedEnvSettings`, `appUrl`, `hmac`, `analytics`, `monitoring`, `monitoringScrub`, `monitoringTestFixtures`, `eventLoopDelay`, `runtimeGauges`, `voiceChat`, `podcastEpisodeSettings` (the speech model setting), `podcastCoverPaths` (`toPodcastCoverKey`, `toPodcastCoverPath`), `docsContent`, `sourceFileTestFixtures`, and from `worker/`: `retry`, `concurrency`, `publicFetch` | `contracts`; `posthog-node`, `@sentry/bun` | everything that reads `Bun.env`, a Node built-in, or a server SDK; the package every server package imports |
| `@carlnotes/db` | today's `db/` plus `worker/store.ts` | `server`, `contracts`; `drizzle-orm`, `@neondatabase/serverless` | every store the app writes to: Postgres, Redis, and object storage |
| `@carlnotes/emails` | today's `emails/` plus `worker/email.ts` and `worker/unsubscribe.ts` | `db`, `server`, `contracts`; `@react-email/*`, `react`, `markdown-to-jsx` | the templates and the send that every email goes through |
| `@carlnotes/models` | `litellm`, `models`, `budget`, `guard`, `telemetry`, `speech`, `transcription`, `imageText`, `ffmpeg`, `prompts/` with `sync.ts` | `db`, `server`, `contracts`; `ai`, `@ai-sdk/openai`, `@langfuse/*`, `@opentelemetry/*`, `@sentry/bun`, `tesseract.js`, `@tesseract.js-data/eng`, `zod` | every model call, key, budget, prompt, and screen; the api, the pipeline, and the evals all start here |
| `@carlnotes/pipeline` | the rest of `worker/`: `chat/`, `ingest/`, `review/`, `podcast/`, `assets/podcast/*.wav`, `scan`, `temporalClient` with the `ScanTrigger` type moved in from the activities, `staleScans`, `stageTimeouts` from `workflows/`, `scrape`, `transcripts`, `attach`, `attachContentType`, `attachText`, `attachTable`, `linkPreview`, `chunk`, `screen`, `suggest`, `suggestedSourceChecks`, `meanVectors`, `favicons`, `indexNow`, `notify`, `scanEmailContent` | `models`, `emails`, `db`, `server`, `contracts`; `@temporalio/client`, `ai`, `unpdf`, `mammoth`, `exceljs`, `rss-parser`, `zod` | the content pipeline from a Source to a Finding, a reply, and a podcast episode. The brief named a chat package and a scan package, but the podcast script imports chat retrieval while the podcast question imports the script, attachments start their workflow through the Temporal client the scans use, and link previews and scoring share the page fetch, so neither half stands without the other, and the api, the worker's activities, and the evals each import both |

A module whose placement the table does not settle goes to the lowest package whose dependencies it needs, among the
packages that import it. The root `package.json` keeps the scripts, the toolchain (`@biomejs/biome`, `typescript`,
`@types/bun`, `concurrently`, `drizzle-kit`, `promptfoo`, `react-email`, `@react-email/ui`), and what `evals/` and
`scripts/` import directly, plus every workspace as a `workspace:*` dev dependency. `evals/` and `scripts/` import
`@carlnotes/api` for the chat tools, the room question, the chat proposals, and the backfills' api reads. The brief puts
everything they import in a package, but the chat tools drag the api's authorization, topic saving, and chat room code
with them, which is most of `apps/api`; `evals/` is the api's own measurement at the root, not an app, so it imports the
api package by name instead. Each dependency moves at the version the root holds today, and `bun.lock` is regenerated by
Bun 1.4.3. Bun 1.4 installs a workspace isolated: each workspace gets its own `node_modules` of symlinks into one
`node_modules/.bun` folder, the root holds only the root's dependencies, and a package a workspace does not declare
fails to resolve at runtime, which is the rule the boundary check states, enforced twice. Three things followed. A
toolchain binary lives in its workspace, so the root scripts run `bun run --cwd apps/web build` and `bun run --cwd
apps/docs build` against scripts in those package.json files instead of `cd apps/web && vite`, which found a `vite` on
the path outside the repo. The voice detector plugin finds `@ricky0123/vad-web` by walking up from the app to the
`node_modules` that holds it and follows the install's symlink into that folder, then finds `onnxruntime-web`, the
detector's own dependency, the same way from there, since the install links it beside the detector there and nowhere
else. And the docs site's `public/topic-tutorial-video-thumbnail.webp`, a symlink into the web app's `public/`, points
at `../../web/public/`.

### 2. What `check-structure.sh` and the boundary check enforce

`scripts/check-structure.sh`, which the Claude Code and OpenCode edit hooks run, is the first edit of the change: a
`package.json` may exist at the root, at `apps/<name>/package.json`, or at `packages/<name>/package.json`, and anywhere
else fails the hook. `scripts/check-ui-boundary.ts` becomes `scripts/check-package-boundaries.ts`, which reads the tree
and runs the rules in `scripts/packageBoundaries.ts`, tested in `packageBoundaries.test.ts`, and preflight runs it in
the ui check's place. It reads every workspace package.json and tsconfig and every `.ts`, `.tsx`, `.css`, and `.mjs`
file under `apps/` and `packages/`, and fails on the first of:

1. an import of an app (`@carlnotes/web`, `@carlnotes/api`, `@carlnotes/worker`, `@carlnotes/docs`) from any app or
   package, except `import type` of `@carlnotes/api` from `@carlnotes/client` and `apps/web`;
2. a relative import whose resolved path leaves the importing workspace;
3. a `@carlnotes/*` import the importing workspace's package.json does not declare in `dependencies` or
   `devDependencies`;
4. a workspace whose tsconfig `references` differ from its package.json's `@carlnotes/*` dependencies;
5. a universal package (`contracts`, `client`, `core`, `tokens`, named in the script) with a server package in its
   `dependencies`, or whose runtime closure, walked from each `dependencies` entry through the installed package's own
   `dependencies` with `Bun.resolveSync(`${name}/package.json`, from)`, reaches `drizzle-orm`,
   `@neondatabase/serverless`, any `@temporalio/*`, `stripe`, `satori`, `@resvg/resvg-js`, `posthog-node`,
   `@sentry/bun`, or `@opentelemetry/sdk-trace-node`.

6. a universal package file that is not a test importing `bun`, a `bun:*` module, or a `node:*` module.

The brief asked for a universal tsconfig with `lib` ESNext alone and no Bun or Node types, so that `window` or `Bun`
fails `tsc -b`. That compile does not exist: TypeScript ships the web standards a universal module needs, `fetch`,
`Response`, `URL`, `AbortSignal`, and `setTimeout`, inside its DOM lib and nowhere else, so a universal package without
the DOM lib cannot name a `Response`, and a universal package's tests import `bun:test`, which needs the Bun types.
The rule is Biome's instead: an override on `packages/contracts`, `packages/client`, and `packages/core` turns
`noRestrictedGlobals` on for `window`, `document`, `navigator`, `location`, `localStorage`, `sessionStorage`,
`history`, `matchMedia`, `Bun`, and `process`, with tests and test fixtures excepted, and rule 6 above covers the
imports Biome's import rule could not pattern-match. Every workspace keeps the base tsconfig. The `@shared/*` alias
leaves every tsconfig and `vite.config.ts`, since package names replace it; `apps/web` keeps `@/*` for `./src`. The
Mobile page's option 3 was a Biome import rule inside `shared/`; the globals rule is that idea applied to the packages
the move made.

### 3. Classifying `shared/` and `ui/src`

The rule is the universal build and the closure, not the name. From `shared/`: the twenty modules with no `Bun`,
`process`, or Node import go to `contracts`; the nine server modules go to `server`. `podcastEpisodes.ts` splits:
its constants, cover sizes, speaker names, and transcript functions stay in `contracts/podcastEpisodes.ts`, and
`podcastEpisodeSpeechModel`, `isPodcastEpisodeRecordingConfigured`, `toPodcastCoverKey`, and `toPodcastCoverPath`
become `server/podcastEpisodeSettings.ts`, since the ui imports only the constants. `analytics.ts` splits the same
way: its event names and property shape become `contracts/analyticsEvents.ts`, which the web app's visit analytics
imports, and the PostHog client stays in `server/analytics.ts`. `shared/scanFailure.test.ts` imports
`@temporalio/client` for `ApplicationFailure`; the test moves beside the pipeline's use of it, so the contracts package
never declares a Temporal dependency, even for tests.

The dependency graph of the old `worker/` settled the rest. `ffmpeg` goes to `models`, since `speech` prices and
encodes with it and its test needs `speech`. `transcripts`, `scrape`, `screen`, and `stageTimeouts` go to the pipeline,
since link previews and attachments fetch pages the way scoring does, source screening starts its workflow through the
Temporal client, and the stale scan close-out reads the stage timeouts the workflows read. A test or smoke script that
imports the worker's activities moves to `apps/worker` (`litellm.test.ts`, `scheduledTopicFilter.test.ts`, and the
scan, review, links, and podcast episode smoke scripts), since a package never imports an app.

From `ui/src`, the candidates for `@carlnotes/core` are the modules that import no DOM global, no
`@tanstack/react-router`, `@tanstack/react-start`, `sonner`, `lucide-react`, and no component: lib `chromeIntentUrl`,
`emailProviders`, `labels`, `pageHead`, `paginationSlots`, `planCards`, `streamReconnect`, `topicFindingFilters`,
`topicFindingSorts`, `topicPromptUrls`, `voiceRecordingDecisions`; stores `storeListeners`, `chatRoomStore`,
`noteBadgeStore`, `topicInviteStore`, `podcastEpisodeQuestionRules`; hooks `useNow`, `useAvatar`, `useUsernameChange`.
`chatPanelStore` reads the viewport through `isWideScreen`, `useObjectUrl` calls `URL.createObjectURL`,
`pageActionsStore` imports `lucide-react`, and `toastActions`, `requireSession`, `sessionCookie`, `useSearchParams`,
`useIsSignedInBeforeSession`, `useCtaPromptToast`, `useTopicPagePayload`, `topicTeamChoices`, `renderedRows`,
`styleClasses`, `utils`, the podcast question store's test fixture, and every store that reaches
`podcastEpisodePlayerStore` or `navigator.mediaSession` stay in `apps/web`. The list is what the rule and the
dependency graph left; a candidate the rule rejects stays in `apps/web`.

### 4. The typed client takes its base url from the app

`@carlnotes/client` keeps one module-level client behind `configureApiClient({ apiBaseUrl, showError })` and
`apiClient()`, and `showClientError` shows a client's message the way the app shows one. Until an app configures it,
a request goes to the page's own origin and an error goes to the console, which is what a browser and a test want, so
the client never derives a value from `window`. `apps/web/src/lib/webApiClient.ts` holds the app's configuration, the
value `apiClient.ts` derived today, `""` in the browser and `http://localhost:3000` on the server, with a toast as the
display; `router.tsx` calls it as it loads on both sides, and the route tests' `-loadRouter.ts` calls it the same way.
The auth client keeps reading the page's origin
in the browser, as Better Auth's client does by default; the mobile app builds its own client with the Expo plugin the
Mobile page chose. The toasts in the topic and team clients show through `showError`, the billing client returns
Stripe's urls and `apps/web/src/lib/billingRedirects.ts` sends the browser there, and the invite url lives in
`apps/web/src/lib/inviteUrl.ts`. The client helpers that took a `Response` take `ApiResponse`, the `ok`, `status`,
`json`, and `text` of one, because Bun 1.4's types add `textStream` to the global `Response` and Hono's typed response
lacks it. A `Proxy` over the `hc` client was rejected as a trick nobody should decode at 3am; the function call is the
cost of a configurable base.

### 5. Every Northflank process starts through a root script

The `temporal` script, `doppler run -- bun worker/temporal.ts`, was the first edit, meant to ship on its own so that
Northflank could switch `temporal-worker` to `bun run temporal` before the move. The user chose one commit for the
whole change instead, so the script ships with the move and the switch follows the deploy: the deploy runs the old
command once more, and the user switches each command right after it (manual steps 5 to 7, after the push). The other
processes already have scripts. The actual commands Northflank runs today are not in the repo,
so the table's "today" column is what the README documents, and the user confirms each in the Northflank console
before switching it (manual step 6). The Dockerfile's `CMD` stays the explicit `doppler run` array, since the `app`
service starts from the image and not from a command override.

| Northflank resource | Before, as the README documented it | After the switch | After the move |
|---|---|---|---|
| `app` service | image `CMD`: `doppler run -- bun api/index.ts` | unchanged | image `CMD`: `doppler run -- bun apps/api/index.ts` |
| `temporal-worker` service | `doppler run -- bun worker/temporal.ts` | `bun run temporal` | unchanged |
| `migrate` job | `doppler run -- bun db/migrate.ts` | `bun run db:migrate` | unchanged |
| `edge-purge` job | `doppler run -- bun api/edgeCache.purge.ts` | `bun run edge:purge` | unchanged |
| `docs-sync` job | `doppler run -- bun worker/docsSync.ts` | `bun run docs:embed` | unchanged |
| scan-sweep cron | `bun run schedule` | unchanged | unchanged |
| budget-reset cron | `bun run reset:monthly-budgets` | unchanged | unchanged |

GitHub Actions job names (`gate`, `smoke`, the evals and llm-guard jobs)
stay, since required checks match on them. `smoke.yml` keeps starting the worker by file path, `bun
apps/worker/temporal.ts`, because its `env LLM_GUARD_URL=` override must come after `doppler run`, and a script that
wraps `doppler run` would inject the Doppler value over it.

### 6. One Bun pin, bumped together

`.bun-version` → `1.4.3`; both Dockerfile `FROM` lines →
`oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598`, the digest PR #22 resolved;
`@types/bun` → `~1.4.3`; the README's `bunx bun@1.3.14` → `bunx bun@1.4.3`; then `bunx bun@1.4.3 install` writes the
workspace lockfile. CI keeps reading `.bun-version` through `.github/actions/setup-bun`, so the gate, the smoke, and the
image run the same Bun. The upgrade rides this change because workspaces lean on Bun's install, resolution, and
lockfile, and the before-and-after captures and the image run prove the two changes neutral together; PR #22 is closed
in favor of it (manual step 26).

### 7. Every path the runtime reads, and the files that name folders

| Where | Today | After the move |
|---|---|---|
| `api/index.ts` `DOCS_BUNDLE_ROOT` | `./docs/dist` (cwd) | `./apps/docs/dist` |
| `api/index.ts` `UI_CLIENT_ROOT` | `./ui/dist/client` (cwd) | `./apps/web/dist/client` |
| `api/index.ts` `UI_SERVER_ENTRY` | `ui/dist/server/server.js` (cwd) | `apps/web/dist/server/server.js` |
| `api/content.ts` `CONTENT_ROOT` | `${import.meta.dir}/../content` | `${import.meta.dir}/../../content` |
| `api/seo.ts` `DOCS_ROOT` | `join(import.meta.dir, "..", "docs/src/content/docs")` | `join(import.meta.dir, "../../apps/docs/src/content/docs")` |
| `api/share/podcastCover.ts` illustration | `new URL("../../docs/design/podcast/cover-base.png", import.meta.url)` | `../../../apps/docs/design/podcast/cover-base.png` |
| `api/share/podcastCover.ts`, `previewImage.ts` fonts | `./fonts/ArchitectsDaughter-Regular.ttf` | unchanged, moves with the files |
| `api/releases.preview.ts` | `release-notes/<tag>.local.md` (cwd) | unchanged, the folder stays at the root |
| `worker/docsSync.ts` `DOCS_DIR` | `docs/src/content/docs` (cwd) | `apps/docs/src/content/docs` |
| `worker/imageText.ts` | `Bun.resolveSync("@tesseract.js-data/eng/package.json", import.meta.dir)` | unchanged; resolves from `packages/models`, which declares the dependency |
| `worker/temporal.ts` `workflowsPath` | `new URL("./workflows/<name>.ts", import.meta.url)` | unchanged, moves with `apps/worker` |
| `worker/podcast/podcastEpisodeTheme.ts` | `../assets/podcast/theme-{intro,outro}.wav` | unchanged, `assets/` moves with `packages/pipeline` |
| `api/seo.smoke.ts`, `api/signup.smoke.ts` `UI_SERVER_ENTRY` | `ui/dist/server/server.js` | `apps/web/dist/server/server.js` |
| `api/indexTestFixtures.ts`, `api/pageRender.test.ts` fake bundle | `ui/dist/...`, `docs/dist/...` | `apps/web/dist/...`, `apps/docs/dist/...` |
| `docs/public/topic-tutorial-video-thumbnail.webp` symlink | `../../ui/public/...` | `../../web/public/...` |
| `db/schema.test.ts` reference scans | `api`, `worker` under the repo root | `apps/api`, `apps/worker`, `packages/pipeline`, skipping `node_modules` |
| `api/authorization.test.ts` scan of its own folder | every `.ts` under `api/` | the same, skipping the workspace's `node_modules` |
| `db/migrate.ts` | `join(import.meta.dir, "migrations")` | unchanged, moves with `packages/db` |
| `evals/**` | `import.meta.dir` under `evals/` | unchanged, `evals/` stays |
| `scripts/check-workflow-bundles.ts` | `../worker/workflows` | `../apps/worker/workflows` |
| `ui/voiceActivityAssetsPlugin.ts` | `path.resolve(__dirname, "../node_modules")` | a walk up from the app to the `node_modules` holding `@ricky0123/vad-web`, then from its real folder to `onnxruntime-web` |
| `drizzle.config.ts` | `./db/schema/*.ts`, `./db/migrations` | `./packages/db/schema/*.ts`, `./packages/db/migrations` |
| `ui/vite.config.ts` | `@shared` alias to `../shared` | alias removed; `@` stays |
| `biome.json` includes | `!db/migrations`, `!docs/design`, `!docs/public`, `!ui/public`, `!ui/src/routeTree.gen.ts` | the same folders under `packages/db`, `apps/docs`, `apps/web` |
| `bunfig.toml` coverage ignore | `db/migrations/**` | `packages/db/migrations/**` |
| `components.json` | `ui/src/globals.css` | `apps/web/src/globals.css` |
| `.dockerignore` | `ui/dist` | `apps/web/dist`, `apps/docs/dist` |
| `emails/tsconfig.json` `outDir` | `../.tsbuild/emails` | `../../.tsbuild/emails` |
| `package.json` `dev:email` | `--dir emails` | `--dir packages/emails` |
| `package.json` `dev:ui`, `build:ui`, `dev:docs`, `build:docs` | `cd ui && vite`, `cd docs && astro ...` | `bun run --cwd apps/web dev` and `build`, `bun run --cwd apps/docs dev` and `build`, against scripts in those package.json files |
| `.github/workflows/evals.yml` paths | `worker/prompts/**`, `worker/chat/**`, … | the same files at their package paths |
| `.github/workflows/smoke.yml` | `bun worker/temporal.ts`, `bun api/signup.smoke.ts` | `bun apps/worker/temporal.ts`, `bun apps/api/signup.smoke.ts` |
| `.claude/settings.json` allow list | `bun worker/temporal.ts` entries | `bun apps/worker/temporal.ts` |
| root `tsconfig.json` references | `shared`, `db`, `emails`, `api`, `worker`, `ui`, `scripts`, `evals` | every `apps/*` and `packages/*`, `scripts`, `evals` |

The Dockerfile's build stage copies `package.json`, `bun.lock`, and each workspace package.json on its own `COPY` line
(`COPY apps/api/package.json ./apps/api/` and so on; a glob `COPY` flattens, and `--parents` needs the labs syntax),
runs `bun install --frozen-lockfile`, copies the tree, builds `apps/web` and `apps/docs`. The runtime stage repeats
the package.json copies and `bun install --frozen-lockfile --production`, which creates each workspace's `node_modules`
and the `@carlnotes/*` links, then copies `tsconfig.base.json`, `tsconfig.json`, `packages/`, `apps/api`,
`apps/worker`, `apps/docs/design/podcast/cover-base.png`, `apps/docs/src/content/docs`, `content/`, and from the build
stage `apps/web/dist` and `apps/docs/dist`. The Temporal worker's `bundleWorkflowCode` runs webpack with symlinks
resolved to their real paths, so a workflow's import of `@carlnotes/contracts` compiles as source under `packages/`,
not as `node_modules`; `scripts/check-workflow-bundles.ts` proves it in preflight, and the `@shared` alias that the
bundler could never resolve is gone.

## Risks / Trade-offs

- [Every open worktree conflicts with the move] → merge or park them first (manual step 1).
- [Sentry groups by file path, so known errors reopen as new issues] → resolve the old ones as they reappear (manual
  step 24).
- [Bun 1.4 changes behavior somewhere the gate does not reach] → the before-and-after captures, the smoke suite, and
  the production image run on the dev config are the proof; `bun test` discovery across workspaces and
  `Bun.RedisClient` are the places to look first.
- [A module meant for `core` needs a DOM type] → it is a web module and stays in `apps/web`.
- [Vite or TanStack Start resolve a workspace package to a second React copy] → `resolve.dedupe` already lists `react`
  and `react-dom`, and the isolated install keeps one copy of each version in its `.bun` folder, which every workspace's
  link resolves to.
- [The Temporal bundler compiles a symlinked package as `node_modules`] → webpack resolves symlinks to real paths by
  default; the bundle check runs in preflight and fails the gate before a deploy.
- [A worktree nested in the main checkout resolves a package the package.json files forgot from the parent's
  `node_modules`] → tests here can pass on a dependency the image lacks; the image build and run on the dev config is
  the proof that resolution holds, and CI's clean checkout has no parent to fall back to.
- [A direct import of a package only a dependency declared] → `@opentelemetry/api`, `@astrojs/markdown-satteri`,
  `satteri`, and `@types/hast` were imported and never declared; each is declared at the version the lockfile already
  held, and `y-prosemirror`, which nothing imports, keeps its pin in `apps/web` so BlockNote's copy stays at 1.3.7.

## Migration Plan

**Phase one.** Capture the documents, a rendered topic page, a podcast feed, a share image, and a podcast cover from
the dev server. Move everything, with the `temporal` script in the same commit; run `bun run check`, `bun run
db:generate` (no migration), and `bun run smoke`; recapture and diff; build the image with `docker build
--platform=linux/amd64` and the three `VITE_*` arguments, run it on the dev Doppler config, and request `/api/health`,
a public topic page, `/docs`, a blog post, `/sitemap.xml`, and a podcast cover. Ship and let `release-main` finish,
then switch each Northflank command to its root script and confirm the next sweep logs a poller and a manual scan
reaches a terminal state (manual steps 5 to 7).

What the apply measured, on 2026-10-20: 1,375 files moved and 818 had an import rewritten; `tsc -b` is clean; all five
workflow bundles build with `packages/contracts/scanFailure.ts` compiled as source; `bun test` runs 1,698 tests across
284 files with none failing; `bun run db:generate` reports no schema change; and the captures from this worktree's api,
taken before the move and again after it with the same `BETTER_AUTH_URL`, are byte-identical for the seven documents,
the podcast feed, the share image, and the podcast cover. The topic page differs in three ways and no other: the origin
in its urls, which the before run read from the dev stack's api on port 3000 and the after run from this api, the order
of its `<link rel="modulepreload">` tags, and the lists of bundle files in the router's page data, since the client
package changed how the bundle splits into files. With those three normalized the page is identical. `bun run smoke` ran
all 23 smoke scripts green against the dev stack on the new layout. At ship time, after the review fixes, `bun test`
runs 1,706 tests across 285 files, the captures taken again against the dev api differ from the post-move ones only in
the origin, the data the worker added between runs, and the modulepreload order, and the production image built for
`linux/amd64` with the three `VITE_*` arguments and ran on the dev config: `/api/health`, the home page, a topic page, a
blog post, `/docs/`, the sitemap, the feed, the preview image, and the podcast cover answer 200, and its captures match
the dev api's except the order of two blog posts that share a date, which follows `readdir` and so the filesystem. The
image build caught the one dependency the host hid: Astro's image service needs `sharp`, which the hoisted install on
main had from promptfoo's optional dependencies and the isolated install links only where it is declared, so
`apps/docs` declares it. Northflank's build (`/Dockerfile`, context `/`) and the litellm path rule stay as they are.
Rollback is reverting the commit; the Northflank commands keep working either way, since each starts through a script
both images have.

Shipped as 8b92e486 on 2026-10-21. `release-main` built the image, ran the migrate job (nothing to apply), deployed
`app`, purged the edge, deployed `temporal-worker`, and embedded the docs; the worker polls its six queues, every public
document, page, asset, feed, cover, and preview image answers 200, and the four Northflank commands run their root
scripts. The one thing the gate did not reach was Bun 1.4's tls behavior: the pinned public fetch sent the url's address
as the tls server name, so a feed behind Cloudflare refused the handshake and one behind Fastly served the wrong
certificate. The Smoke workflow caught it on the first CI run, before any production scan ran, and b96e870f sets the
server name to the site's hostname. The phase two baseline, measured against the `app` service's `code.run` url with
`oha -c 50 -z 30s` on `/api/topic-feed` as a signed-out visitor right after the deploy, before the fix: 78 requests per
second, every one a 200, latency p50 0.57 s, p90 1.06 s, p99 2.57 s, slowest 4.72 s; the minute gauge line on the busier
replica read an event-loop p99 of 6 ms with a 129 ms maximum and 81 pool connections open with none waiting, and the
other replica an event-loop p99 of 10 ms with a 158 ms maximum.

Rerun 2026-10-21 08:37 PT after b96e870f and c0a21ae2, same command and url: 77 requests per second, every one a 200,
p50 0.55 s, p90 1.11 s, p99 2.27 s, slowest 5.17 s. The run before the move, 2026-10-20 16:40 PT on Bun 1.3: 76 requests
per second, every one a 200, p50 0.59 s, p90 1.04 s, p99 2.39 s, slowest 5.10 s. Within noise, so the move and the Bun
upgrade are neutral under load. The topic page run answers 32 200s, 88 503s, and 429 for the rest every time: two
replicas of 16 render slots render the first wave, and the render limit sheds the rest of the visitor limiter's 120 a
minute, so it measures configuration, not render speed.

## Open Questions

None. Northflank's current commands were confirmed in the console and switched to their root scripts after
the ship.
