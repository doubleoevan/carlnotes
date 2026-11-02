## Context

See proposal.md for why. Preflight (`scripts/preflight.sh`) runs Biome, six repo checks, `tsc -b`, the workflow bundle
check, and `bun test --coverage`. The pre-push hook and the CI `gate` job both run that one script, so a step added
there reaches every gate. Fourteen workspaces sit under `apps/*` and `packages/*`, plus the root workspace, which owns
`scripts/`, `evals/`, `ui-tests/`, and the root `devDependencies`, the `@carlnotes/*` workspaces included.

Several entry points are invisible to import tracing:

- `apps/worker/temporal.ts` passes six workflow files to Temporal as
  `new URL("./workflows/<name>.ts", import.meta.url)`.
- `scripts/smoke-coverage.sh` and `scripts/image-smoke.sh` run TypeScript files by path. The Dockerfile `CMD` runs
  `apps/api/index.ts`.
- `dev:email` previews every template in `packages/emails` by folder.
- Most package.json scripts wrap the file in `doppler run --` or `bun --watch`, which Knip has to see through.

`bunfig.toml` sets a three-day `minimumReleaseAge`. Knip 6.44.1 was published 2026-10-31, so the install takes the
newest version at least three days old.

## Goals / Non-Goals

**Goals:**

- One config that a reader can audit: every exception names one item and says where that item is used.
- A clean first report, reached by deleting dead code, not by widening ignores.

**Non-Goals:**

- Production mode (`knip --production`). Code that only a test uses still counts as used. A production-only pass
  would flag test helpers, a different question from dead code.
- Unused class members. This repo authors no classes beyond `Error` subclasses (AGENTS.md rule), so the rule has
  nothing to find.
- Replacing the package boundary check. Knip's unlisted-dependency report overlaps it. The boundary check stays the
  source of the workspace rules, and the two agree on a correct tree.

## Decisions

**One `knip.jsonc` at the root, with a `workspaces` map.** Keys are `.`, `apps/*`, and `packages/*`, with a
per-workspace block only where a workspace needs its own entries or ignores. JSONC over JSON, because the spec
requires each exception to say where its item is loaded, and a comment beside the entry is the only place that note
can live. Alternative: a `knip.ts` config. It adds a TypeScript entry that Knip then has to trace, for no gain.

**Plugins first, then hand-declared entries.** Run `bunx knip` with only the workspaces map and the `ignore` list for
generated paths. Read which entries each plugin enabled (`knip --debug` lists them). Declare by hand only the entries
it still misses. Expected misses, to confirm against the first report:

- The six Temporal workflow files, declared in the `apps/worker` block.
- Each file that only `scripts/smoke-coverage.sh`, `scripts/image-smoke.sh`, or the Dockerfile runs, if Knip's
  package.json script parser does not already reach it through another script.
- The `packages/emails` templates, if the react-email preview is the only caller.
- Root scripts with no package.json script, such as `scripts/backfill-resource-content.ts` and
  `scripts/backfill-vectors.ts`. These are triage items, not automatic entries. A one-off backfill with no caller is a
  delete candidate, unless the user wants it kept for planned work.

Alternative: declare every root `scripts/*.ts` and `evals/**/*.ts` by glob. Rejected, because a glob hides exactly
the dead file this check exists to find.

**Entry exports are reported in the workspaces that export every file.** Every package and `apps/api` export
`"./*": "./*.ts"` from `package.json`. Knip makes each exported file an entry, with no option to turn that off, and by
default it never reports an entry's exports. That left Knip blind in exactly the workspaces most code lives in: the
first report found nothing in any package. `includeEntryExports: true` on `packages/*` and `apps/api` reports every
export no other file imports, so a dead module shows up through its exports. The web, mobile, docs, and worker apps
keep the default, because their entries are routes, stories, and configs whose exports a framework reads. Alternative:
list each package's exports by path. Rejected, because it adds a list to maintain for every new module and changes
how every import resolves.

**Doppler-wrapped scripts are entries by hand.** Knip reads through a fixed list of wrapper binaries, and `doppler` is
not on it. Each file a `doppler run --` script runs is declared once, beside the script that runs it.

