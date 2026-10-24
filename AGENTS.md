# CarlNotes agent guide

## Module map

Workspaces are `apps/*` and `packages/*`. An app imports packages and never another app, except that `@carlnotes/client`
and `apps/web` import `AppType` and the auth type from `@carlnotes/api` as types only. A package imports only the
packages before it in its chain: `contracts` → `client` → `core` (universal, with `nightshift` standing apart as the
design system) and `server` → `db` → `emails` → `models` → `pipeline` (server). A server package may import a universal
one.
`scripts/check-package-boundaries.ts` enforces the order in preflight.

Apps, the deployable entry points:

- `apps/web/` — the TanStack Start app: the file routes under `apps/web/src/routes/`, the pages they render, components,
  providers, and the DOM-bound hooks, lib, and stores. A public page renders on the server for a visitor and a crawler.
  The sign-in pages, a route behind sign-in, and every route when the request brings a session cookie render in the
  browser. Its Storybook, the Nightshift component browser, builds to static files the api serves at `/nightshift`,
  and its MCP Apps cards build to one bundle the api writes into each card's html.
- `apps/api/` — the Hono server: routes, authorization, billing, chat rooms, tasting notes, teams, invites, share cards,
  the site search, page head data, viewer and listener counts, the MCP server and its MCP Apps cards, and the document
  routes (the sitemap, the feeds, the llms files, the IndexNow key, and security.txt).
- `apps/worker/` — the Temporal worker, its workflows and their activities under `workflows/`, the scheduled sweep, the
  monthly budget reset, the docs embed, and the modules only the sweep reads.
- `apps/docs/` — the Starlight docs site, built to static files the api serves at `/docs`, with the design files and
  the release notes convention beside it.
- `apps/mobile/` — the Expo app: CarlNotes for iOS and Android on a development build, with the routes under
  `apps/mobile/app/`, the Nightshift theme through Uniwind, and EAS Build and Update. It depends on the universal
  packages alone, stays out of the production image, and its accessibility bar lives in its AGENTS.md.

Packages, private `@carlnotes/<name>` workspaces that export source, in dependency order:

- `packages/contracts/` — the zod contracts and request payloads, enums, plans, Source definitions, and the other
  universal modules every workspace may import.
- `packages/client/` — the typed api clients. An app configures the base url and how an error shows.
- `packages/core/` — the DOM-free lib, stores, and hooks that the web app shares with any other client.
- `packages/nightshift/` — Nightshift, the design system: every color token, the radius scale, the fonts, and the type
  roles in TypeScript, the email values, and the `tokens.css` and Figma files written from them.
- `packages/server/` — env settings, monitoring, analytics, hmac, retry, concurrency, and the public fetch: everything
  that reads `Bun.env` or a server SDK.
- `packages/db/` — Drizzle schema, migrations, quotas, the Redis store, object storage, and the database claim. Neon
  Postgres, Redis, and R2.
- `packages/emails/` — the react-email templates, the send every email goes through, and unsubscribe.
- `packages/models/` — LiteLLM, the model roles, budgets, the guard, telemetry, speech, transcription, image text,
  ffmpeg, and the prompts under `prompts/`.
- `packages/pipeline/` — the scan pipeline: ingesters, review, chat replies and retrieval, attachments, link previews,
  the podcast episode, and the Temporal client.

Beside them at the root:

- `infra/` — the service configs the app runs beside: litellm, llm-guard, the Northflank pipelines, and the cloudflared
  dev tunnel that Sign in with Apple's dev callback runs through.
- `content/blog/` — the blog posts `apps/api/content.ts` serves.
- `patches/` — the dependency patches `bun install` applies, named in the root package.json's `patchedDependencies`.
- `evals/` — the evals that measure the model-facing prompts, their graders, and the review pipeline, one folder each,
  and `evalHarness.ts`, which the promptfoo evals share. They make real model calls, so no eval runs in `bun test`.
  The Evals workflow runs the promptfoo evals in CI, report-only.

Each app and package has its own AGENTS.md with entry points, layout, and commands.

## Routing table

