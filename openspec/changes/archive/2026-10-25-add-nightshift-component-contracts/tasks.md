## 1. Record the web's starting point

- [x] 1.1 Record every `buttonVariants` result for the 36 variant and size pairs and every `badgeVariants` result for
  the 3 variants, each with and without a sample `className`, into
  `apps/web/src/components/primitives/primitiveClassesTestFixtures.ts`
- [x] 1.2 Build the web client and note `apps/web/dist` sizes, and read a primary button's and a badge's computed
  `box-shadow` in light and dark at `:3000`

## 2. Move the elevation and `cn` into the shared packages

- [x] 2.1 Add `packages/nightshift/elevation.ts` with the raised shadow's two shadows, write it as
  `@utility shadow-raised` from `tokensCss.ts` and `uniwindCss.ts` and as a `shadow` token in both Figma files, run
  `bun run nightshift:write`, and add `elevation.test.ts`. `tokens.test.ts` already holds the written files to the
  source
- [x] 2.2 Remove `@utility shadow-lift` from `apps/web/src/globals.css` and confirm the built CSS rules from 1.2
- [x] 2.3 Add `packages/nightshift/classNames.ts` with `cn` and its tests, declare `clsx` and `tailwind-merge` in
  `packages/nightshift`, let the boundary check pass it from any web file, move the web's `cn` importers to it by
  script, and remove `cn` from `apps/web/src/lib/utils.ts`

## 3. Write the contracts

- [x] 3.1 Add `class-variance-authority` to `packages/nightshift` and `packages/nightshift/componentPlatforms.ts` with
  the `ComponentPlatform` type
- [x] 3.2 Write `packages/nightshift/components/button.ts`: the names tuples and unions, `buttonDefaults`, the box and
  text classes from the design's table, `ButtonVariantProps`, `ButtonSharedProps`, and `platforms`
- [x] 3.3 Write `packages/nightshift/components/badge.ts` the same way
- [x] 3.4 Hold each variant map of the box and text classes to its names tuple with `satisfies`, and cover the classes
  through the web's fixture test in 4.4 instead of a second test beside the contracts

## 4. Rebuild the web implementations

- [x] 4.1 Add `@source "../../../packages/nightshift/components"` to `apps/web/src/globals.css`
- [x] 4.2 Rebuild `button.tsx` on the contract with its web base and its variant and size records, keeping `Button` and
  `buttonVariants` and their signatures
- [x] 4.3 Rebuild `badge.tsx` the same way, keeping `Badge` and `badgeVariants`, and drop `class-variance-authority`,
  `clsx`, and `tailwind-merge` from the web's dependencies
- [x] 4.4 Add `primitiveClasses.test.tsx`, comparing every result to the fixture as a set of classes
- [x] 4.5 Read the stories' `variant` and `size` options from the contracts' names tuples in `button.stories.tsx` and
  `badge.stories.tsx`
- [x] 4.6 Let the boundary check pass a contract import from its web implementation alone, with fixtures in
  `packageBoundaries.test.ts`

## 5. Add the mobile implementations

- [x] 5.1 Add the `@/*` path to `apps/mobile/tsconfig.json`, move the `../../typeRoleStyles` imports to it, and add
  `apps/mobile/components.json`
- [x] 5.2 Add Reusables' `button`, `badge`, `text`, and `icon` with its CLI for Uniwind into
  `apps/mobile/src/components/primitives/`, and install their dependencies with `expo install` at versions that clear
  the release age
- [x] 5.3 Add `@source` for the contracts folder to `apps/mobile/global.css`
- [x] 5.4 Rebuild the mobile `button.tsx` on the contract: the box classes and mobile records on the `Pressable`, the
  text classes through `TextClassContext`, a required `accessibilityLabel`, the button role, and `asChild` through
  `@rn-primitives/slot`
- [x] 5.5 Rebuild the mobile `badge.tsx` the same way, trim `text.tsx` to the text class context and the Karla family,
  and use Nightshift's `cn` in all four files. The CLI wrote no utils file
