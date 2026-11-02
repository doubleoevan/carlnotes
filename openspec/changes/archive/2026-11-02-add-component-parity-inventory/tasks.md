## 1. Shared inventory parser

- [x] 1.1 Move `parseParityInventory` and `PARITY_INVENTORY_PATH` out of `scripts/clientParity.ts` into
  `scripts/parityInventory.ts` as `parseInventoryTable({ markdown, heading })`, returning each row's backticked name,
  middle column, and reason. Point `scripts/check-client-parity.ts` and `scripts/clientParity.test.ts` at it with the
  `## Web-only client capabilities` heading. Verify: `bun test scripts/clientParity.test.ts` and
  `bun scripts/check-client-parity.ts` pass with the same output as before
- [x] 1.2 Add `scripts/parityInventory.test.ts`: a missing heading returns no rows, a table stops at the next `## `
  heading, and an empty reason reads as `""`. Verify: `bun test scripts/parityInventory.test.ts` passes

## 2. Inventory rule

- [x] 2.1 Add `scripts/componentInventory.ts` with `checkComponentInventory({ sourceFiles, contractNames,
  inventoryEntries })` returning `{ violations, counts }`. Pair files are each app's shipped `.tsx` files under
  `src/components/` outside `primitives/`, keyed by base name. A pair is backed when every file of the name in each
  app has a static import that `toImportResolution` resolves to `packages/core/components/<Name>.tsx` and that names
  a value or an `…Elements` type. Primitive pairs are both apps' `primitives/<name>.tsx` with no contract name. Each
  violation names the component, both files, the backing module or contract it expected, and `apps/mobile/parity.md`.
  Verify: `bunx tsc -b` passes
- [x] 2.2 Add the row rules to the same module: an empty reason, a kind other than `platform API`,
  `platform difference`, or `not yet shared`, a duplicate name, a row for a backed pair, a row for a primitive that
  has a contract, and a row for a name that is not a component file in both apps. Verify: `bunx tsc -b` passes
- [x] 2.3 Add `scripts/componentInventory.test.ts` with fixtures for each rule in the spec's fixtures scenario: the
  unlisted unbacked pair, the one-side-backed pair, the unlisted uncontracted primitive, each failing row, and a
  passing fixture with a value-backed pair, an adapter-backed pair (an `…Elements` type import alone), and a listed
  pair. Include a pair that shares only a differently named core component, which stays unbacked. Verify:
  `bun test scripts/componentInventory.test.ts` passes

## 3. Wire it into the component parity check

- [x] 3.1 In `scripts/check-component-parity.ts`, read `readAppSourceFiles()`, pass only the apps' files to
  `checkComponentParity`, read the contract names it already reads, parse `## Separately built components` from
  `apps/mobile/parity.md`, and run `checkComponentInventory`. Print both rules' violations and exit 1 if either has
  any. On success print the contract line and the counts line from design.md. Update the script's header comment and
  `scripts/preflight.sh`'s comment above the step. Verify: the script fails on the current tree, naming the unlisted
  pairs and `select`, before 4.1 lands

## 4. Seed the inventory

- [x] 4.1 Add `## Separately built components` to `apps/mobile/parity.md` after the web-only capabilities table, with
  a short lead saying what a row is, the three kinds, and that `check-component-parity.ts` reads it. Update the file's
  opening paragraph, which says the contracts have their own check, to name this table. Verify: the section parses
  with `parseInventoryTable` in a one-line `bun -e` probe
- [x] 4.2 Read each pair the check names, both files side by side, and add its row with a kind and a reason taken from
  the code: the platform module or convention for `platform API` and `platform difference`, and what each side builds
  for `not yet shared`. Name the core components a pair already shares in its reason, such as `UserMenu` over
  `UserMenuItems`. Add `select` with its reason. Keep a list of the rows whose kind the code does not settle for the
  ship report. Rename the web `search/SearchResults.tsx`, which holds the typeahead's options, to
  `SearchResultOptions.tsx`. Verify: `bun scripts/check-component-parity.ts` passes and prints 142 names, 47 shared, the
  listed counts by kind, and 1 primitive listed
- [x] 4.3 Wrap every prose line of `parity.md` at 120 columns, keeping table rows whole. Verify:
  `bunx biome check .` and `bun scripts/check-client-parity.ts` pass

## 5. Docs

- [x] 5.1 Update `AGENTS.md`: the Verification section's component parity check also fails a same-name pair that does
  not share its same-name core component and a primitive both apps keep without a contract, unless
  `apps/mobile/parity.md` lists it, and the mobile parity rules say a component both apps define renders its same-name
  core component or implements its `…Elements` adapter, or is listed with its kind and reason. Verify: a reread names
  the rule, the inventory, and the three kinds
- [x] 5.2 Update `apps/mobile/AGENTS.md`'s paragraph that points at `parity.md` to name the separately built
  components table and its check, the README's Checks line for `check-component-parity.ts`, and `CLAUDE.md`'s
  verification gate, which names the command only and gains what it covers (the contracts and the separately built
  inventory). Update `apps/docs/ai-scaffolding.md`'s push gate paragraph and step 4 of `.agents/commands/ship.md`.
  Verify: `grep -rn "component parity" AGENTS.md CLAUDE.md README.md apps/mobile/AGENTS.md
  apps/docs/ai-scaffolding.md .agents/commands/ship.md` shows each updated line, and `bun run build:docs` passes

## 6. End-to-end verification

- [x] 6.1 Add `ParityProbe.tsx` under `src/components/common/` in both apps, each exporting a component that imports
  nothing from `packages/core`. Run `bash scripts/preflight.sh` and confirm it fails at the component parity step
  naming `ParityProbe`, both files, and `apps/mobile/parity.md`. Save the output to `logs/parity-probe-fail.txt`
- [x] 6.2 Add a `ParityProbe` row with the kind `not yet shared` and a reason, rerun
  `bun scripts/check-component-parity.ts`, and confirm it passes with one more listed pair. Save the output to
  `logs/parity-probe-pass.txt`
- [x] 6.3 Delete both probe files and confirm the check fails on the now stale `ParityProbe` row, then remove the row
  and confirm `bash scripts/preflight.sh` is green. Verify: `git status --short` shows no probe file and no probe row
- [x] 6.4 Run `bunx knip` and confirm the new modules and the moved parser leave no unused file or export

## Workflow follow-up

- List in `logs/ship-report.md` every row whose kind the code did not settle, with both file paths, for the user to
  decide.
- Ship with `/ship`, which archives the change with `openspec archive add-component-parity-inventory --yes`.
