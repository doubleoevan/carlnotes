# packages/nightshift/

`@carlnotes/nightshift`, Nightshift, the CarlNotes design system: the color tokens, the radius scale, the fonts, and
the type roles in TypeScript, which the web app, the mobile app, the emails, and the api's own pages read.
`tokens.css`, `uniwind.css`, and the Figma files are written from them.

- `colors.ts` — every color token with its Latte (light) value, its Dark roast (dark) value, and its description.
  `latte` and `darkRoast` are each mode's values by name. `colorModes` lists the modes, and `toColorChannels` reads a
  hex or an rgba value's channels and alpha.
- `radius.ts` — the base radius and each step's offset. `typography.ts` — the font families, the type roles with the
  Tailwind classes each maps to, and the email's system font stack. `theme.ts` — the names the web theme maps.
  `units.ts` converts rem to pixels at the browser's default 16-pixel rem: `toPixels` and `toRemAndPixels`, a label
  such as "0.625rem, 10px".
- `email.ts` — what an email inlines: the Latte palette, the font stack, and a role's size in pixels. Email clients
  do not reliably read CSS custom properties.
- `tokensCss.ts`, `uniwindCss.ts`, and `figmaTokens.ts` — pure functions that return the text of `tokens.css`, the
  text of `uniwind.css` (the mobile theme: each mode's resolved values in a `@variant` block, and the radius steps in
  pixels), and the Design Tokens Community Group 1.0 JSON for Figma, one file per mode. `writtenFiles.ts` returns each
  written file's text by its path, for the writer and `tokens.test.ts`.
- Written files: `tokens.css`, which `apps/web/src/globals.css` imports, `uniwind.css`, which `apps/mobile/global.css`
  imports, and `figma/light.tokens.json` and `figma/dark.tokens.json`. Change the source, then run
  `bun run nightshift:write` (`scripts/write-nightshift-tokens.ts`), which writes all four. Never edit them by hand.
- Importers: `apps/web`, which reads the stylesheet anywhere and the TypeScript only from its tests, the stories,
  `.storybook/`, and `src/nightshift/`; `apps/mobile`, which reads `uniwind.css` and the TypeScript freely;
  `packages/emails`; `apps/api`, for its own HTML pages and share images; and `scripts/`.
- Universal: no file writes, no DOM, and no runtime globals. The writer lives in `scripts/`.
- Tests: `tokens.test.ts` fails if a written file differs from the source or a type role differs from the Tailwind
  values its classes give. `contrast.test.ts` fails if a text token reads under the WCAG AA 4.5:1 ratio on any surface
  the web app sets it on, in either mode. `colors.test.ts` checks that `toColorChannels` reads a hex or an rgba value
  and throws an error for any other.
