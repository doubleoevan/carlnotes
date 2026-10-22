## 1. The captures before anything changes

- [x] 1.1 Build the web app with `bun run build:ui`, run its api on a side port, and save every custom property on the
      document element, in light and with the `dark` class, as JSON in the scratchpad
- [x] 1.2 Record the built client's size: the total bytes under `apps/web/dist/client` and the bytes of its CSS file
- [x] 1.3 Render every email's preview props to HTML and to a 600-pixel-wide PNG under the change's `renders/before/`,
      and the unsubscribe page, a blog post page, a share image, and a podcast cover beside them

## 2. The rename

- [x] 2.1 `git mv packages/tokens packages/nightshift`; rename the package to `@carlnotes/nightshift`; update
      `apps/web/package.json`, the `globals.css` import, both Dockerfile `COPY` lines, `scripts/packageBoundaries.ts`
      and its test; `bun install` to rewrite the lockfile
- [x] 2.2 Search the tree outside `openspec/changes/archive` for `tokens` used as the package's name or folder, and
      update every hit, including the root and per-workspace `AGENTS.md`, `README.md`, and
      `.agents/commands/audit-structure.md`

## 3. The TypeScript source

- [x] 3.1 Write the source modules in `packages/nightshift` as the design's section 2 lays out, with each comment from
      `tokens.css` moved to its token's description; a `tsconfig.json`, and the `exports` for the modules and
      `tokens.css`
- [x] 3.2 Add `packages/nightshift` to the Biome universal rule, to the root `tsconfig.json` references, and to
      `apps/web`'s references; update the boundary check's test fixture now that the package has a tsconfig
- [x] 3.3 Write the CSS and Figma renderers in the package and `scripts/write-nightshift-tokens.ts` with the root
      `nightshift:write` script; run it, and keep the rewritten `tokens.css` to formatting differences alone
- [x] 3.4 `packages/nightshift/tokens.test.ts`: the committed `tokens.css` and both Figma files equal what the source
      writes, and each type role's size and line height equal the Tailwind size its classes name in
      `tailwindcss/theme.css`
- [x] 3.5 Rebuild the web app and compare the custom properties and the client size with 1.1 and 1.2; both match

## 4. The emails and the other copies

- [x] 4.1 Add `@carlnotes/nightshift` to `packages/emails` and `apps/api`, with their tsconfig references
- [x] 4.2 Replace every hex literal and pixel font size in `packages/emails/*.tsx` with the token or role the design's
      section 5 maps it to
- [x] 4.3 Point `apps/api/unsubscribe.ts`, `apps/api/content.ts`, `apps/api/share/previewImage.ts`,
      `apps/api/share/podcastCover.ts`, `apps/web/src/routes/__root.tsx`, and `apps/web/src/hooks/useTheme.ts` at the
      source, with the same mapping
- [x] 4.4 A test in `packages/emails` that fails on a hex literal or a pixel font size in a template, and a test that
      `site.webmanifest`'s colors equal the dark `hero` token
- [x] 4.5 Render 1.3's set again under `renders/after/`, compare each pair, and record the differences in the design's
      section 5; the email render tests pass

## 5. The component browser

- [x] 5.1 Add `storybook`, `@storybook/tanstack-react`, `@storybook/addon-docs`, `@storybook/addon-a11y`,
      `@storybook/addon-themes`, and `@storybook/addon-mcp` at 10.6.2 as `apps/web` dev dependencies, and the
      `dev:storybook` and `build:storybook` scripts in `apps/web` and at the root, by hand instead of through the init
      command
- [x] 5.2 `apps/web/.storybook/main.ts` and `preview.tsx` as the design's section 8 describes: the framework, the story
      globs, the addons, the components manifest, telemetry off, `globals.css`, the theme toggle, the accessibility
      level, the fetch guard, and the module mocks with their fixtures
- [x] 5.3 The Tokens and Typography pages, read from the source, and the Inventory page from the design's section 7
- [x] 5.4 A story with controls for every primitive in `components/primitives`
- [x] 5.5 A story with controls for every component in `components/common`, `components/table`, and
      `components/layout`, with decorators and fixtures for the ones that need a session or data
