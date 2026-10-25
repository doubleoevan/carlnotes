# design-system Specification

## Purpose
TBD - created by archiving change start-the-nightshift-design-system. Update Purpose after archive.
## Requirements
### Requirement: Every design token has one TypeScript source

`@carlnotes/nightshift` SHALL hold every CarlNotes design token in TypeScript: the Latte palette, the Dark roast
palette, the radius scale, the font families, the elevation, and the semantic names the web app's theme maps for shadcn
and for the app's own extras. A palette SHALL be keyed by mode, light and dark, and never by a CSS selector, so each
output writes its own selector. `packages/nightshift/tokens.css` and the Uniwind theme `packages/nightshift/uniwind.css`
SHALL be written from that source by a script under `scripts/` and committed, and a test SHALL fail preflight if a
committed file differs from what the source writes. Both written files SHALL define the elevation as the `shadow-raised`
utility, which replaces the web's `shadow-lift`, and `apps/web/src/globals.css` SHALL not define it again. The web app's
computed custom properties and the computed shadow of a raised element SHALL be the same in light and dark before and
after the source moves into TypeScript. The web app SHALL import `@carlnotes/nightshift/tokens.css`,
`@carlnotes/nightshift/classNames`, the class merge, `@carlnotes/nightshift/coffeeMug`,
`@carlnotes/nightshift/oauthProviderIcons`, and the component contracts from any file as far as the package boundary
check goes. The component parity check SHALL hold a contract to its implementation at
`apps/web/src/components/primitives/<name>.tsx`, a test, or a story. The web app SHALL import every other Nightshift
TypeScript module only from a test, a story, `.storybook/`, or `src/nightshift/`. The package boundary check SHALL
enforce it, so no palette module reaches the browser bundle.

#### Scenario: A hand edit to tokens.css fails preflight

- **WHEN** a developer changes `--primary` in `packages/nightshift/tokens.css` without changing the source
- **THEN** the test fails naming `tokens.css` and telling the developer to run the token writer

#### Scenario: A token edit reaches the web app and Figma together

- **WHEN** a developer changes the Latte `primary` value in the source and runs the token writer
- **THEN** `tokens.css`, `uniwind.css`, and the light Figma file all change, and the test passes

#### Scenario: The move changes no computed value

- **WHEN** the web app's custom properties on the document element are read in light and in dark, before and after the
  move
- **THEN** every property has the same value

#### Scenario: A page that imports a palette module fails preflight

- **WHEN** a developer imports `@carlnotes/nightshift/colors` in `apps/web/src/pages/HomePage.tsx`
- **THEN** the package boundary check fails naming the file and the import

#### Scenario: A hand edit to the Uniwind theme fails preflight

- **WHEN** a developer changes a value in `packages/nightshift/uniwind.css` without changing the source
- **THEN** the test fails naming `uniwind.css` and telling the developer to run the token writer

#### Scenario: The raised shadow reads the same after it moves

- **WHEN** a primary button's computed `box-shadow` is read in light and in dark, before and after the elevation moves
  into Nightshift
- **THEN** both reads give the same two shadows

#### Scenario: A web implementation imports its contract

- **WHEN** `apps/web/src/components/primitives/button.tsx` imports `@carlnotes/nightshift/components/button`
- **THEN** the package boundary check passes, and the component parity check fails the same import from
  `apps/web/src/pages/HomePage.tsx`, naming the file and the web implementation to import instead

### Requirement: Every text token reads at the WCAG AA ratio on its surfaces

Every color token the web app sets text in SHALL read at 4.5:1 or more against each surface the app sets it on, in light
and in dark: the foreground, muted, link, destructive, and badge text on the page, a card, a popover, a subtable, the
muted fill, a hovered row, and a chat bubble, each foreground token on its own fill, secondary text on a card and a
popover, and the hero text on the hero band. A test in `packages/nightshift` SHALL check every pair from the TypeScript
source. A link inside a sentence SHALL show a cue besides its color at rest, since no link color reads at 4.5:1 on the
page and at 3:1 against the text around it, and a link that stands alone SHALL keep its underline for hover.

#### Scenario: A muted token under the ratio fails the test

- **WHEN** a developer lightens the Latte `mutedForeground` until it reads at 4.2:1 on the page
- **THEN** the test fails naming the light `mutedForeground` and `background` pair

#### Scenario: A link in a sentence shows without its color

- **WHEN** the persona credit renders in light or dark
- **THEN** each of its links is underlined at rest, and the accessibility check reports no link-in-text-block finding

