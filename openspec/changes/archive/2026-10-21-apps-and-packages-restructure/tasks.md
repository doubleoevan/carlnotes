## 1. Phase one: the cutover scripts

- [x] 1.1 Add the `temporal` root script, `doppler run -- bun worker/temporal.ts`, to `package.json`; name it in the
      README's process table and worker section, `worker/AGENTS.md`, and the Northflank command table in `design.md`
- [x] 1.2 After the one commit ships and `release-main` finishes, switch the `temporal-worker` command and confirm the
      `migrate`, `edge-purge`, `docs-sync`, scan-sweep, and budget-reset commands against the table (manual steps 5 to
      7); record each confirmed command in `design.md`

## 2. Phase one: the captures before the move

- [x] 2.1 `scripts/capture-public-responses.sh <dir>`: fetch `/sitemap.xml`, `/robots.txt`, `/llms.txt`,
      `/llms-full.txt`, `/feed.xml`, `/indexnow.txt`, `/.well-known/security.txt`, a public topic page, that topic's
      podcast feed, its share image, and a podcast cover from the dev server into the directory, one file each
- [x] 2.2 Run it against the dev server before any file moves and keep the directory in the scratchpad for the diff

## 3. Phase one: the package.json files, the checks, and the Bun pin

- [x] 3.1 `scripts/check-structure.sh`: allow a `package.json` at the root, `apps/<name>/`, and `packages/<name>/`
      alone, with the message naming the new rule
- [x] 3.2 The root `package.json`: `workspaces`, every root script kept by name, the toolchain and the `evals/` and
      `scripts/` dependencies, and each workspace as a `workspace:*` dev dependency; the thirteen workspace package.json
      files with their dependencies at today's versions and `"exports": { "./*": "./*.ts" }` for each package
- [x] 3.3 The universal rule in `biome.json`: `noRestrictedGlobals` over `packages/{contracts,client,core}` for the
      browser and runtime globals, tests excepted; a `tsconfig.json` per workspace whose references mirror its
      package.json; the root `tsconfig.json` referencing every workspace, `scripts`, and `evals`
- [x] 3.4 `scripts/check-package-boundaries.ts` and its test, replacing `check-ui-boundary.ts`: the six rules in the
      design's section 2, failing on the first violation; wire it into `scripts/preflight.sh`
- [x] 3.5 The Bun pin: `.bun-version`, both Dockerfile `FROM` lines by tag and digest, `@types/bun ~1.4.3`, the README's
      `bunx bun@` pin, then `bunx bun@1.4.3 install` to write the workspace lockfile

## 4. Phase one: the packages

- [x] 4.1 `packages/contracts`: the twenty universal `shared/` modules with `contracts/*` flattened to the root, and
      `podcastEpisodes.ts` reduced to its constants and transcript functions, and `analyticsEvents.ts` split from
      `analytics.ts`; `scanFailure.test.ts` moves to the pipeline package
- [x] 4.2 `packages/server`: the nine server modules from `shared/`, `podcastEpisodeSettings.ts` with the speech model
      setting and the cover key and path, and `ffmpeg`, `retry`, `concurrency`, `publicFetch` from `worker/`
- [x] 4.3 `packages/db`: `db/` as it is plus `worker/store.ts`; `drizzle.config.ts` points at `packages/db`
- [x] 4.4 `packages/emails`: `emails/` plus `worker/email.ts` and `worker/unsubscribe.ts`; the `dev:email` script and
      the emails tsconfig `outDir`
- [x] 4.5 `packages/models`: `litellm`, `models`, `budget`, `guard`, `telemetry`, `speech`, `transcription`,
      `imageText`, `prompts/`; the `prompts:sync` scripts
- [x] 4.6 `packages/pipeline`: `chat/`, `ingest/`, `review/`, `podcast/`, `assets/`, `scan`, `temporalClient` with the
      `ScanTrigger` type moved into it, `staleScans`, `stageTimeouts`, `scrape`, `transcripts`, the attachment modules,
      `linkPreview`, `chunk`, `screen`, `suggest`, `suggestedSourceChecks`, `meanVectors`, `favicons`, `indexNow`,
      `notify`, `scanEmailContent`; the tests and smoke scripts that import the activities move to `apps/worker`
- [x] 4.7 `packages/models` also takes `ffmpeg`, whose test needs `speech`, and `packages/server` takes `retry`,
      `concurrency`, and `publicFetch`
- [x] 4.8 Rewrite every `@shared/*` and cross-folder relative import to its package path by script, then run the
      boundary check and `tsc -b` until both pass; a module the rule places elsewhere than the table moves there with
      the reason in the commit

## 5. Phase one: the apps

- [x] 5.1 `packages/client`: `ui/src/clients/*` with `configureApiClient` and `apiClient()`, the
      auth client's base url the same way, the invite url and billing redirects left in `apps/web`
- [x] 5.2 `packages/core`: the design's candidate stores, hooks, and lib, each kept only if the universal build passes
- [x] 5.3 `packages/tokens`: `tokens.css` from the `@theme inline` block and the `:root` and dark variables, moved as
      they are, imported by `globals.css`
- [x] 5.4 `apps/web`: the rest of `ui/`, `router.tsx` configuring the client's base url, `vite.config.ts` without the
      `@shared` alias, the vad plugin's root `node_modules` path, `components.json`
- [x] 5.5 `apps/api`: `api/` with the cwd roots and the `content`, docs, and cover illustration paths from the design's
      path table
- [x] 5.6 `apps/worker`: the process entries, `workflows/`, and the sweep-only modules;
      `scripts/check-workflow-bundles.ts` and `smoke.yml` pointed at `apps/worker`
- [x] 5.7 `apps/docs`: `docs/` as it is; `docsSync`'s and `seo`'s docs paths
- [x] 5.8 `biome.json`, `bunfig.toml`, `.dockerignore`, the Dockerfile (per-package.json `COPY` lines, both installs,
      the runtime `COPY` list), `.github/workflows/evals.yml` paths, `.claude/settings.json` allow entries, `evals/` and
      `scripts/` imports by package name

## 6. Phase one: the docs move with the code

- [x] 6.1 `AGENTS.md`: the module map as apps and packages with the dependency order, the routing table's paths, the
      never-read paths, and the package rule in place of the one-package rule; `CLAUDE.md` likewise
- [x] 6.2 An `AGENTS.md` per app and per package, moved and split from today's six, each naming its entry points,
      layout, and commands; `README.md` (the modular monolith section, the process table, the Development section, the
      deploy section, the Bun pin) and `CONTRIBUTING.md`
- [x] 6.3 The skills under `.agents/skills` and their `.claude/skills` copies (`domain-model`, `ingester-authoring`,
      `prompt-authoring`), `.opencode/commands` and `.opencode/plugin`, `docs/ai-scaffolding.md`, and the 18
      `openspec/specs` files that name a path; `openspec/changes/archive` untouched

## 7. Phase one: prove the move changed nothing

- [x] 7.1 `bun run check` green, `bun run db:generate` writes no migration, `bun run smoke` green
- [x] 7.2 Rerun `scripts/capture-public-responses.sh` and diff against 2.2; every difference is a hashed asset name
- [x] 7.3 `docker build --platform=linux/amd64` with the three `VITE_*` arguments; run the image on the dev Doppler
      config and request `/api/health`, a public topic page, `/docs`, a blog post, `/sitemap.xml`, and a podcast cover
- [x] 7.4 After the ship: close Dependabot's PR #22, and move open questions 2 and 3 on the Notion Mobile page into its
      Decisions table with the rejected alternatives (manual steps 25 and 26)