- [x] 5.6 A story for each class-only pattern the inventory names, composed from `styleClasses.ts` as the app uses it
- [x] 5.7 A test that fails if a component in the four folders has no story
- [x] 5.8 Build with `bun run build:storybook`, run the accessibility checks over every story in light and dark, fix
      each finding in its component, and list in the design's section 8 any whose fix would change behavior
- [x] 5.9 Register the MCP server in `.mcp.json` and `opencode.json`, and check that a Claude Code session lists the
      components while `bun run dev:storybook` runs

## 6. Publishing

- [x] 6.1 `NIGHTSHIFT_BUNDLE_ROOT` in `apps/api/bundlePaths.ts`, and the `/nightshift` routes in
      `apps/api/nightshift.ts`, mounted from `apps/api/index.ts`, as the design's section 9 describes, with tests in
      `apps/api/nightshift.test.ts` for the redirect, both cache headers, the policy, `noindex`, the 404, and a missing
      build
- [x] 6.2 The Dockerfile's build stage runs `bun run build:storybook` after `build:docs`
- [x] 6.3 Proxy `/nightshift` to the api in `apps/web/vite.config.ts`, beside `/docs`
- [x] 6.4 The footer's two link rows, with the Nightshift Design System link written inline as an `AnchorLink` that
      opens `/nightshift/` in a new tab; check both rows at 375 pixels wide in light and dark
- [x] 6.5 If `serve-pages-from-a-web-service` is still open, add `/nightshift` beside `/docs` in its design and its
      static-serving delta

## 7. The docs move with the code

- [x] 7.1 The root `AGENTS.md` module map and routing table, `packages/nightshift/AGENTS.md`, `apps/web/AGENTS.md`,
      `packages/emails/AGENTS.md`, and `apps/api/AGENTS.md`
- [x] 7.2 The README's Development section: `dev:storybook`, `build:storybook`, and `nightshift:write`

## 8. Verify

- [x] 8.1 `bun run check` is green, and the boundary check still proves `@carlnotes/nightshift` universal
- [x] 8.2 The custom properties match 1.1 in light and dark; the client size matches 1.2 after section 3, and the
      design records the size after sections 4 and 6
- [x] 8.3 `bun run build:storybook` succeeds with every accessibility finding fixed or listed
- [x] 8.4 `docker build --platform=linux/amd64` with the three `VITE_*` arguments; run the image on the dev Doppler
      config and check that `/nightshift` redirects, `/nightshift/` renders a story in its preview, a hashed asset
      after it is immutable, `sb-manager/runtime.js` revalidates, the policy and `noindex` are sent, and the runtime's
      `node_modules` has no `storybook`
- [x] 8.5 The design's section 5 records the email renders before and after
- [ ] 8.6 Manual: import both Figma files into a scratch Figma file as one collection with two modes, and record in the
      design's section 6 any token type Figma rejects

## 9. The contrast fix

- [x] 9.1 Move the seven color tokens in `packages/nightshift/colors.ts` as the design's section 8 lists them, run
      `bun run nightshift:write`, and add `packages/nightshift/contrast.test.ts` over every text token and its surfaces
- [x] 9.2 Move highlight-colored text to `text-link`, lighten the destructive button's dark fill, darken Sonner's light
      toast text, and grow the update badge's link to 24 pixels
- [x] 9.3 Add the `sentence-link` utility to `globals.css` and give it to every link inside a sentence, the note
      editor's links included
- [x] 9.4 Add `useScrollRegionTabStop` and give a scrolling popover body and a `ScrollBox` a tab stop while they scroll
- [x] 9.5 Move the email link onto the `link` token, render the emails again under `renders/after/`, and update the
      design's section 5
- [x] 9.6 Drop each fixed story's `todo` flag, turn the one rule off on the open Select stories, sweep every story in
      light and dark again, and record the result in the design's section 8
- [x] 9.7 Record the client size in the design's section 11, retake the release screenshots, and update the agent
      docs
