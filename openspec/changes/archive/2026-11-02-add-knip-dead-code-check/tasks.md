## 1. Install and configure Knip

- [x] 1.1 Add `knip` to the root `devDependencies` with `bun add -d knip` under the pinned Bun. Verify `bunx knip
      --version` prints the installed version and runs with the network off.
- [x] 1.2 Write `knip.jsonc` at the root with a `workspaces` map for `.`, `apps/*`, and `packages/*`, and a top-level
      `ignore` for the generated and vendored paths that design.md lists. Verify `bunx knip --debug` lists every
      workspace and every plugin it enabled, and that no ignored path appears in the report.
- [x] 1.3 Confirm which entries the plugins and the package.json script parser found: every `doppler run -- bun
      <file>` and `bun --watch <file>` script, the Expo routes, the Storybook stories, the Vite and Astro configs, the
      Drizzle config, the test and smoke files, and the eval and ui-tests scripts. Record each gap for task 1.4.
- [x] 1.4 Declare by hand, with a comment naming the loader, only the entries still missing: the six Temporal
      workflow files `apps/worker/temporal.ts` loads through `new URL(...)`, each file only a shell script or the
      Dockerfile runs, and the `packages/emails` templates if react-email's folder preview is their only caller.
      Verify none of them appears as an unused file in `bunx knip`.

## 2. Clear the first report

- [x] 2.1 Save the first full report to `logs/knip-first-report.txt` (gitignored) as the baseline for the ship
      report's counts.
- [x] 2.2 Triage every unused file by the design's rule: search package.json scripts, the Dockerfile, `infra/`,
      `.github/workflows/`, `new URL(...)`, dynamic `import()`, and the docs for its path and name. Delete the
      unreferenced ones with `git rm`, declare the referenced ones, and list the keep-for-the-user ones. Verify
      `bunx knip --include files` is clean, then run `bash scripts/preflight.sh`.
- [x] 2.3 Triage every unused dependency, devDependency, unlisted dependency, and binary the same way, including the
      `@carlnotes/*` workspaces in the root `devDependencies`. Remove the dead ones with `bunx knip --fix --fix-type
      dependencies`, then `bun install` under the pinned Bun. Verify `bunx knip --include
      dependencies,devDependencies,unlisted,binaries` is clean, then run preflight.
- [x] 2.4 Triage every unused export, exported type, enum member, and duplicate export the same way. Remove the dead
      ones with `bunx knip --fix --fix-type exports,types`, then delete any file the removal left empty. Verify `bunx
      knip --include exports,types,enumMembers,duplicates` is clean, then run preflight.
- [x] 2.5 Give each remaining true false positive the narrowest ignore: one file, one export through
      `ignoreExportsUsedInFile` only if no narrower option exists, or one dependency, never a glob, each with a
      comment naming where it is used. Verify `bunx knip` exits 0 with an empty report.
- [x] 2.6 Update every AGENTS.md that lists a deleted file, folder, or script, and the root "Never read" list if a
      generated path moved. Verify `git grep` finds no doc reference to a deleted path.

## 3. Gate preflight on Knip

- [x] 3.1 Add `bunx knip` to `scripts/preflight.sh` right after the package boundary check, with a comment in the
      script's style. Verify `bash scripts/preflight.sh` prints `preflight green`, and record how long the Knip step
      took.
- [x] 3.2 Prove the export rule: add an unused exported function to a `packages/core` module, run preflight, and see
      it fail naming the module and the export. Remove it and see preflight pass.
- [x] 3.3 Prove the dependency rule: add an already-installed package that `apps/api` does not import to
      `apps/api/package.json` without running `bun install`, run preflight, and see it fail naming the file and the
      package. Revert it and see `git diff apps/api/package.json bun.lock` is empty and preflight passes.
- [x] 3.4 Set `treatConfigHintsAsErrors` in `knip.jsonc`, so an entry or an ignore that matches nothing fails the run.
      Prove it with an entry for a file that does not exist, then remove the entry.

## 4. Docs

- [x] 4.1 Add `bunx knip` to the verification gate in `CLAUDE.md` and to the Verification section of `AGENTS.md`,
      after the package boundary check.
- [x] 4.2 Update the README's Checks section, its `bun run check` comment line, and the command list under it with a
      `bunx knip` line, and say how Knip finds entry points and where a missed one is declared. The Deploy safety
      table keeps its rows, since each one stops a build that cannot render pages, and dead code does not. Add the
      `knip` command to the README Development section if a script is added.
- [x] 4.3 Update `CONTRIBUTING.md`'s Gates paragraph and `apps/docs/ai-scaffolding.md`'s pre-push paragraph to list
      every preflight step, Knip included, with one sentence on declaring an entry in `knip.jsonc`.
- [x] 4.4 Rewrite step 4 of `.agents/commands/ship.md` to name every step preflight runs, Knip included, instead of
      Biome, the type check, and the tests alone. Verify the `.claude/commands/ship.md` symlink still resolves to it.
- [x] 4.5 Run `openspec validate add-knip-dead-code-check --strict` and see it pass.

## 5. Ship report

- [x] 5.1 Write `logs/ship-report.md` with three lists: what was deleted (files, exports, dependencies), what was
      declared or ignored and where each item is loaded, and the items left for the user to decide with the reason
      each was kept. Include the first report's counts from task 2.1 and the Knip step's run time.

## 6. Biome guardrails

- [x] 6.1 Restrict `clsx` and `tailwind-merge` in `noRestrictedImports` beside `cn`, with the same message, and turn
      the rule off for `packages/nightshift/classNames.ts` through an override. Verify with probe files that a direct
      `tailwind-merge` or `clsx` import fails and an import of `cn` from `@carlnotes/nightshift/classNames` passes,
      then delete the probes.
- [x] 6.2 Turn on `suspicious/noImportCycles` at error level and break every cycle it reports by moving the shared
      code into a leaf module. Verify with two probe files that import each other that the rule fails, delete them,
      and see `bun run db:generate` report no schema change.
- [x] 6.3 Update the AGENTS.md of each workspace whose files moved, and add the moved names to the drift list in
      `.agents/commands/audit-structure.md`.

## Workflow follow-up

- Run `/ship` for the change, which archives it with `openspec archive add-knip-dead-code-check --yes`.
