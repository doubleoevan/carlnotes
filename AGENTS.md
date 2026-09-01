# CarlNotes agent guide

## Module map

Dependency order: `ui` → `api` / `worker` → `db` → `shared`. The boundary is a rule, compile-enforced
by tsconfig project references (`bunx tsc -b`): ui never imports api, worker, or db; api and worker
import db; every module imports shared; shared imports nothing app-level.

- `ui/` — the Vite React SPA: pages, components, typed API clients, and the stores behind them.
- `api/` — the Hono server: routes, authorization, billing, chat rooms, tasting notes, teams, invites, share cards, SEO pages.
- `worker/` — Temporal workflows, the scan pipeline, ingesters, chat replies, link previews, prompts, email delivery.
- `db/` — Drizzle schema, migrations, quotas. Neon Postgres.
- `shared/` — what every module may import: the zod contracts, enums, plans, and Source definitions.
- `infra/` — the service configs the app runs beside: litellm, llm-guard, and the Northflank pipelines.
- `content/blog/` — the blog posts `api/content.ts` serves.

Each module has its own AGENTS.md with entry points, layout, and commands.

## Routing table

| Task | Open | Skill | Skip |
|---|---|---|---|
| New or changed ingester | `worker/ingest/` (`ingester.ts` is the interface) | ingester-authoring | `api/`, `ui/` |
| Model-facing prompt | `worker/prompts/*.md` + its thin builder | prompt-authoring | everything outside `worker/` |
| Schema or migration | `db/schema.ts`, then `bun run db:generate` | domain-model | `db/migrations/` (generated) |
| UI screen or component | `ui/src/pages/`, `ui/src/components/<area>/` | jsx-conventions | `api/` except `shared/contracts.ts` types |
| Tasting note or sync change | `api/note/`, `ui/src/components/note/` | domain-model | `worker/` |
| API route or permission | `api/<domain>/`, `api/authorization.ts` | domain-model | `worker/` except `worker/index.ts` exports |
| Temporal workflow change | `worker/workflows/`, `worker/temporal.ts` | — | `ui/`, `api/` route files |
| Email template or send | `emails/*.tsx`, `worker/email.ts`, `worker/notify.ts` | — | `ui/` |
| Docs page | `docs/src/content/`, its shared pieces in `docs/src/components/`, then `bun run docs:embed` | — | `docs/dist/` (built) |
| Eval work | `evals/README.md`, `.github/workflows/llm-guard-update.yml` | — | app modules |

Domain vocabulary is canonical and enforced, so grepping a domain noun reliably finds its code.

## Never read

Generated or archived paths that burn context:

- `db/migrations/` — generated SQL and snapshots; the schema is `db/schema.ts`
- `ui/dist/`, `docs/dist/` — built UI and docs output
- `coverage/` — test coverage output
- `openspec/changes/archive/` — archived OpenSpec changes
- `.agents/skills/{ai-sdk,vercel-react-best-practices,web-design-guidelines,impeccable,ponytail}/` — vendored skills, loaded on demand
- `bun.lock`, `skills-lock.json` — lockfiles
- `node_modules/`

## Verification

`bun run check` is the gate: Biome, `tsc -b`, the Temporal workflow bundle check, and the test suite.
Green before any hand-off.

## Rules (always-on)

- Comment every logical group: `//` comment line(s) above every group of 2+ statements, one line preferred.
- One package.json. Folders separate concerns; packages separate deployments.
- Domain nouns and rejected terms: the `domain-model` skill is the single source.
- Follow vs subscribe: the domain-model skill owns the rule. Copy says follow, identifiers say subscribe.
- Bash runs from the repo root: relative paths only, never prefix commands with cd. Scripts and hooks assume repo-root cwd.
- Diagnostic and probe commands must be static: never `$(...)`, backticks, `${...}` expansion, or `find -exec` — permission rules cannot auto-allow these, so every use prompts. Read files with the Read tool; extract JSON with `jq`, preferred over `python3 -c`.
- Never print secret values. Check presence with `grep -c '^NAME=' .env`; the agent shell has no Doppler-injected secrets, so verify env wiring by running the real command under `doppler run` and reading its output.
- Check `package.json` scripts before opening the README; the README's Development section explains them.
- Per-process scripts are `dev:<module>` / `build:<module>`; bare `dev` is the multi-process orchestrator, and no bare `build` exists — the Dockerfile runs the `build:<module>` scripts itself. When adding or changing package.json scripts, update the README Development section in the same change.
- Structure changes update the docs in the same change: a new, moved, renamed, or deleted folder, entry point, or script is included in the module's AGENTS.md, and in the root module map or routing table when it changes what they say.
- Commits: ask first. "go ahead" at session start pre-approves commits for that session. Never push unless explicitly asked to.
- Ship via /ship. Archive OpenSpec changes with the CLI (`openspec archive <name> --yes`), never /opsx:archive.

## Skills

Rules agents and reviewers must honor, source copies at `.agents/skills/`:

- domain-model: the canonical domain vocabulary and its rejected terms
- ingester-authoring: ingesters return Resources only, never Findings; idempotent by canonical URL; one failing Source never aborts a Scan batch
- prompt-authoring: model-facing prompts live as versioned markdown under `worker/prompts/` with frontmatter and `{{variable}}` bodies, loaded by thin builders; never inline string literals; Carl addresses a "reader" where the app's code says "user"
- code-style, jsx-conventions, git-discipline: shared readability and git rules
- vendored guidance: vercel-react-best-practices, web-design-guidelines, ai-sdk, impeccable, ponytail
