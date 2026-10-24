# design-system delta: add-mobile-app

## MODIFIED Requirements

### Requirement: Every design token has one TypeScript source

`@carlnotes/nightshift` SHALL hold every CarlNotes design token in TypeScript: the Latte palette, the Dark roast
palette, the radius scale, the font families, and the semantic names the web app's theme maps for shadcn and for the
app's own extras. A palette SHALL be keyed by mode, light and dark, and never by a CSS selector, so each output writes
its own selector. `packages/nightshift/tokens.css` and the Uniwind theme `packages/nightshift/uniwind.css` SHALL be
written from that source by a script under `scripts/` and committed, and a test SHALL fail preflight if a committed
file differs from what the source writes. The web app's computed custom properties SHALL be the same in light and dark
before and after the source moves into TypeScript. The web app SHALL import `@carlnotes/nightshift/tokens.css` from any
file and nightshift's TypeScript only from a test, a story, `.storybook/`, or `src/nightshift/`, and the package
boundary check SHALL enforce it, so no palette module reaches the browser bundle.

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

## ADDED Requirements

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
