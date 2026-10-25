## ADDED Requirements

### Requirement: Nightshift owns each shared component's contract

`packages/nightshift/components/` SHALL hold one module per shared component, such as `button.ts` and `badge.ts`. Each
module SHALL export its variant names, and its size names where it has sizes, as tuples with the union types over them,
its defaults, its box classes and its text classes built with class-variance-authority, its variant props type, the
props both platforms share, and `platforms`, the apps that need an implementation of it. The shared props SHALL be the
variant, the size, and `disabled` and `asChild` where the component has them. Event props SHALL stay out of a contract.
The box and text classes SHALL be only classes that both the web and Uniwind on native draw. The contracts SHALL keep
the web primitives' vocabulary exactly: Button's `default`, `destructive`, `outline`, `secondary`, `ghost`, and `link`
variants and its `default`, `sm`, `lg`, `icon`, `icon-sm`, and `icon-lg` sizes, and Badge's `default`, `secondary`, and
`outline` variants. The package SHALL stay universal, which the package boundary check's closure walk proves.

#### Scenario: A contract names its variants once

- **WHEN** a developer reads `packages/nightshift/components/button.ts`
- **THEN** it exports `buttonVariantNames`, `buttonSizeNames`, `buttonDefaults`, `buttonBoxVariants`,
  `buttonTextVariants`, `ButtonVariantProps`, `ButtonSharedProps`, and `platforms`, and each variant map in
  `buttonBoxVariants` and `buttonTextVariants` is keyed by its names tuple's union

#### Scenario: The package stays universal

- **WHEN** the package boundary check walks `packages/nightshift`'s runtime closure with `class-variance-authority`
  declared
- **THEN** it reaches no server package and reports no violation

### Requirement: Every contract has an implementation in each app it names

Preflight SHALL run a parity check, `scripts/check-component-parity.ts` over the rules in `scripts/componentParity.ts`
and their test. For each contract `packages/nightshift/components/<name>.ts`, each app its `platforms` names SHALL hold
an implementation at the mirrored path, `apps/web/src/components/primitives/<name>.tsx` for the web and
`apps/mobile/src/components/primitives/<name>.tsx` for mobile, and each implementation SHALL import a value, not types
alone, from `@carlnotes/nightshift/components/<name>` and have a story beside it. An implementation at the mirrored path
for a platform the contract does not name, and an implementation whose contract does not exist, SHALL be orphans. No app
file other than an implementation, a story, or a test SHALL import a contract. Each violation SHALL name the contract or
the implementation and the path the check expected, and a call site's violation SHALL name its own app's implementation.
Each implementation SHALL type its platform's classes as records keyed by the contract's variant and size unions, so a
variant added to or renamed in a contract fails `tsc -b` in each app until its implementation matches.

#### Scenario: A missing mobile implementation fails preflight

- **WHEN** `apps/mobile/src/components/primitives/badge.tsx` is deleted
- **THEN** the parity check fails naming `packages/nightshift/components/badge.ts` and the path
  `apps/mobile/src/components/primitives/badge.tsx`

#### Scenario: An implementation that ignores its contract fails

- **WHEN** the web's `button.tsx` defines its own classes and does not import `@carlnotes/nightshift/components/button`
- **THEN** the parity check fails naming the implementation and the import it expected

#### Scenario: An implementation that imports only its contract's types fails

- **WHEN** the web's `badge.tsx` defines its own classes and imports only `BadgeVariant` as a type from its contract
- **THEN** the parity check fails naming the implementation and its contract

#### Scenario: A web-only contract with a mobile implementation is an orphan

- **WHEN** a contract's `platforms` is `["web"]` and a file sits at its mobile mirrored path
- **THEN** the parity check fails naming the mobile file as an orphan

#### Scenario: A call site imports the implementation, not the contract

- **WHEN** a web page imports `@carlnotes/nightshift/components/button`
- **THEN** the parity check fails naming the page and the implementation to import instead

#### Scenario: A new variant fails both apps

- **WHEN** a developer adds a variant name to `buttonVariantNames` and its box and text classes without changing either
  implementation
- **THEN** `tsc -b` fails in `apps/web` and in `apps/mobile`, each naming its implementation's missing variant

#### Scenario: The fixtures cover each rule

- **WHEN** `bun test scripts/componentParity.test.ts` runs
- **THEN** a missing implementation, an implementation without its import, an implementation without a story, an orphan,
  a contract without `platforms`, and an app file importing a contract each fail, and a fixture with both
  implementations and their stories passes. Preflight's run of the check proves the repo's own tree

### Requirement: The web implementations render the classes they rendered before