| Task | Open | Skill | Skip |
|---|---|---|---|
| New or changed ingester | `packages/pipeline/ingest/` (`ingester.ts` is the interface) | ingester-authoring | `apps/api/`, `apps/web/` |
| Model-facing prompt | `packages/models/prompts/*.md` + its thin builder | prompt-authoring | everything outside `packages/models/prompts/` and the builder's own folder |
| Schema or migration | `packages/db/schema/<domain>.ts`, then `bun run db:generate` | domain-model | `packages/db/migrations/` (generated) |
| UI screen or component | `apps/web/src/routes/` for the route and its head, `apps/web/src/pages/`, `apps/web/src/components/<area>/`; the Storybook MCP server's catalog (`bun run dev:storybook`) before writing a component; a story beside every primitive and shared component | jsx-conventions | `apps/api/`; the request and response types are in `packages/contracts/` (`payloads.ts`, `topicPayloads.ts`, and the contracts) |
| Design token, type role, or email color | `packages/nightshift/` (`colors.ts`, `radius.ts`, `typography.ts`, `email.ts`), then `bun run nightshift:write` | — | `packages/nightshift/tokens.css` and `packages/nightshift/figma/` (generated) |
| Tasting note or sync change | `apps/api/note/`, `apps/web/src/components/note/` | domain-model | `apps/worker/`, `packages/pipeline/` |
| API route or permission | `apps/api/<domain>/`, `apps/api/authorization.ts` | domain-model | `apps/worker/`; `packages/pipeline/` and `packages/models/` beyond the modules the route imports |
| Temporal workflow change | `apps/worker/workflows/`, `apps/worker/temporal.ts` | — | `apps/web/`, `apps/api/` route files |
| Email template or send | `packages/emails/*.tsx`, `packages/emails/email.ts`, `packages/pipeline/notify.ts` | — | `apps/web/` |
| Release notes | `apps/api/releases.ts`, the convention in `apps/docs/release-notes.md` | domain-model, write-docs | `apps/web/` except the footer link |
| Docs page | `apps/docs/src/content/`, its shared pieces in `apps/docs/src/components/`, the video plugin `apps/docs/src/topicTutorialVideoPlugin.ts`, then `bun run docs:embed` | write-docs | `apps/docs/dist/` (built) |
| Eval work | `evals/README.md`, `evals/evalHarness.ts`, `evals/evalChecks.ts`, `evals/<eval>/`, `.github/workflows/evals.yml`, `.github/workflows/llm-guard-update.yml` | prompt-authoring | app modules except the function the eval calls |
| Podcast episode, player, feed, or cover | `packages/pipeline/podcast/`, `apps/worker/workflows/recordPodcastEpisode.ts`, `apps/api/podcast/`, `apps/api/share/podcastFeed.ts`, `apps/api/share/podcastCover.ts`, `packages/models/speech.ts`, `packages/contracts/podcastEpisodes.ts`, `packages/server/podcastEpisodeSettings.ts`, `packages/server/podcastCoverPaths.ts`, `apps/web/src/components/podcast/`, `apps/web/src/pages/PodcastEpisodePage.tsx` | domain-model, prompt-authoring | `packages/db/migrations/` |
| Mobile screen or setup | `apps/mobile/app/` for the routes, `apps/mobile/src/` for the app's own logic, `packages/nightshift/uniwindCss.ts` for the theme, the accessibility bar in `apps/mobile/AGENTS.md` | jsx-conventions | `apps/api/`; every `@carlnotes` package outside the universal four — the boundary check enforces it |
| MCP tool, MCP card, Topic Tool, or the Add to AI dialog | `apps/api/mcp/`, `apps/api/tool/`, `apps/web/src/mcpCards/`, `apps/web/src/components/common/AddToAiDialog.tsx` | domain-model | `apps/worker/`; `packages/pipeline/` and `packages/models/` beyond `budget.ts` and the modules the tool imports |

Domain vocabulary is canonical and enforced, so grepping a domain noun reliably finds its code.

## Never read

Generated or archived paths that burn context:

- `packages/db/migrations/` — generated SQL and snapshots; the schema is `packages/db/schema/`
- `apps/web/src/routeTree.gen.ts` — the route tree Vite generates from `apps/web/src/routes/`; the routes are the files
- `apps/web/dist/`, `apps/docs/dist/` — built web app, component browser, and docs output
- `packages/nightshift/tokens.css`, `packages/nightshift/uniwind.css`, `packages/nightshift/figma/` — generated from
  the Nightshift TypeScript source