- [x] 5.6 Move `sign-in.tsx`, `sign-up.tsx`, and `settings.tsx` onto the new `Button` and `Text`, and delete
  `SessionButton.tsx`

## 6. Add the parity check

- [x] 6.1 Write `scripts/componentParity.ts` with the design's rules over the contracts and the apps' source files
- [x] 6.2 Write `scripts/componentParity.test.ts` with a fixture for each rule and the passing case
- [x] 6.3 Write `scripts/check-component-parity.ts`, run it in `scripts/preflight.sh` after the boundary check, and
  update the README's Development section, `CLAUDE.md`'s gate list, and `AGENTS.md`'s Verification line
- [x] 6.4 Add a variant name to the Button contract and confirm `tsc -b` fails in both apps, then undo it

## 7. Add the mobile component browser

- [x] 7.1 Install `@storybook/react-native`, `storybook` at 10.6.2, the controls and actions addons, and the peers
  with `expo install`, at versions that clear the release age
- [x] 7.2 Add `apps/mobile/.rnstorybook/main.ts` and `preview.tsx` with the stylesheet and the light and dark toggle
  over `Uniwind.setTheme`, and include `.rnstorybook/**` in the tsconfig
- [x] 7.3 Wrap the Metro config in `withStorybook` inside `withUniwindConfig`, enabled outside production, and commit
  the generated `storybook.requires.ts`, which Biome skips
- [x] 7.4 Add `app/storybook.tsx` and its `Stack.Protected guard={__DEV__}` in `_layout.tsx`
- [x] 7.5 Write `button.stories.tsx` and `badge.stories.tsx` beside the mobile implementations with the web stories'
  titles, names, args, and controls
- [x] 7.6 Extend the boundary check's component browser rule to `apps/mobile`, with fixtures
- [x] 7.7 Fail the CI export job if either bundle contains `SET_CURRENT_STORY`, Storybook's event name

## 8. Docs and the Inventory page

- [x] 8.1 Mark Button and Badge as contracts with a web and a mobile implementation in
  `apps/web/src/nightshift/inventoryTable.md`, update the Inventory page's line about the planned Expo app, and move
  the raised shadow into the Tokens page's source sections
- [x] 8.2 Update `packages/nightshift/AGENTS.md` with the contracts folder, `componentPlatforms.ts`, `elevation.ts`,
  and `classNames.ts`, and `apps/web/AGENTS.md` with the implementations and the contract import rule
- [x] 8.3 Update `apps/mobile/AGENTS.md` with `src/components/primitives/`, the `@/` alias, `components.json`, the
  `storybook` route, `.rnstorybook/`, and the session screens' Button
- [x] 8.4 Update the root module map, a routing row for contracts, the "Never read" list with `storybook.requires.ts`,
  and the jsx-conventions skill with how a contract and its implementations work

## 9. Verify

- [x] 9.1 `bun run check` passes, with the boundary check still proving `packages/nightshift` universal
- [x] 9.2 The fixture test passes, the built CSS keeps every rule from 1.2 and gains the streamdown rules once its
  source path is fixed, and the client's JavaScript grows by no more than a kilobyte gzipped
- [x] 9.3 `bun run build:storybook` succeeds and the Button and Badge stories look as before in light and dark
- [x] 9.4 `expo export` for both platforms holds no `SET_CURRENT_STORY`, and a development export holds it
- [x] 9.5 On a rebuilt development client, the mobile Storybook renders every Button and Badge variant and size in light
  and dark, pressed and disabled, on the iOS simulator
- [x] 9.6 Sign in and open settings on the simulator, and confirm the buttons there are the new Button

## 10. Fix what the review found

- [x] 10.1 Let the mobile Button's label sizes grow with the system text size (`h-auto` over a minimum height), and
  check the sign-in screen at the largest accessibility size
- [x] 10.2 Track the mobile Button's own press for its label's pressed classes, since Uniwind reads no `group-active:`,
  and check the Link's pressed underline on the simulator