**Only the vendored trees go in the top-level `ignore`.** `.agents/` and `.opencode/` hold vendored skills and the
bundled OpenCode install, whose scripts no import reaches. These are whole vendored trees, not exceptions to a finding,
so the one-item rule does not apply to them. The generated paths need no entry. Knip skips everything `.gitignore`
names, which covers the `dist/` folders, `coverage/`, `ui-tests/output/`, and the `*.local.ts` root files.
`openspec/`, `.claude/`, `packages/db/migrations/`, and `ui-tests/baselines/` hold no file Knip reads. The tracked
generated modules, `apps/web/src/routeTree.gen.ts` and `apps/mobile/.rnstorybook/storybook.requires.ts`, are plugin
entries, and `apps/mobile/uniwind-types.d.ts` is a declaration file, so Knip reports nothing in them. Its configuration
hints flagged each of those three as an `ignore` entry that matched nothing, and they came out.

**Default issue types.** Files, dependencies, devDependencies, unlisted, unresolved, binaries, exports, types, enum
members, and duplicate exports. An unused exported type is dead code the same as an unused function.

**Triage rule, per finding, before any edit.** Search the whole repo for the name and the path: package.json scripts,
the Dockerfile, `infra/`, `.github/workflows/`, `new URL(...)`, dynamic `import()`, and the docs. Then:

1. Referenced by path or string anywhere: not dead. Declare it as an entry, or give it the narrowest ignore, with a
   comment that names the loader.
2. Referenced nowhere: delete it. `knip --fix` removes unused exports and dependencies mechanically. A file deletion
   goes by hand with `git rm`, so each one is reviewed.
3. Deleting it would remove a user-facing feature or code for planned work: keep it with a one-item ignore, and add
   it to one list for the user in `logs/ship-report.md`.

After each batch, rerun `bunx knip` and `bash scripts/preflight.sh`, and fix whatever they surface. `tsc -b` and the
test suite prove that nothing in use went. Repeat until both are clean.

**Placement in preflight: right after the package boundary check.** Both checks read the import graph. A boundary
failure, such as a cross-app import, explains a Knip finding, so the boundary check runs first. Knip runs before
`tsc -b`, because it finishes in seconds and fails fast.

**Gate proof by a temporary breakage.** Add an unused export to a `packages/core` module, run preflight, and see it
fail naming the export. Revert. Add an already-installed package to `apps/api/package.json` without importing it, run
preflight, and see it fail naming the package. Revert. No `bun install` runs, so the lockfile never changes.

**The Metro plugin is off in `apps/mobile`.** Knip's Metro plugin loads `metro.config.js`, and its `withStorybook`
wrapper rewrites `.rnstorybook/storybook.requires.ts` on every load, so each Knip run left that tracked file changed.
`metro.config.js` is a plain entry instead, and the Storybook plugin still reads `.rnstorybook/main.ts`, which names
the on-device addons.

**Import cycles break at a leaf module.** Each cycle that `noImportCycles` reports breaks by moving the code both
sides need into a module that imports neither side: the chat page type, the feed cache keys and clears, the
subscription start dates, the scheduled topic filter, and the two Drizzle tables whose foreign keys crossed files.
Moving a table between schema files changes no table, so `bun run db:generate` writes no migration. Alternative: a
`biome-ignore` on each cycle. Rejected, because a Drizzle foreign key thunk is the only cycle that is safe at load
time, and the rule cannot tell it apart from one that is not.

**The class merge restriction keeps `cn`.** The shadcn CLI writes `import { cn } from "cn"` whatever
`components.json` says, so the `cn` entry stays beside the new `clsx` and `tailwind-merge` entries, with the same
message. `packages/nightshift/classNames.ts` turns the rule off through an override, the one file that wraps both
libraries.

## Risks / Trade-offs

- [A plugin misses an entry, so Knip reports a live file as unused] → The triage rule searches before deleting, and
  `tsc -b`, the tests, and `check-workflow-bundles.ts` fail on a deleted file that is still imported. A file loaded only
  by path has no import to fail on, which is why the search step names `new URL(...)`, the Dockerfile, and shell
  scripts.
- [The first report is large, and `knip --fix` deletes an export that a type-only consumer or a story uses] → `--fix`
  reads the same graph that found the export unused, so a story or test import keeps it. Run `--fix` per issue type,
  and run preflight after each type.
- [Preflight gets slower] → Knip runs once over the whole repo. Measure its time on the clean tree and record it in the
  ship report.
- [A Knip upgrade adds an issue type or changes a plugin and breaks preflight on an unrelated push] → Dependabot
  bumps arrive as their own pull request, and the CI gate runs Knip on it before merge.
- [Contributors meet a new blocking failure] → The README, CONTRIBUTING, and `/ship` docs name the check and say how
  to declare an entry.

## Migration Plan

One commit: the dependency, the config, the deletions, the preflight step, and the docs. Rollback is a revert of that
commit. Deleted code returns with it.