`apps/web/src/components/primitives/button.tsx` and `badge.tsx` SHALL build on their contracts and add only the web's
own classes, and SHALL keep exporting `Button`, `buttonVariants`, `Badge`, and `badgeVariants` with the same call
signatures. For every variant and size, with and without a `className`, each implementation SHALL return the same set of
classes the primitive returned before the change, with `shadow-raised` in place of `shadow-lift`, which a test checks
against a fixture recorded from the primitives on `main` and renamed to match. The web's stylesheet SHALL read the
contracts folder as a Tailwind source, and the built CSS SHALL lose no rule.
The streamdown source SHALL point at the installed package, so the built CSS gains the rules for streamdown's classes,
which a wrong path left out. The built web client's JavaScript SHALL grow by no more than a kilobyte gzipped.

#### Scenario: Every variant and size renders the same classes

- **WHEN** the test calls `buttonVariants` for each of the 36 variant and size pairs and `badgeVariants` for each of
  the 3 variants
- **THEN** each result's classes equal the recorded set

#### Scenario: A class written only in a contract reaches the stylesheet

- **WHEN** the web app builds
- **THEN** the built CSS defines every class the contracts' box and text classes name, and every rule it held before the
  change

### Requirement: The mobile implementations draw each contract on native

`apps/mobile/src/components/primitives/button.tsx` and `badge.tsx` SHALL start from React Native Reusables' Uniwind
components, added with its CLI, and SHALL build on their contracts: the box classes on the `Pressable` or `View`, and
the text classes through a `TextClassContext` to the `Text` inside. Each SHALL add only mobile classes and props: a
pressed state for each Button variant in place of the web's hover, `flex-row` in place of `inline-flex`, the web's
height as a minimum on every label size, a height that grows with the system text size, a hit slop that grows every
size's touch target to 44 points, a label that shrinks to wrap beside an icon and stays centered, and the border color
the web's base layer gives. The mobile Button SHALL track its own press for its label's pressed classes, since Uniwind
reads no group variant on native. The mobile Button SHALL require an `accessibilityLabel` and render with the button
role. The mobile `Text` SHALL set the Karla family. The design SHALL list every web class with no native equivalent and
what the mobile implementation does instead.

#### Scenario: A pressed button shows its pressed state

- **WHEN** a user presses a `default` Button on iOS or Android
- **THEN** its fill draws at the pressed opacity until the press ends

#### Scenario: A small button still meets the touch target

- **WHEN** a Button renders at the `sm` size
- **THEN** it draws 32 points tall, as the web's does, and its touch target measures at least 44 points tall

#### Scenario: A label grows with the system text size

- **WHEN** the system text size is raised to an accessibility size and a screen renders a `default` Button
- **THEN** the button grows to fit its label, and no line of the label is clipped

#### Scenario: A label wraps beside an icon

- **WHEN** the system text size is the largest accessibility size and a Button renders an icon before its label
- **THEN** the icon and the label both stay inside the button, and the label wraps, centered, beside the icon

#### Scenario: A button without a label fails to type-check

- **WHEN** a screen renders the mobile Button without `accessibilityLabel`
- **THEN** `tsc -b` fails naming the missing prop

### Requirement: The mobile app has a component browser on the device in development builds only

`apps/mobile` SHALL hold Storybook for React Native at its current release, configured in `apps/mobile/.rnstorybook/`,
and opened at the `storybook` route, which the root layout shows only while `__DEV__` is true. The Metro config SHALL
turn Storybook on only outside production, so `expo export`, an EAS release build, and an EAS Update hold none of its
modules, and the CI export job SHALL fail if a production bundle contains a Storybook module or no bundle is found.
Every story SHALL load the app's stylesheet and have a light and dark toggle that switches the Uniwind theme. Each
mobile implementation's stories SHALL use the web stories' titles, story names, args, and controls, with each control's
options read from the contract.

#### Scenario: A production bundle holds no Storybook

- **WHEN** the CI export job bundles both platforms
- **THEN** neither bundle contains Storybook's `SET_CURRENT_STORY` event name, which minification keeps, and the job
  passes

#### Scenario: A release build has no storybook route

- **WHEN** a preview or production build opens the `storybook` route
- **THEN** the guard sends it to the first screen the session's guards allow, the home screen for a user and the
  sign-in screen for a visitor, and the component browser never renders

#### Scenario: The stories render in both modes

- **WHEN** a developer opens the Button stories on the iOS simulator and switches the toggle to dark
- **THEN** every story re-renders in the Dark roast values

#### Scenario: The mobile stories match the web's

- **WHEN** a developer lists the mobile Button stories
- **THEN** they are Default, Destructive, Outline, Secondary, Ghost, Link, Sizes, IconSizes, WithIcon, and Disabled,
  with variant and size controls offering the contract's names
