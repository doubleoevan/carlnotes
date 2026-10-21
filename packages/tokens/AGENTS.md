# packages/tokens/

`@carlnotes/tokens`, the design tokens as CSS alone: `tokens.css`, the `@theme inline` block and the `:root` and dark
variables that `apps/web/src/globals.css` imports as `@import "@carlnotes/tokens/tokens.css"`. The package exports that
one file and nothing else, with no TypeScript and no dependencies.

- `apps/web` is the one importer.
- Universal: the root rule, as a stylesheet with no script.
- Tests: none. `bun run build:ui` resolves the import and is the check.
