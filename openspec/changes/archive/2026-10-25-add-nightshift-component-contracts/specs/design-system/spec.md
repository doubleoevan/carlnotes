## MODIFIED Requirements

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

## ADDED Requirements

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
