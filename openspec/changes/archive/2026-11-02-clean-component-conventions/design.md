# Design

## Context

See [proposal.md](proposal.md) for motivation and [the capability spec](specs/component-conventions/spec.md) for required behavior.

Inspection used commit `f301c5cc`. The existing component contract and parity specs protect Nightshift exports, mirrored primitive filenames, and same-name core imports. This design adds a separate check.

| Observed source | Consequence |
| --- | --- |
| `apps/web/src/components/common/RatingThumbs.tsx` imports shared props and keeps `RatingThumb` at module scope | Treat this as an allowed reference, including its private component and imported adapter props. |
| `packages/core/components/RatingThumbs.tsx` composes shared props with an inline adapter field | Allow compositions and shared type exports without forcing redundant wrappers. |
| `apps/web/src/components/common/LinkPreviewCard.tsx` exports `LinkPreviewCard`, `LinkPreviewLoading`, and `hasPreviewableLink` | Use this bounded example for an export split and direct helper import. |
| `apps/web/src/components/common/IconButton.tsx` has a seven-field inline props annotation and a private class constant | Introduce `IconButtonProps` without moving the constant or changing JSX. |
| Core, web, and mobile `ThinkingLine.tsx` share behavior through a stable adapter | Use this family to demonstrate props composition and retained identity. |
| `packages/core/components/AccountFields.tsx` exports multiple feature components; `TablePagination.tsx` mixes hooks and components | Report these legacy modules without migrating them. They are not compound primitive exceptions. |
| `primitives/dialog.tsx` exports a compound family; `primitives/button.tsx` exposes contracted `Button` and `buttonVariants` | Preserve explicit compound families and Nightshift APIs. |
| `scripts/componentInventory.test.ts` uses source-text fixtures; `sourceFiles.ts` supplies file paths and source text | Follow the fixture style and reuse file enumeration where it fits. Do not extend parity rules into unrelated conventions. |

`package.json` declares Biome `^2.6.3` and TypeScript `^7.0.2`. The primary checkout's installed binaries were stale: Biome 2.5.15 and TypeScript 5.9.3. Probes therefore used isolated Biome 2.6.3 and TypeScript 7.0.2 installations, without changing repository dependencies.

### Biome evidence

These rules were tested together against temporary TSX fixtures using Biome 2.6.3:

| Rule | Adopted responsibility | Verified limit |
| --- | --- | --- |
| `style/useComponentExportOnlyModules` | Report mixed component and runtime helper exports; leave private support and type exports valid | Two exported components pass. It does not enforce one primary component. |
| `style/useFilenamingConvention`, `filenameCases: ["export"]` | Check that the filename matches an export; support named defaults and module-level memo | A matching type export alongside a wrongly named component passes. |
| `correctness/noNestedComponentDefinitions` | Report rendered components created inside a parent render | Module-level private components pass. No custom duplicate identity rule is needed. |
| `style/useNamingConvention` | Evaluated, not enabled by this change | Identifier patterns do not relate a props declaration to its owning component. |
| `nursery/useReactNamingConvention` | Evaluated, not enabled by this change | It checks context, ref, and ID names, not component-specific props names. |

The probes also passed a named default, private constants/helpers/subcomponents, exported props types, and a module-level memo. They rejected a helper export, an anonymous default, a wrong component name, and a nested component. A local type named `Props` passed, confirming another structural gap.