- [x] 10.3 Name the importing app's own implementation in the parity check's call-site violation, with a test for a
  contract that names no implementation in that app
- [x] 10.4 Fail the CI Storybook check if the export holds no bundle
- [x] 10.5 Point the web stylesheet's streamdown source at the installed package
- [x] 10.6 Bring the specs, the design, the proposal, the AGENTS.md files, and the README in line with the code: stories
  and tests may import a contract, the release build's storybook route redirects, and the counts and paths are exact

## 11. Show the web's logo on mobile

- [x] 11.1 Move the mug's paths and steam motion into `packages/nightshift/coffeeMug.ts`, draw the web's
  `CoffeeMug.tsx` from it, and add `coffeeMugSteam.test.ts`
- [x] 11.2 Move the Google and Apple logos' paths into `packages/nightshift/oauthProviderIcons.ts`, and draw the web's
  `OAuthProviderIcons.tsx` and `BrandIcon.tsx` from it
- [x] 11.3 Add the `logo` type role and run `bun run nightshift:write`
- [x] 11.4 Let the boundary check pass both modules from any web file, with fixtures
- [x] 11.5 Add `ClassNameSvg.tsx`, the mobile `CoffeeMug.tsx` on React Native's `Animated`, `OAuthProviderIcons.tsx`,
  and the logo in `SessionScreen.tsx`
- [x] 11.6 Grow the logo and the provider icons with the text size up to double through `useFontScaledSize`, let a
  Button label wrap beside an icon, and wrap the footer link
- [x] 11.7 Compare the sign-in screen with the web's login page on the simulator at the default and the largest text
  size
- [x] 11.8 Update `packages/nightshift/AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, and the Tokens page

## 12. Fix what the ship review found

- [x] 12.1 Split the boundary check into `scripts/workspaces.ts`, `scripts/importBoundaries.ts`, and
  `scripts/packageBoundaries.ts`, with the tests split to match over `scripts/workspaceTestFixtures.ts`, and share the
  file scan in `scripts/sourceFiles.ts`
- [x] 12.2 Share the mug's and the icons' view boxes from Nightshift, the web's name class as `LOGO_CLASS` held to the
  logo role, and the mobile Button's size classes
- [x] 12.3 Fail the parity check on an implementation that imports only its contract's types, and the CI Storybook check
  on a missing bundle for either platform
- [x] 12.4 Draw the mobile steam on React Native's `Animated` with the native driver, hold it still on a phone and
  under reduced motion as the web does, memoize the mug, and replace the screen between sign-in and sign-up
- [x] 12.5 Let the boundary check pass a contract import anywhere and the parity check own where it may come from, and
  read `require()` imports
- [x] 12.6 Turn Storybook's telemetry off in the Metro config, reset the story theme once when the component browser
  closes, pin the Reusables CLI, and add the mobile `Text` and `Icon` stories
- [x] 12.7 Rename `wordmark` to `logo`, the brand mark hook to `useFontScaledSize`, and the names and comments the
  audit found, and simplify the raised shadow's writer

## 13. Match the web's button heights and settle the names

- [x] 13.1 Draw the mobile Button at the web's heights from the contract's `buttonHeightsRem`, held to the box classes
  by `button.test.ts`, and reach the 44-point touch target through a hit slop
- [x] 13.2 Draw Apple's native button at the `default` Button's height, never shorter, inside a `Pressable` with the
  same hit slop, and compare both oauth buttons and the hit slop on the simulator
- [x] 13.3 Rename `shadow-lift` to `shadow-raised`, an app's copy of a contract to its implementation, and a contract's
  recipes to its box and text classes
- [x] 13.4 Move the steam's still width to `MD_BREAKPOINT_REM` in `packages/nightshift/breakpoints.ts`
- [x] 13.5 Move the root `components.json` to `apps/web/`, point both apps' utils alias at
  `@carlnotes/nightshift/classNames` through an exact export, and fail an import from the `cn` package in Biome