### Requirement: The source names the type roles the web app renders

The source SHALL name each type role the web app uses, each with its font family, size, line height, weight, and the
Tailwind classes it maps to today, and SHALL name the system font stack the emails use, since web fonts do not load in
most email clients. A role's size and line height SHALL equal the values its Tailwind classes give, so naming a role
changes no page.

#### Scenario: A role matches its Tailwind size

- **WHEN** the test reads the section heading role and Tailwind's own theme
- **THEN** the role's size and line height equal the values its Tailwind classes give

### Requirement: The emails and the api's own pages read Nightshift's values

`packages/emails` SHALL declare `@carlnotes/nightshift` and take every color and font size in its templates from a
named token or type role, with no hex literal and no pixel font size written in a template. The api's unsubscribe page,
its blog pages, the share image, and the podcast cover SHALL take their colors from the same source. The web app's
theme-color values and `site.webmanifest`'s colors SHALL equal the hero tokens, which a test checks, so the browser
bundle includes no palette. The design SHALL list every email color and size with its value before and after, and every
email SHALL be rendered before and after the change.

#### Scenario: A literal color in a template fails the test

- **WHEN** a developer writes `color: "#7c4a1e"` in `packages/emails/auth-email.tsx`
- **THEN** the test fails naming the file and the literal

#### Scenario: An email renders the mapped values

- **WHEN** the topic scan email renders its preview props
- **THEN** every color in its HTML is a value the design's mapping lists for it

### Requirement: Figma reads the same tokens as the web app

The source SHALL write the colors, the radius scale, the elevation, and the type roles as Design Tokens Community Group
format 1.0 JSON, one file per mode, `packages/nightshift/figma/light.tokens.json` and
`packages/nightshift/figma/dark.tokens.json`, which Figma imports as variables. The elevation SHALL be a `shadow`
token. The token writer SHALL write them beside `tokens.css`, they SHALL be committed, and a test SHALL fail preflight
if a committed file differs from what the source writes.

#### Scenario: A stale Figma file fails preflight

- **WHEN** the source changes and `dark.tokens.json` is not rewritten
- **THEN** the test fails naming the file

### Requirement: The component browser shows the whole vocabulary

`apps/web` SHALL hold a Storybook on its TanStack React framework, a development dependency started by the root
`dev:storybook` script and built by `build:storybook`. It SHALL have a Tokens page with every color in both palettes and
the radius scale, and a Typography page with both font families and every type role, each read from the TypeScript
source, and an Inventory page listing every common component pattern, which SHALL mark each pattern that has a
component contract with its web and mobile implementations. Every component in `apps/web/src/components/primitives`,
`components/common`, `components/table`, and `components/layout` SHALL have a story with controls for its variants and
props, and a test SHALL fail if one has none. A pattern built only from `apps/web/src/lib/styleClasses.ts` classes SHALL
have a story composed from those classes as the app uses them. Every story SHALL load `globals.css` and have a light and
dark toggle. A story that needs a session or data SHALL get it from a decorator or a fixture, never from a change to the
component, and no story SHALL call the api or hold real user data. The accessibility addon SHALL check every story at
error level, and a finding SHALL be fixed in the component or listed in the design with the behavior a fix would
change. In `apps/web`, the package boundary check SHALL fail a file other than a `*.stories.tsx`, a file in
`.storybook/`, or a file in `src/nightshift/` that imports a `.stories` path or a `storybook` or `@storybook/*` module.
In `apps/mobile`, it SHALL fail a file other than a `*.stories.tsx`, a file in `.rnstorybook/`, or `app/storybook.tsx`
that imports a `.stories` path, a `.rnstorybook` path, or a `storybook` or `@storybook/*` module.

#### Scenario: A new primitive without a story fails the test

- **WHEN** a developer adds `apps/web/src/components/primitives/checkbox.tsx` without `checkbox.stories.tsx`
- **THEN** the test fails naming the file

#### Scenario: A story that reaches the api fails

- **WHEN** a story renders a component that fetches `/api/topics`
- **THEN** the request is rejected in the story and the story shows the error, instead of reaching a server

#### Scenario: A story imported by app code fails preflight

- **WHEN** a route imports a `.stories.tsx` file
- **THEN** the package boundary check fails naming the file

#### Scenario: A story renders in the dark palette

- **WHEN** a developer switches a story to dark
- **THEN** the story's root has the `dark` class and renders the Dark roast values

