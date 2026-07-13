@AGENTS.md

# Claude Code notes

## Always-on
- Bun is the runtime and package manager: `bun install`, `bun run <script>`, `bunx <pkg>`, `bun test`. Never npm/npx/node.
- The UI is a Vite SPA: `bun run dev:ui` / `bun run build:ui`. Do not use Bun's full-stack server pattern (`Bun.serve` HTML imports, `bun --hot`); that scaffold was removed.
- Modular monolith: `ui/` (React SPA), `api/` (Hono), `worker/` (Temporal), `db/` (Drizzle + Neon Postgres). One `package.json` at the repo root; never add another.
- Postgres access goes through Drizzle in `db/`. Don't reach for `Bun.sql`, `pg`, or raw clients.
- Verification gate before any hand-off: `bunx biome check .` + `bunx tsc -b` + `bun test` (enforced on push by `scripts/preflight.sh`).

## Skills
Skills load from `.claude/skills/` (canonical copies at `.agents/skills/`). Follow them; they are not restated here.

## Spec-driven changes
Feature work goes through OpenSpec: `/opsx:propose` → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`. Specs live in `openspec/`.