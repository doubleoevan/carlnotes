# Proposal

## Why

No check finds dead code across files. Biome lints one file at a time, and the package boundary check catches an
undeclared package but not an unused file, an unused export, or a declared dependency that nothing imports. Knip finds
all three. It is ISC-licensed, runs offline so preflight stays offline, and has plugins for the tools this repo runs:
Bun, Expo, Metro, Storybook, Vite, Astro, Drizzle, Biome, Playwright, and GitHub Actions.

## What Changes

- Add `knip` as a root dev dependency, with one config at the root that covers the root workspace, `apps/*`, and
  `packages/*`. The config leaves out `openspec/`, generated output, the vendored skills under `.agents/`, and
  `.opencode/`.
- Let Knip's plugins find entry points first. Declare by hand only the entries they miss, and name where each one is
  loaded: the Temporal workflow files `apps/worker/temporal.ts` loads through `new URL(...)`, files only a shell script
  or the Dockerfile runs, and the email templates `react-email` previews by folder.
- Fix the whole first report in this change. Delete every dead file, export, and dependency that nothing references.
  Give each true false positive the narrowest ignore Knip offers, one named file, export, or dependency, never a glob.
- **BREAKING (for contributors)**: preflight runs `bunx knip` right after the package boundary check. A push that adds
  an unused file, export, or dependency fails the pre-push hook, the CI gate, and `/ship` step 4.
- Turn on two Biome guardrails beside it. `noRestrictedImports` fails a direct `clsx` or `tailwind-merge` import
  outside `packages/nightshift/classNames.ts`, as well as an import from a package named `cn`, so every class merge
  goes through Nightshift's `cn`. `suspicious/noImportCycles` runs at error level, and this change breaks every cycle
  it reports by moving the shared code into a module that imports neither side.
- Update every doc that lists the gate: the verification gate in `CLAUDE.md`, `AGENTS.md`'s Verification section, the
  README's Checks section and its checks table, `CONTRIBUTING.md`, `apps/docs/ai-scaffolding.md`, and step 4 of
  `.agents/commands/ship.md`, which still says preflight runs only Biome, the type check, and the tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-structure`: adds a requirement that preflight fails on an unused file, an unused export, or a declared
  dependency that nothing imports, beside the package boundary rules preflight already enforces, and a requirement
  that preflight fails on an import cycle.
- `design-system`: adds a requirement that class names merge only through Nightshift's `cn`.

## Impact

- Root `package.json` and `bun.lock`: `knip` in `devDependencies`. Each workspace's `package.json` loses the
  dependencies the report proves unused.
- New `knip.json` at the root.
- Source across `apps/`, `packages/`, `scripts/`, `evals/`, and `ui-tests/`: dead files and exports deleted. The exact
  list comes from the first report and goes in the ship report.
- `biome.json`: the two guardrails. The cycles broke by moving code into new leaf modules:
  `apps/api/chat/chatPages.ts`, `apps/api/topic/feedCaches.ts`, `apps/api/topic/subscriptionStartDates.ts`,
  `apps/worker/scheduledTopicFilter.ts`, and the `team_topics` and `topic_email_sends` tables into
  `packages/db/schema/teamTopics.ts` and `topicEmailSends.ts`, with no migration.
- `scripts/preflight.sh`, and through it `.githooks/pre-push`, the `gate` job in `.github/workflows/ci.yml`, and
  `/ship`.
- Docs: `CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `apps/docs/ai-scaffolding.md`,
  `.agents/commands/ship.md`.
- No runtime behavior changes. The type check and the tests prove that nothing in use was deleted.
