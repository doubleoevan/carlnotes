## Why

CarlNotes has two palettes. `packages/emails` hardcodes 16 hex colors as literal styles, and only the primary orange
`#f09050` is among the 42 hex colors in `packages/tokens/tokens.css`. The other 15, the email font sizes, and the copies
of them in the api's own HTML pages and share images drift from the web app's tokens with every change. Email clients do
not reliably read CSS custom properties, so the emails need the values as data, not as a stylesheet. The web app also
has no catalog of its components: the same menu, card, and scroll box are rebuilt from class strings file by file, and
the coming Expo app needs one vocabulary to render its own way. Nightshift is that vocabulary. This change is its first
stage.

## What Changes

- **BREAKING (internal)**: `packages/tokens` becomes `packages/nightshift` and `@carlnotes/tokens` becomes
  `@carlnotes/nightshift`, still a private universal package. Every reference moves with it.
- Every design token moves into TypeScript in the package: the Latte palette, the Dark roast palette, the radius scale,
  the font families, and the semantic names the `@theme inline` block maps. `tokens.css` is written from that source by
  a script and committed, and a test fails preflight if the committed file differs from what the source writes. The web
  app's computed custom properties stay identical in light and dark through the move.
- Once the move is proven, every text color reaches the 4.5:1 ratio WCAG AA asks of body text on every surface it sits
  on. Seven color tokens move by a small step, muted text, links, and the destructive red among them, and a test checks
  every text token against its surfaces. A link inside a sentence gains a faint underline at rest. The components the
  accessibility checks fail are fixed, and the emails' links take the web app's link token.
- The source names the type roles the web app renders, each with its size, line height, weight, and the Tailwind
  classes it maps to today, and a named system font stack for email.
- `packages/emails` declares `@carlnotes/nightshift`, and every hex literal and pixel font size in its templates becomes
  a named token or type role. The api's unsubscribe page, its blog pages, the share image, and the podcast cover read
  the same values, and a test checks the theme-color meta and the web manifest against them. Each email color and size
  is mapped in the design, with its before and after value, and every email is rendered before and after.
- The same source writes the colors, the radius scale, and the type roles as Design Tokens Community Group format 1.0
  JSON, one file per mode, for Figma variables. The files are committed and tested like `tokens.css`.
- The design inventories every common component pattern in `apps/web`: where it is used, how many ways it is built, and
  the Nightshift name it would take.
- Storybook 10 joins `apps/web` as a dev dependency, on the TanStack React framework. The Tokens, Typography, and
  Inventory pages, a story for every primitive and every shared component in `common`, `table`, and `layout`, and a
  story for each pattern that exists only as class strings. Every story has a light and dark toggle, loads
  `globals.css`, and passes the accessibility addon or is listed in the design. Storybook's MCP server is registered for
  Claude Code and OpenCode. Root scripts `dev:storybook` and `build:storybook`.
- The api serves the built Storybook at `/nightshift` the way it serves `/docs`: hashed files immutable, every other
  file revalidated, its own content security policy that lets Storybook frame its own preview, `noindex`, and left out
  of the sitemap and the llms files. The footer links it in a new tab, and the License, Privacy, and Terms links move to
  their own row.
- No new shared component, no call site moved onto an existing one, no variant recipes, and no published library. Those
  are the stages after this one.

## Capabilities

### New Capabilities
- `design-system`: Nightshift's one TypeScript source of the tokens and type roles, the files it writes for the web app
  and for Figma, the emails reading it, the component browser with its stories and accessibility checks, the MCP server
  registration, and the footer link.

### Modified Capabilities
- `workspace-structure`: the universal package is `@carlnotes/nightshift`, the Biome universal rule covers its
  TypeScript, and the image includes the built Storybook.
- `static-serving`: the api claims `/nightshift` ahead of the ui's handler and serves the built Storybook there with its
  own cache headers, frame policy, and `noindex`.
- `seo`: `/nightshift` keeps its trailing slash like `/docs`, since the component browser's files name each other by
  relative urls.

## Impact

- Code: `packages/nightshift/` (renamed, with the TypeScript source, `tokens.css`, and the Figma JSON),
  `packages/emails/*.tsx`, `apps/api/unsubscribe.ts`, `apps/api/content.ts`, `apps/api/share/previewImage.ts`,
  `apps/api/share/podcastCover.ts`, `apps/api/nightshift.ts`, `apps/api/index.ts`, `apps/api/bundlePaths.ts`,
  `apps/web/src/routes/__root.tsx`, `apps/web/src/hooks/useTheme.ts`, `apps/web/src/components/layout/Footer.tsx`,
  `apps/web/.storybook/`, the stories, `scripts/packageBoundaries.ts`, a token writer under `scripts/`, `biome.json`,
  the root `tsconfig.json`; for the contrast fix, `apps/web/src/globals.css`,
  `apps/web/src/hooks/useScrollRegionTabStop.ts`, `apps/web/src/lib/styleClasses.ts`, the button, popover, and toast
  primitives, and the components whose text or links the design lists.
- Dependencies: Storybook 10 and its addons as `apps/web` dev dependencies, so the production install leaves them out.
- Build: the Dockerfile's build stage runs `build:storybook`, and its runtime stage copies the output.
- Docs: the root and per-workspace `AGENTS.md`, `README.md`, `.agents/commands/audit-structure.md`; `.mcp.json` and
  `opencode.json` register the Storybook MCP server.
- Emails change color where the design maps a value to a nearby token; the design lists each one.
- The web app's muted text, links, destructive red, new count, light hovered-row text, light subtable fill, and dark
  hovered row change color by a small step, and links inside sentences gain a faint underline. The design lists each
  value with its contrast.