#### Scenario: A mobile screen that imports Storybook fails preflight

- **WHEN** `apps/mobile/app/settings.tsx` imports `@storybook/react-native`
- **THEN** the package boundary check fails naming the file and the import

#### Scenario: The Inventory page marks the contracts

- **WHEN** a developer opens the Inventory page
- **THEN** the Button and Badge rows name each as a contract with a web implementation and a mobile implementation

### Requirement: Coding agents read the catalog through Storybook's MCP server

The Storybook config SHALL turn on Storybook's MCP server and its components manifest, and the server SHALL be
registered at `http://localhost:6006/mcp` for Claude Code in `.mcp.json` and for OpenCode in `opencode.json` beside
`notion`, so a coding agent reads the catalog and reuses a Nightshift component instead of writing a new one.

#### Scenario: An agent lists the components

- **WHEN** `bun run dev:storybook` is running and an agent calls the server's component list
- **THEN** it returns the primitives and shared components with their stories

### Requirement: The footer links the component browser

The footer's link row SHALL be What CarlNotes Is, Releases, Source Code, and Nightshift Design System, which opens
`/nightshift/` in a new tab the way the docs link opens `/docs`, since the router does not own it. License, Privacy, and
Terms SHALL sit on their own row beneath it. Both rows SHALL wrap cleanly on a 375-pixel-wide phone.

#### Scenario: The link opens the component browser

- **WHEN** a visitor clicks Nightshift Design System in the footer
- **THEN** `/nightshift/` opens in a new tab and the current page stays

#### Scenario: The rows wrap on a phone

- **WHEN** the footer renders 375 pixels wide
- **THEN** no link breaks inside its label and no row scrolls sideways

### Requirement: The Uniwind theme gives native the same utilities as the web

The written Uniwind theme SHALL define every color name the web theme maps — the shadcn semantic names and the
CarlNotes extras — as a `--color-<name>` variable with each mode's resolved value, light and dark each in its own
`@variant` block under `:root` in `@layer theme`, so a utility like `bg-primary`, `text-muted-foreground`, or
`border-separator` names the same token on both platforms. Every variable SHALL be defined in both modes, since Uniwind
warns on a missing one. Every written color value SHALL be a form React Native reads, a hex or an rgba color, and the
token writer SHALL throw on any other form. The theme SHALL hold the radius scale as resolved pixel values in a
`@theme` block, since the per-theme blocks hold colors only. The theme SHALL be exported from the package's
`package.json` beside `tokens.css`.

#### Scenario: The same utility resolves on both platforms

- **WHEN** the web app renders `bg-primary` and the mobile app renders `bg-primary` in the same mode
- **THEN** both read the `primary` token's value for that mode from the Nightshift source

#### Scenario: Both modes define every variable

- **WHEN** the token writer writes the Uniwind theme
- **THEN** every mapped color name appears in the light block and in the dark block, and the tokens test holds the
  committed file to that output

#### Scenario: A color form React Native cannot read fails the write

- **WHEN** a mapped token's value is neither a six-digit hex nor an rgba color
- **THEN** the token writer throws naming the value, and no theme is written

### Requirement: Both apps draw the coffee mug and the sign-in providers' icons from one source

`@carlnotes/nightshift` SHALL hold the coffee mug in the CarlNotes logo in `coffeeMug.ts`: its view box, the cup and
handle paths, the strokes, the steam wisps, and the steam's motion. It SHALL hold the `md` breakpoint below which the
steam holds still in `breakpoints.ts`, the Google logo's colored paths and the Apple logo's path in
`oauthProviderIcons.ts`, and the CarlNotes name's type as the `logo` type role. The web app's and the mobile app's mug
and sign-in providers' icons SHALL draw from them, and a test SHALL fail if the web's steam keyframes or its phone and
reduced-motion still rules in `animations.css` differ from the shared motion.

#### Scenario: The web's steam follows the shared motion

- **WHEN** a developer changes the steam's period in `packages/nightshift/coffeeMug.ts` or the `md` breakpoint in
  `packages/nightshift/breakpoints.ts` without changing `apps/web/src/animations.css`
- **THEN** `coffeeMugSteam.test.ts` fails

#### Scenario: A web component imports a sign-in provider's icon

- **WHEN** `apps/web/src/components/session/OAuthProviderIcons.tsx` imports
  `@carlnotes/nightshift/oauthProviderIcons`
- **THEN** the package boundary check passes

