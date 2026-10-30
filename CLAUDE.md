@AGENTS.md

# Claude Code notes

## Always-on
- Bun is the runtime and package manager: `bun install`, `bun run <script>`, `bunx <pkg>`, `bun test`. Never npm/npx/node.
- The web app is the TanStack Start app on Vite in `apps/web/`: `bun run dev:ui` / `bun run build:ui`. Public pages render
  on the server, and the api renders them through the web app's server build. Do not use Bun's full-stack server
  pattern (`Bun.serve` HTML imports, `bun --hot`); that scaffold was removed.
- Bun workspaces: the four apps under `apps/` over the private `@carlnotes/<name>` packages under `packages/`. The
  module map and the package rule are in AGENTS.md.
- Postgres access goes through Drizzle in `packages/db/`. Don't reach for `Bun.sql`, `pg`, or raw clients.
- Verification gate before any hand-off: `bunx biome check .` + `bun scripts/check-package-boundaries.ts` +
  `bun scripts/check-component-parity.ts` + `bun scripts/check-client-parity.ts` +
  `bun scripts/check-purchase-paths.ts` + `bun scripts/check-contract-freeze.ts` + `bunx tsc -b` +
  `bun scripts/check-workflow-bundles.ts` + `bun test` (enforced on push by `scripts/preflight.sh`).

## Skills
Skills load from `.claude/skills/` (canonical copies at `.agents/skills/`). Follow them; they are not restated here.

## Spec-driven changes
Feature work goes through OpenSpec: `/opsx:propose` → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`. Specs live in `openspec/`.
