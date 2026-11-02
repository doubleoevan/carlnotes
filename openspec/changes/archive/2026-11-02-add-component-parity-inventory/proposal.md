# Proposal

## Why

Nothing stops the web and the mobile app from each building their own copy of a component. A trace on 2026-11-02 found
143 component names that both apps define under `apps/*/src/components/`. Only 47 of them render or adapt the
`packages/core/components/` module of the same name, and the other 96 are built separately in each app. Select is a
primitive in both apps with no Nightshift contract. `check-component-parity.ts` covers only the two contracts, Button
and Badge, so a 97th separate pair passes preflight today.

## What Changes

- The component parity check gains an inventory rule. It fails when both apps define a component with the same name,
  neither file is a primitive, and the pair is not backed by its same-name core component, unless the inventory lists
  the name with a kind and a reason. Backed means every file of that name in each app imports from
  `packages/core/components/<Name>.tsx`, either a value it renders or the `…Elements` adapter type it implements.
- It also fails when a primitive sits in both apps' `src/components/primitives/` without a Nightshift contract,
  unless the inventory lists it.
- A stale row fails: a listed pair that is now backed, a listed primitive that now has a contract, a name that no
  longer exists in both apps, a row with no reason, a row whose kind is not one of the known kinds, and a name listed
  twice.
- `apps/mobile/parity.md` gains a `## Separately built components` section. It is seeded with every pair that is
  built separately today and with `select`, each with its kind (`platform API`, `platform difference`, or
  `not yet shared`) and a reason read from the code. No component is extracted or merged in this change.
- The client parity check and the new rule share one table parser for `parity.md`.
- Preflight runs the rule inside `bun scripts/check-component-parity.ts` and prints the counts: names both apps
  define, how many share their core component, how many are listed by kind, and the primitives listed.
- The docs that describe the gate say what the check now covers: `AGENTS.md`, `apps/mobile/AGENTS.md`, the README's
  Checks section, `CLAUDE.md`, `apps/docs/ai-scaffolding.md`, and step 4 of `.agents/commands/ship.md`.

## Capabilities

### New Capabilities

- `component-parity`: a component both apps define under one name is one shared implementation or a reviewed
  inventory row with its kind and reason, checked in preflight.

### Modified Capabilities

None. The `component-contracts` requirements for Button and Badge are unchanged.

## Impact

- `scripts/componentParity.ts` and `scripts/check-component-parity.ts`, a new rule module with its test, and the
  inventory parser moved out of `scripts/clientParity.ts` so both checks read `parity.md` the same way.
- `apps/mobile/parity.md` grows by about 100 rows.
- Preflight takes one more walk of the two apps' component files. No runtime code, api, or dependency changes.
- A change that adds a same-name component to both apps, or a primitive to both, now fails preflight until it shares
  the core component or lists the pair.
