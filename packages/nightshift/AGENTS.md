# packages/nightshift/

`@carlnotes/nightshift`, Nightshift, the CarlNotes design system: the color tokens, the radius scale, the elevation,
the fonts, and the type roles in TypeScript, which the web app, the mobile app, the emails, and the api's own pages
read, and the component contracts both apps' implementations build on. `tokens.css`, `uniwind.css`, and the Figma
files are written from the tokens.

- `colors.ts` — every color token with its Latte (light) value, its Dark roast (dark) value, and its description.
  `latte` and `darkRoast` are each mode's values by name. `colorModes` lists the modes, and `toColorChannels` reads a
  hex or an rgba value's channels and alpha.
- `radius.ts` — the base radius and each step's offset. `typography.ts` — the font families, the type roles with the
  Tailwind classes each maps to, and the email's system font stack. `theme.ts` — the names the web theme maps, and
  `toColorCssVariable`, a color token as its `var(--color-<kebab>)`, so a style that reads it follows the theme toggle.
  `units.ts` converts rem to pixels at the browser's default 16-pixel rem: `toPixels` and `toRemAndPixels`, a label
  such as "0.625rem, 10px". `breakpoints.ts` — `MD_BREAKPOINT_REM`, Tailwind's `md` breakpoint, for code that reads
  a screen width outside a class.
- `elevation.ts` — the raised shadow, the one elevation, as its two shadows, and `toRaisedShadowUtilityCss`, the
  `shadow-raised` utility both stylesheets hold. `classNames.ts` — `cn`, the class merge both apps build classes with:
  clsx inside a tailwind-merge taught that `shadow-raised` is a shadow. The package exports it by name as well as
  through the wildcard. The shadcn CLI resolves a `components.json` alias only through an exact export.
- `components/` — the component contracts, one module per component both apps share: `button.ts` and `badge.ts`. A
  contract exports its variant names, and a Button its size names, as tuples with their unions, its defaults, its box
  classes for the container and its text classes for the label, built with class-variance-authority, its variant props
  type, the props both platforms share, such as Button's `variant`, `size`, `disabled`, and `asChild`, and `platforms`,
  the apps that keep an implementation, typed by `componentPlatforms.ts`. The box and text classes are only classes both
  the web and Uniwind on native draw. `buttonHeightsRem` is each Button size's height, which the mobile Button draws and
  grows to its touch target through a hit slop. Each app's implementation, at `src/components/primitives/<name>.tsx`,
  adds its platform's classes in records keyed by those unions, so a variant added or renamed here fails `tsc -b` in
  both apps until both implementations match. Event props stay with each implementation: `onClick` on the web and
  `onPress` on mobile. React Native text does not inherit its container's color, so the mobile implementation gives the
  text classes to the label through a context. `scripts/check-component-parity.ts` fails preflight if a contract is
  missing an implementation, an implementation imports no value from its contract or has no story, or an app file other
  than the implementation, a story, or a test imports a contract. The contracts keep the web's variant names, unused
  ones included. Renaming or removing a variant is a change of its own.
- `coffeeMug.ts` — the coffee mug in the CarlNotes logo: its view box, the cup and handle paths, the strokes, the
  three steam wisps, and the steam's motion. The steam holds still below the `md` breakpoint, as on a phone.
  `oauthProviderIcons.ts` — the sign-in providers' icons: the Google logo's colored paths and the Apple logo's path.
- `noteHtmlStyle.ts` — `toNoteHtmlStyle`, the note body's style from a `NotePalette` of six color tokens
  (foreground, mutedForeground, muted, border, link, primary), which the web app passes to the note editor and its
  display component: `h1` at the pageTitle size, `h2` at sectionHeading, `h3` at bodyLarge, all bold and in the body
  family, the quote on the border color in muted text, code on the muted fill, links underlined in the link color, the
  checkbox in primary, and the code block's radius at the `md` step. The web app passes CSS variables through
  `toColorCssVariable`. The mobile app has no note code yet, and a mobile note screen will pass `latte` or `darkRoast`
  for its mode when that change lands.
- `email.ts` — what an email inlines: the Latte palette, the font stack, and a role's size in pixels. Email clients
  do not reliably read CSS custom properties.
- `tokensCss.ts`, `uniwindCss.ts`, and `figmaTokens.ts` — pure functions that return the text of `tokens.css`, the text
  of `uniwind.css` (the mobile theme: each mode's resolved values in a `@variant` block, the radius steps in pixels, and
  the raised shadow's utility), and the Design Tokens Community Group 1.0 JSON for Figma, one file per mode, the raised
  shadow as a `shadow` token. `writtenFiles.ts` returns each written file's text by its path, for the writer and
  `tokens.test.ts`.
- Written files: `tokens.css`, which `apps/web/src/globals.css` imports, `uniwind.css`, which `apps/mobile/global.css`
  imports, and `figma/light.tokens.json` and `figma/dark.tokens.json`. Change the source, then run
  `bun run nightshift:write` (`scripts/write-nightshift-tokens.ts`), which writes all four. Never edit them by hand.
- Importers: `apps/web`, which reads the stylesheet, `classNames.ts`, `coffeeMug.ts`, `oauthProviderIcons.ts`,
  `noteHtmlStyle.ts` and `theme.ts`'s `toColorCssVariable` for the note's style, and the contracts anywhere as far as
  the boundary check goes, each contract only from its implementation, a story, or a
  test by the parity check, and the rest of the TypeScript only from its tests, the stories, `.storybook/`, and
  `src/nightshift/`; `apps/mobile`, which reads `uniwind.css` and the TypeScript freely, each contract only from its
  implementation, a story, or a test; `packages/emails`; `apps/api`, for its own HTML pages and share images; and
  `scripts/`.
- Universal: no file writes, no DOM, and no runtime globals. The writer lives in `scripts/`.
- Tests: `tokens.test.ts` fails if a written file differs from the source or a type role differs from the Tailwind
  values its classes give. `contrast.test.ts` fails if a text token reads under the WCAG AA 4.5:1 ratio on any surface
  the web app sets it on, in either mode. `colors.test.ts` checks that `toColorChannels` reads a hex or an rgba value
  and throws an error for any other. `elevation.test.ts` checks the raised shadow's utility, `classNames.test.ts`
  the class merge, `noteHtmlStyle.test.ts` that the note's headings take the type roles' sizes in bold, its colors
  follow the palette, and its code block takes the medium radius, and `components/button.test.ts` that each Button
  size's box classes draw its height.
- Dependencies: `class-variance-authority`, `clsx`, and `tailwind-merge`, all pure, so the package stays universal.