- `apps/mobile/uniwind-types.d.ts` — the class-name declarations Uniwind generates from the theme; the source is
  `packages/nightshift/uniwindCss.ts`
- `coverage/` — test coverage output
- `openspec/changes/archive/` — archived OpenSpec changes
- `.agents/skills/{ai-sdk,vercel-react-best-practices,web-design-guidelines,impeccable,ponytail}/` — vendored skills,
  loaded on demand
- `bun.lock`, `skills-lock.json` — lockfiles
- `node_modules/`

## Verification

`bun run check` is the gate: Biome, the package boundary check, `tsc -b`, the Temporal workflow bundle check, and the
test suite. Green before any hand-off.

## Rules (always-on)

- Comment every logical group: `//` comment line(s) above every group of 2+ statements, one line preferred.
- A `package.json` lives at the root, in `apps/<name>/`, or in `packages/<name>/`. The module map above has the import
  order. A universal package (`contracts`, `client`, `core`, `nightshift`) depends only on universal packages and holds
  no Bun, Node, or DOM global. A module goes to the lowest package whose dependencies it needs, among the packages that
  import it. `scripts/check-structure.sh` and `scripts/check-package-boundaries.ts` enforce it.
- State lives in module scope behind exported functions, in a `packages/core/stores/` or `apps/web/src/stores/` module,
  or in a hook. Author a class only for an `Error` subclass, or for many instances with their own lifecycle that
  something outside holds, as `apps/web/src/components/note/noteProvider.ts` does. A single-instance class is a
  singleton, which is a module with extra steps.
- Domain nouns and rejected terms: the `domain-model` skill is the single source.
- Follow vs subscribe: the domain-model skill owns the rule. Copy says follow, identifiers say subscribe.
- Bash runs from the repo root: relative paths only, never prefix commands with cd. Scripts and hooks assume repo-root cwd.
- Diagnostic and probe commands must be static: never `$(...)`, backticks, `${...}` expansion, or `find -exec` —
  permission rules cannot auto-allow these, so every use prompts. Read files with the Read tool; extract JSON with `jq`,
  preferred over `python3 -c`.
- Never print secret values. Check presence with `grep -c '^NAME=' .env`; the agent shell has no Doppler-injected
  secrets, so verify env wiring by running the real command under `doppler run` and reading its output.
- Check `package.json` scripts before opening the README; the README's Development section explains them.
- Per-process scripts are `dev:<module>` / `build:<module>`; bare `dev` is the multi-process orchestrator, and no bare
  `build` exists — the Dockerfile runs the `build:<module>` scripts itself. When adding or changing package.json
  scripts, update the README Development section in the same change.
- A process started from outside the repo, a Northflank service, job, or cron, runs through a root script, never a
  file path, so moving a file changes only the script. Add the script in the same change as the process. The
  exceptions are the image's `CMD`, which the `app` service starts from, and the worker in `smoke.yml`, whose env
  override has to follow `doppler run`.
- Structure changes update the docs in the same change: a new, moved, renamed, or deleted folder, entry point, or script
  is included in the workspace's AGENTS.md, and in the root module map or routing table when it changes what they say.
- Thorough beats narrow scope. A fix, a split, or a follow-up the change can do now is done in the change, never
  deferred to "its own change" or a recommendation. Only work that needs the user's decision is left out, and it is
  named with the reason.
- Commits: ask first. "go ahead" at session start pre-approves commits for that session. Never push unless explicitly asked to.
- Ship via /ship. Archive OpenSpec changes with the CLI (`openspec archive <name> --yes`), never /opsx:archive.

## Skills

Rules agents and reviewers must honor, source copies at `.agents/skills/`:

- domain-model: the canonical domain vocabulary and its rejected terms
- ingester-authoring: ingesters return Resources only, never Findings; idempotent by canonical URL; one failing Source
  never aborts a Scan batch
- prompt-authoring: model-facing prompts live as versioned markdown under `packages/models/prompts/` with frontmatter
  and `{{variable}}` bodies, loaded by thin builders; never inline string literals; Carl addresses a "reader" where the
  app's code says "user"
- code-style, jsx-conventions, git-discipline: shared readability and git rules
- write-docs: clear, persuasive prose for READMEs, design docs, proposals, PR descriptions, and release notes
- vendored guidance: vercel-react-best-practices, web-design-guidelines, ai-sdk, impeccable, ponytail