Official references: [export-only modules](https://biomejs.dev/linter/rules/use-component-export-only-modules/), [filename conventions](https://biomejs.dev/linter/rules/use-filenaming-convention/), [nested components](https://biomejs.dev/linter/rules/no-nested-component-definitions/), and [naming conventions](https://biomejs.dev/linter/rules/use-naming-convention/).

## Goals / Non-Goals

**Goals:** Keep the checker syntax-based, preserve useful local composition, and make every finding traceable to a file and rule. Run one convention policy in report and strict modes.

**Non-Goals:** No automatic refactoring, line-count limits, mandatory props interfaces for trivial components, bans on private subcomponents, second linter, project-wide type analysis, or application redesign. This change does not standardize named versus default exports.

## Decisions

### 1. Classify modules before checking exports

Inventory `.tsx` files beneath `apps/web/src/components/`, `apps/web/src/pages/`, `apps/mobile/src/components/`, and `packages/core/components/`. These are the first change's feature-component roots. Other React-bearing modules, such as email templates, providers, MCP entrypoints, and docs, remain outside this first rollout and are documented as such.

Classify paths before reading source. Exclude `*.stories.tsx`, `*.test.tsx`, `*.spec.tsx`, `*TestFixtures.tsx`, test/fixture directories, generated files, and framework entrypoints. Explicit-path checks also recognize TanStack routes, Expo `app/` routes, `client.tsx`, and `router.tsx` as excluded, even though they sit outside the scanned roots. Reuse existing test/story predicates only where they include the required suffixes; the current test predicate does not cover TSX fixture modules.

Nightshift's existing contract-to-implementation mapping designates contracted primitive modules. A small exact-path record designates additional compound primitives, with a reason per module, such as the dialog family. Review each such module's actual exports. Do not exempt an entire primitives folder or feature modules such as `AccountFields`.

A named feature module that only re-exports another component requires review of its component identity. Unknown higher-order wrappers also require review. Such files remain visible in the inventory and fail strict selection until classified. No filename case alone proves that a callable is a React component.

### 2. Delegate existing rules to Biome

Add `biome.components.json`, extending `biome.json`, with the three adopted rules at error severity and `filenameCases: ["export"]`. Keep constant exports disallowed for ordinary feature modules. Contracted or compound modules are excluded before lint invocation.

The command passes only checked paths to `biome lint`, selects only those three rules with `--only`, and reads JSON diagnostics. This separate configuration keeps legacy convention errors out of the existing whole-repository `biome check .`. Add `bun run check:components` to preflight for the adopted set; do not enable the convention globally in the root config.

In report mode, expected convention diagnostics become report entries and do not fail the command. Parser/configuration errors, an invalid JSON response, a missing executable, and other tool failures do fail. Do not turn every nonzero Biome exit into success. Use the installed repository version during implementation and CI, not a floating `bunx` download.

A global blocking override would force the excluded repository-wide migration. Warning-only root overrides would add noise to every existing lint command. The dedicated config provides focused diagnostics in both modes without either consequence.

### 3. Parse only the relationships Biome cannot enforce

Add `scripts/componentConventions.ts` for the structural analysis and classification policy, with `scripts/check-component-conventions.ts` as the command. Split a helper module only if needed for readability. Reuse the existing `SourceFile` shape and file reader where practical; filter excluded paths before loading their contents.

Use `@babel/parser` with `sourceType: "module"` and the `typescript` and `jsx` plugins. Declare it directly in root `devDependencies`; do not depend on a transitive installation. The isolated 8.1.0 probe parsed a generic TSX component and its props alias with source locations successfully.

Implementation pins 8.0.0: Bun's configured minimum release age rejected the 8.1.0 dependency graph. The installed 8.0.0 parser passes the generic TSX and location fixtures without relaxing that policy. TypeScript remains at the repository's 7.0.2 version.

The existing TypeScript dependency cannot provide the assumed `createSourceFile` API: TypeScript 7.0.2 has no JavaScript compiler entrypoint. Microsoft's [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) confirms the API gap. A second legacy TypeScript compiler would be heavier than the required syntax parser. Babel's [parser documentation](https://babeljs.io/docs/babel-parser) describes the TSX plugins and node locations used here.

Build a module-local declaration/export table from syntax nodes. Resolve local export lists, aliases, default identifiers, function declarations, arrow/function bindings, generic functions, and imported React `memo`/`forwardRef` wrappers, including aliased imports and `React.memo`. Unwrap parentheses, assertions, and `satisfies` expressions without executing source. Recognize JSX, fragments, null-returning components, and React element creation conservatively; unresolved cases require review.

The custom diagnostics cover only:

1. Missing or multiple primary exported component bindings.
2. The primary component's public name failing to match the filename, including the matching-type-export loophole.
3. A locally declared component-owned props type with the wrong name.
4. An unsupported classification requiring review.

Count component bindings, not every PascalCase declaration or every export token. Type-only exports never satisfy a primary component. A component exported both by its matching name and as default is one identity. A differently named public alias is a naming finding. Do not duplicate a filename finding already emitted by Biome at the same location; add the structural name diagnostic where the built-in rule missed the relationship.

For props, inspect only types consumed by the primary or private component's parameter, component type annotation, or recognized wrapper's props argument. A local dedicated props alias uses that component's name plus `Props`. Imported types and direct intersections, `Pick`, `Omit`, `ComponentProps`, or other compositions remain valid. A named local composition dedicated to `FeatureCard` still uses `FeatureCardProps`. Supporting model types referenced within props are not renamed. Existing public `Elements`, shared props, and supporting type exports remain available to consumers.

Small inline props remain permitted. Extract a named type when it improves readability, as with `IconButton`; do not invent a numeric field-count rule. Private helpers, constants, and subcomponents stay in the module. Keep adapter components, memo calls, and shared element maps at module scope.

Regex export counting was rejected because comments, generics, aliases, and wrappers would produce incorrect results. A Biome plugin remains custom code; a module-level export table and props ownership analysis fit the existing Bun fixture style more directly than several syntax-pattern plugins.

### 4. Share report and strict behavior

Root scripts:

| Command | Selection and outcome |
| --- | --- |
| `bun run report:components` | Scan all candidate roots, print sorted findings and totals, exit zero for convention findings. |
| `bun run report:components -- --json` | Emit the same report as deterministic JSON. |
| `bun run check:components` | Check the explicit adopted set and fail on any finding or unresolved classification. |
| `bun run check:components -- <paths...>` | Check explicit paths, applying the same classifications and rules. Reject missing paths and unsupported options. |

Both scripts invoke the same command module with explicit `--report` or `--check` modes. Store the small adopted set with the scope policy. Validate duplicate and missing paths, and validate reasons on explicit primitive exceptions. The JSON contains relative path, classification/reason, primary name when known, rule identifier, one-based line/column, and message. Summary counts include checked, excluded, requiring-review, and unique violating files; total diagnostics are a separate count. Stable sorting uses path, location, and rule identifier. Omit timestamps and absolute paths.

Do not create a repository-wide suppression baseline. Save before/after reports with implementation evidence and summarize remaining violations by category. The existing `apps/mobile/parity.md` is a different inventory and is not reused for convention exceptions.

### 5. Migrate three representative component cases

| Case | Exact change | Preservation evidence |
| --- | --- | --- |
| Web `common/IconButton.tsx` | Name the existing inline shape `IconButtonProps`; retain its private class constant | Existing stories and interaction/accessibility checks retain tooltip naming, disabled state, class overrides, and click behavior. |
| Web `common/LinkPreviewCard.tsx` | Add `LinkPreviewCardProps`; move `LinkPreviewLoading` unchanged into `LinkPreviewLoading.tsx`; remove the helper re-export | Preserve all card branches and `toLinkPreviewHost`. Update `ChatTurnBlock`, `ChatRoomMessageBubble`, `TopicResourceInfo`, and stories. Import `hasPreviewableLink` directly from core in `ChatTurnBlock`. |
| Core/web/mobile `ThinkingLine.tsx` | Name core props `ThinkingLineProps`; let adapters consume an imported/composed subset for `className` | Preserve `ThinkingLineTextProps`, the core `useState` initializer, module-level `ThinkingText` and `ShimmerText`, and same-name core imports. Existing rerender test remains green. |

The strict adopted set contains these five existing files plus the new `LinkPreviewLoading.tsx`: six files total. Keep `RatingThumbs` as an unchanged positive fixture/reference. Do not migrate `AccountFields`, `TablePagination`, or additional legacy modules merely to clear the report.

Preserve existing `LinkPreviewCard` story IDs, including Loading, while adding a dedicated story beside the extracted shared loading component. Consult the Storybook catalog before authoring it. Moving the loading component does not introduce a render-time wrapper. Update all import sites and structure documentation in the same implementation change.

### 6. Test rule boundaries and migration behavior

Use source-text fixtures in `scripts/componentConventions.test.ts`, following the existing parity tests. Add CLI/Biome integration coverage in `scripts/componentConventionsCli.test.ts`, using temporary fixture files and the repository binary.

| Passing fixtures | Failing or review fixtures |
| --- | --- |
| Named/default/local export-list component; generic arrow; memo and forwardRef including aliases | Zero/multiple components, wrong public name, anonymous default, unsupported wrapper or external re-export |
| Correct local props; imported shared props; direct composition; no props; small inline props | Dedicated local `Props` or wrong component's props name, including wrapped/generic signatures |
| Private module-level subcomponent, helper, constant, model union, and exported adapter type | Exported helper/hook/constant; matching type hiding wrong component; render-time nested component |
| Event/render callbacks and supplied adapter components | Actual component construction during render |
| Route, entrypoint, story, test, TSX fixture, generated file, contracted primitive, designated compound family | Undesignated primitive cannot bypass checks; duplicate/stale/malformed exception records |
| Repeated inventories and report-mode findings | Strict findings, strict requiring-review results, parse errors, delegated-tool failures, empty or missing strict selection |

Assertions cover rule IDs and locations, not complete wording snapshots. Add a fixture with comments and strings containing `export function` to prove syntax-based analysis. For each combined rule, assert its diagnostic is produced by Biome or the structural checker once.

## Risks / Trade-offs

- **Syntax cannot prove every React component:** unsupported wrappers and external re-exports require review; strict mode cannot silently pass them.
- **A new parser dependency adds maintenance:** use one direct development dependency, a locked version, and TSX fixtures. Do not add traversal or lint frameworks.
- **Two linter configurations can drift:** extend the root config, restrict the selected rule IDs, and test the dedicated config through the real CLI.
- **Exemptions can hide feature modules:** use contract mappings or exact compound paths with reasons and stale-entry checks. Preserve existing parity gates.
- **Export splits can alter rendering or state:** keep function bodies, JSX, keys, classes, and module-level adapter identities unchanged; require behavior and visual evidence.

## Migration Plan

1. Add the checker, parser dependency, focused Biome config, fixture tests, and report command. Capture the initial inventory before component edits.
2. Migrate only the six-file adopted set and direct import consumers. Add stories and update root/workspace guidance, the JSX convention skill, and README Development commands.
3. Enable the strict adopted-set command in preflight. Register its entrypoint with Knip only if the root scripts do not make it reachable; no broad ignore.
4. Record the final inventory and verify every adopted file passes. Keep all remaining files report-only.
5. Run the validation commands below and inspect before/after rendered states. If a contract or visual regression appears, fix it within this migration before completion.

Rollback removes the added preflight step and focused configuration, then reverts the representative export moves and direct imports together. No data migration or deployment change is involved.

## Acceptance and Validation

The implementation is complete when all fixtures pass, all six adopted files pass strict mode, and the report remains non-blocking for legacy findings. Existing package, contract, parity, and full preflight checks must remain green. Before/after reports must have reconciled counts and no unexplained dropped files.

Commands below are for implementation; the new scripts and test files do not exist at proposal time:

```bash
bunx biome --version
bun test scripts/componentConventions.test.ts scripts/componentConventionsCli.test.ts
bun run report:components
bun run report:components -- --json
bun run check:components
bun test apps/web/src/components/common/ThinkingLine.test.tsx
bun scripts/check-component-parity.ts
bun run check
bun run visual:select -- --base f301c5cc
bun run visual:web
bun run visual:report
```

Use the existing visual capture workflow and its pinned container for the affected web stories. Capture matching baseline states before edits; do not approve changed baselines to hide differences. Inspect IconButton states, link/loading/YouTube states, and ThinkingLine in light/dark and narrow/wide layouts. Re-run the phrase-stability interaction test. Compare the mobile ThinkingLine story before and after on a development build using the same state and theme. Record visual evidence or the exact environmental blocker; missing evidence does not count as passed validation.

Planning validation is `openspec validate clean-component-conventions --strict`. No application implementation or application-test completion is claimed by these planning artifacts.
