# component-parity Specification

## Purpose
TBD - created by archiving change add-component-parity-inventory. Update Purpose after archive.

## Requirements

### Requirement: A component both apps define shares its core component or is listed with a reason

The component parity check SHALL fail when both apps define a `.tsx` file of the same name, not a story or a test,
under `src/components/` outside `primitives/`, the pair is not backed, and the `## Separately built components` table
in `apps/mobile/parity.md` does not list the name. Each violation SHALL name the component, both files, the core
module that would back it, and the inventory.

#### Scenario: A new pair that shares nothing fails preflight

- **WHEN** both apps add `src/components/common/ParityProbe.tsx`, neither imports any core module, and the inventory
  does not list `ParityProbe`
- **THEN** the component parity check fails naming `ParityProbe`, both files,
  `packages/core/components/ParityProbe.tsx`, and `apps/mobile/parity.md`

#### Scenario: A listed pair passes

- **WHEN** the inventory lists `ParityProbe` with a kind and a reason
- **THEN** the check passes for that pair

### Requirement: A pair is backed only by its same-name core component

A pair `<Name>` SHALL be backed when every file of that name in each app imports from
`packages/core/components/<Name>.tsx` either a value or a type whose name ends in `Elements`. Another type alone, a
core component with a different name, and a core component reached only through other files SHALL NOT back the pair.

#### Scenario: A pair that renders its same-name core component needs no row

- **WHEN** each app's `NoteViewer.tsx` imports the `NoteViewer` component from `@carlnotes/core/components/NoteViewer`
- **THEN** the pair is backed and needs no inventory row

#### Scenario: A pair that implements its same-name core component's adapter needs no row

- **WHEN** the web's `DataTable.tsx` imports only the `DataTableElements` type from
  `@carlnotes/core/components/DataTable`, and the mobile app's `DataTable.tsx` imports the `DataTable` component from it
- **THEN** the pair is backed and needs no inventory row

#### Scenario: Sharing a smaller core component does not back a pair

- **WHEN** each app's `ChatPanelWidget.tsx` imports `ChatPill` from `@carlnotes/core/components/ChatPill` and nothing
  from a core `ChatPanelWidget` module
- **THEN** the pair is not backed and needs an inventory row

#### Scenario: One side backed is not enough

- **WHEN** the web's file imports its same-name core component and the mobile app's file of the same name does not
- **THEN** the pair is not backed and needs an inventory row

### Requirement: A primitive both apps keep has a contract or is listed with a reason

The check SHALL fail when both apps hold a component file of the same name in their `src/components/primitives/`
folders, no Nightshift contract `packages/nightshift/components/<name>.ts` exists for it, and the inventory does not
list the name. A primitive with a contract SHALL be checked by the contract rules alone.

#### Scenario: A primitive without a contract fails

- **WHEN** both apps keep `primitives/select.tsx`, no `packages/nightshift/components/select.ts` exists, and the
  inventory does not list `select`
- **THEN** the check fails naming `select`, both files, and the contract or row it expected

#### Scenario: A contracted primitive needs no row

- **WHEN** both apps keep `primitives/button.tsx` and `packages/nightshift/components/button.ts` exists
- **THEN** the inventory rule needs no row for `button`

### Requirement: Each inventory row has a kind and a reason

Each row SHALL name one component in backticks, a kind, and a reason. The kind SHALL be `platform API` for a pair
that reaches a capability through each platform's own api, `platform difference` for a pair whose structure follows a
platform convention, or `not yet shared` for a pair that could render one core component and does not yet. The check
SHALL fail on an empty reason, any other kind, and a name listed twice.

#### Scenario: A row with no reason fails

- **WHEN** a row lists `ParityProbe` with the kind `not yet shared` and an empty reason
- **THEN** the check fails naming the row

#### Scenario: A row with an unknown kind fails

- **WHEN** a row lists `ParityProbe` with the kind `later`
- **THEN** the check fails naming the row and the three kinds

### Requirement: A stale inventory row fails the check

The check SHALL fail when a row lists a pair that is now backed, a primitive that now has a Nightshift contract, or a
name that is no longer a component file in both apps, so a change that shares, renames, or deletes a component retires
its row in the same change.

#### Scenario: A listed pair becomes shared

- **WHEN** both apps' `ParityProbe.tsx` start rendering `@carlnotes/core/components/ParityProbe` and the row remains
- **THEN** the check fails until the row is removed

#### Scenario: A listed component is deleted from one app

- **WHEN** the mobile app's `ParityProbe.tsx` is deleted and the row remains
- **THEN** the check fails naming the row and the app that no longer defines it

#### Scenario: A listed primitive gains a contract

- **WHEN** `packages/nightshift/components/select.ts` is added and the `select` row remains
- **THEN** the check fails until the row is removed

### Requirement: The check reports what it counted

On success the component parity check SHALL print the number of component names both apps define outside the
primitives, how many of them share their core component, how many the inventory lists by each kind, and how many
primitives without a contract the inventory lists. The rules SHALL have a test with a fixture for each violation and a
fixture that passes, and preflight's run SHALL prove the repo's own tree.

#### Scenario: A clean run prints the counts

- **WHEN** `bun scripts/check-component-parity.ts` passes
- **THEN** it prints the contract line and a line with the shared, listed-by-kind, and primitive counts

#### Scenario: The fixtures cover each rule

- **WHEN** `bun test scripts/componentInventory.test.ts` runs
- **THEN** an unlisted unbacked pair, a pair backed on one side only, an unlisted primitive without a contract, a row
  with no reason, a row with an unknown kind, a duplicate row, a row for a backed pair, a row for a contracted
  primitive, and a row for a name one app lacks each fail, and a fixture with a value-backed pair, an adapter-backed
  pair, and a listed pair passes
