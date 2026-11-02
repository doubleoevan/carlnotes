# Tasks

Implement [the component-conventions spec](specs/component-conventions/spec.md) using the inspected decisions in [design.md](design.md). All tasks below are implementation work; none is completed by proposing this change.

## 1. Establish scope and reuse Biome

- [x] 1.1 Add the feature-root classification policy, Nightshift contract mapping, exact compound primitive designations with reasons, and six-file adopted set. Verify passing/excluded fixtures for routes, entrypoints, stories, tests, TSX fixtures, generated files, and primitives; reject duplicate or stale records.
- [x] 1.2 Add `biome.components.json` extending the root config, with export-only modules, export-based filenames, and no nested components. Add CLI fixtures proving private support passes and mixed runtime exports/nested components fail. Verify the inspected multi-export, generic `Props`, and matching-type loopholes remain covered by the planned structural layer.
- [x] 1.3 Add `@babel/parser` as a direct root development dependency and update the lockfile with the package manager. Verify a generic TSX fixture parses with source locations under Bun; retain TypeScript 7 for type-checking.
- [x] 1.4 Document the focused convention in `.agents/skills/jsx-conventions/SKILL.md` and link it from root `AGENTS.md`. Verify the text permits shared/composed props and private support, preserves Nightshift APIs, and explains that legacy files are report-only.

## 2. Implement structural gaps with fixtures

- [x] 2.1 Implement module-local component/export analysis in `scripts/componentConventions.ts`. Verify fixtures for declarations, arrows, generics, named defaults, local export lists, aliases, memo/forwardRef, and type-only exports using `bun test scripts/componentConventions.test.ts`.
- [x] 2.2 Add primary-count and primary-name diagnostics, including missing components and the type-export naming loophole. Verify failures include rule ID and location; ensure private subcomponents, comments, and export-like strings are not counted.
- [x] 2.3 Add component-owned props-name analysis. Verify local `Props` fails, `ComponentNameProps` passes, and imported/composed props, private model types, exported adapter types, props-free components, and small inline annotations pass.
- [x] 2.4 Make unknown wrappers and external component re-exports require review, while parser errors fail the scan. Verify fixtures distinguish review from malformed input and do not silently count either as clean.
- [x] 2.5 Document checker scope and its syntax-analysis limits beside the script entry in root `AGENTS.md`. Verify every documented rule has a passing and failing or exclusion fixture, with no duplicated Biome implementation.

## 3. Deliver the report and strict commands

- [x] 3.1 Add `scripts/check-component-conventions.ts` and root `report:components` / `check:components` scripts. Delegate the three built-in rules to the installed Biome binary and combine its diagnostics with structural results. Verify the same fixture produces equivalent findings in both modes, without duplicate rule findings.
- [x] 3.2 Add sorted text/JSON inventory with classifications, relative paths, rule locations, unique-file counts, and separate diagnostic totals. Verify two unchanged JSON reports are identical and counts reconcile across checked, excluded, and requiring-review files.
- [x] 3.3 Add CLI tests in `scripts/componentConventionsCli.test.ts` for report success with violations, strict failure with violations/review cases, parser/tool/configuration failures, stale paths, invalid options, and empty strict selections. Verify with `bun test scripts/componentConventions.test.ts scripts/componentConventionsCli.test.ts`.
- [x] 3.4 Document both commands and their exit behavior in README Development. Run the documented report commands before component edits and save the initial inventory with implementation evidence. Verify known `AccountFields` and `TablePagination` findings are reported, not silently exempted.

## 4. Migrate the representative components

- [x] 4.1 Capture baseline rendered states for the three migration cases and inspect the Storybook catalog before editing stories. Verify evidence includes IconButton interaction states, link/loading/YouTube cards, and web/mobile ThinkingLine in matching themes.
- [x] 4.2 Introduce web `IconButtonProps` while retaining the private class constant and existing JSX. Verify strict validation for that file and confirm tooltip accessible naming, disabled behavior, click behavior, and class overrides through existing stories or focused interaction checks.
- [x] 4.3 Introduce `LinkPreviewCardProps`, extract `LinkPreviewLoading.tsx`, and remove the helper re-export. Update `ChatTurnBlock`, `ChatRoomMessageBubble`, `TopicResourceInfo`, and all other discovered import consumers to direct imports. Verify search finds no imports of removed exports and all loading, link, and YouTube states retain their behavior.
- [x] 4.4 Preserve existing LinkPreviewCard story IDs and add a story beside LinkPreviewLoading. Update the web AGENTS.md module description. Verify the Storybook catalog includes the extracted component and existing loading story, and their rendered output matches the baseline.
- [x] 4.5 Introduce core `ThinkingLineProps` and consume shared/composed props in the web/mobile adapters. Preserve `ThinkingLineTextProps`, module-level adapters, and core state initialization. Verify `bun test apps/web/src/components/common/ThinkingLine.test.tsx` and strict validation for all three files; compare both platforms' existing stories.
- [x] 4.6 Record the migration in affected web/mobile/core guidance where module ownership or structure changes. Verify only the five selected existing components, the extracted loading component, their direct consumers/stories, and necessary tooling/docs were changed; leave unrelated legacy findings in the inventory.

## 5. Integrate and validate the bounded rollout

- [x] 5.1 Add `bun run check:components` to preflight for the six-file adopted set. Ensure Knip reaches the command through root scripts, adding only an exact entry if required. Verify an adopted-set regression fails and an untouched legacy violation remains non-blocking for this new check.
- [x] 5.2 Run `bun run report:components`, `bun run report:components -- --json`, and `bun run check:components`. Save the final inventory, reconcile it against the initial report, and verify zero findings/review cases in the adopted set without new broad exclusions.
- [x] 5.3 Run `bun test scripts/componentConventions.test.ts scripts/componentConventionsCli.test.ts`, `bun scripts/check-component-parity.ts`, and `bun run check`. Verify all pass and existing Nightshift contracts, shared component relationships, and package boundaries remain intact.
- [x] 5.4 Run `bun run visual:select -- --base f301c5cc`, `bun run visual:web`, and `bun run visual:report`. Compare affected web captures with baseline states and inspect the mobile ThinkingLine story on a development build. Verify no unintended structure, appearance, accessibility, interaction, or rerender-state changes; record exact blockers without claiming missing checks passed.
- [x] 5.5 Run `openspec validate clean-component-conventions --strict` and review the final diff against the acceptance criteria. Verify all completed tasks have evidence, no repository-wide migration or blocking rollout was introduced, and unresolved validation remains explicitly unchecked.

Implementation results and validation evidence are recorded in [validation.md](validation.md).
