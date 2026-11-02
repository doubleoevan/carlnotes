# Proposal

## Why

CarlNotes mixes single-component modules with files that export several components, hooks, or utilities. A focused convention will make feature components predictable without splitting their private implementation details or weakening shared UI contracts.

## What Changes

- Define one primary exported React component per ordinary feature-component file, with its name matching the filename.
- Name a locally declared, component-specific props type `ComponentNameProps` when a named type is needed. Allow imported and composed shared props, small inline annotations, private supporting types, constants, helpers, and module-level private subcomponents.
- Exclude framework routes, entrypoints, stories, tests, fixtures, generated files, and explicitly designated compound UI primitives. Preserve Nightshift's contracted primitive APIs and filenames.
- Reuse Biome for suitable export, filename, and stable-identity rules. Add a TypeScript structural check only for relationships those rules cannot express.
- Add passing and failing fixtures, deterministic report-only repository inventory, and strict checks for a small set of migrated examples.
- Migrate the web `IconButton` and `LinkPreviewCard` modules and the core/web/mobile `ThinkingLine` family. Preserve rendering, interactions, shared component reuse, and module-level identities.

Repository-wide migration and repository-wide blocking enforcement are outside this change. Existing parity and contract gates remain authoritative.

## Capabilities

### New Capabilities

- `component-conventions`: Classify feature-component modules, report violations of their export and props conventions, and verify scoped adoption without blocking legacy modules.

### Modified Capabilities

None. `component-contracts` and `component-parity` retain their existing requirements. This capability adds complementary tooling behavior.

## Impact

Implementation will add a focused Biome configuration and touch scripts and fixture tests under `scripts/`, root script documentation, contributor conventions, and the named representative components with their direct consumers and stories. Bun remains the test runner. The checker adds `@babel/parser` as one root development dependency for TSX structure; the declared TypeScript 7 compiler has no stable JavaScript parser API. No additional linter is planned.

Nightshift contracts, primitive variants and classes, routes, public APIs, and application behavior remain unchanged. The inventory exposes remaining violations for a separately scoped migration. The implementer owns the checker, representative migration, and validation evidence; the repository maintainer reviews the convention and exclusions.
