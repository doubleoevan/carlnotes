## Why

The web app and the Expo app now both draw buttons, and they already disagree: the web's `Button` has six variants and
six sizes, while the mobile sign-in screens grew their own `SessionButton` with four variants of its own. The Notion
Mobile page decided that Nightshift owns each component's vocabulary and each app keeps its own implementation, rendered
with Radix on the web and React Native Reusables, the shadcn/ui components ported to React Native, on mobile. Button and
Badge go first because both already build their classes with class-variance-authority in
`apps/web/src/components/primitives/`, and the mobile app is small enough that its screens can move onto the shared
Button now, before a second screen copies `SessionButton`.

## What Changes

- Add component contracts to `packages/nightshift/components/`, one module per component, starting with `button.ts` and
  `badge.ts`. Each exports its box classes and its text classes, built with class-variance-authority, the variant and
  size names, the defaults, the props both platforms share (`variant`, `size`, `disabled`, `asChild`), and the platforms
  it needs an implementation on. The variant and size names stay as they are, the unused secondary button included.
- Move the web's `shadow-lift` elevation into Nightshift as `shadow-raised`, Atlassian's word for the shadow under a
  raised surface, so the token writer writes the one value into `tokens.css` and `uniwind.css` and both apps draw the
  same raised shadow. Every web use moves to the new name.
- Rebuild `apps/web/src/components/primitives/button.tsx` and `badge.tsx` on the contracts, adding only the web's own
  classes: hover, focus-visible, the aria and svg selectors, and `has-`. Every variant and size renders the same classes
  as before, with `shadow-raised` in place of `shadow-lift`, which a test checks against a fixture recorded from today's
  primitives and renamed to match.
- Add the mobile implementations at the mirrored path, `apps/mobile/src/components/primitives/button.tsx` and
  `badge.tsx`, added with the Reusables CLI for Uniwind beside its `text.tsx`, and rebuilt on the contracts with pressed
  states and the web's heights grown to the 44-point touch target through a hit slop.
- Move the sign-in, sign-up, and settings screens onto the mobile `Button`, and delete `SessionButton.tsx`.
- Show the web's logo, the steaming coffee mug beside the name, on the mobile session screens, and Google's and Apple's
  logos on their buttons. The mug's paths and steam motion move into `packages/nightshift/coffeeMug.ts`, the provider
  icons' paths into `oauthProviderIcons.ts`, and the name's type into a `logo` type role, so both apps draw from one
  source. As on the web, the mobile steam holds still on a phone and under reduced motion. The mobile logo grows with
  the system text size up to double, and a test holds the web's steam keyframes and still rules to the shared motion.
- Add a parity check to preflight, `scripts/check-component-parity.ts` over `scripts/componentParity.ts` and its test:
  every contract has an implementation at the mirrored path in each app it names, each implementation imports a value
  from its contract and has a story, and an app imports a contract only from its implementation, a story, or a test. A
  missing implementation, or an orphaned one, an implementation with no contract that names its app, fails with the
  paths it expected.
- Let the web app import the `cn` class merge, the coffee mug, the sign-in providers' icons, and the contracts from any
  file as far as the package boundary check goes, with the parity check holding a contract to its implementation. Every
  other Nightshift TypeScript import stays limited to tests, stories, and the component browser.
- Point the web stylesheet's streamdown source at the installed package. Since the workspace move, the source named a
  folder that does not exist, and the chat's markdown drew without the rules for streamdown's classes.
- Add Storybook for React Native to `apps/mobile`, on device, behind a route that only a development build shows, with
  Metro replacing its modules with empty ones in any other build. Button and Badge get mobile stories with the web
  stories' names, args, and controls, and a light and dark toggle.
- Extend the boundary check's component browser rule to the mobile app, so no mobile app file imports a story or
  Storybook outside the stories and `.rnstorybook/`.
- Mark Button and Badge on the Inventory page as contracts with a web and a mobile implementation.
- Document how a contract and its implementations work in `packages/nightshift/AGENTS.md`, `apps/mobile/AGENTS.md`,
  `apps/web/AGENTS.md`, and the jsx-conventions skill.

## Capabilities

### New Capabilities

- `component-contracts`: Nightshift's component contracts, the web and mobile implementations built on them, and the
  parity check that keeps every contract implemented.

### Modified Capabilities

- `design-system`: the elevation joins the TypeScript source, the web app may import the class merge, the coffee mug,
  the sign-in providers' icons, and the contracts from any file, the coffee mug, the icons, and the `logo` role join the
  source, and the component browser rule and the story requirement extend to the mobile app's Storybook.
- `mobile-sign-in`: the sign-in, sign-up, and settings screens use the shared mobile Button and show the web's logo.
- `user-avatars`: the avatar's control styling names the raised shadow, the elevation's new name.

## Impact

- **Code:**
  - Nightshift: `packages/nightshift/components/` (new), `elevation.ts`, `classNames.ts` with its own export,
    `coffeeMug.ts`, `oauthProviderIcons.ts`, and `breakpoints.ts` (new), the `logo` role in `typography.ts`,
    `tokensCss.ts`, `uniwindCss.ts`, and the written `tokens.css` and `uniwind.css`.
  - The web app: `apps/web/src/globals.css` (the utility leaves), `apps/web/src/lib/utils.ts` (`cn` leaves, and its 155
    importers take the new path), `components/primitives/button.tsx` and `badge.tsx`, `CoffeeMug.tsx`,
    `OAuthProviderIcons.tsx`, `BrandIcon.tsx`, `coffeeMugSteam.test.ts`, `LOGO_CLASS` in `lib/styleClasses.ts`, and
    `src/nightshift/inventoryTable.md`.
  - The mobile app: `apps/mobile/src/components/primitives/` (new), `app/sign-in.tsx`, `sign-up.tsx`, `settings.tsx`,
    a new `app/storybook.tsx`, `.rnstorybook/` (new), `metro.config.js`, `components/branding/CoffeeMug.tsx`,
    `components/common/ClassNameSvg.tsx`, `components/session/OAuthProviderIcons.tsx`, `SessionScreen.tsx`,
    `hooks/useFontScaledSize.ts`, and `hooks/useIsReduceMotionEnabled.ts`.
  - Scripts: `scripts/packageBoundaries.ts`, split into `workspaces.ts`, `importBoundaries.ts`, and
    `packageBoundaries.ts`, with `sourceFiles.ts` shared by both checks, `scripts/componentParity.ts`,
    `scripts/check-component-parity.ts`, and `scripts/preflight.sh`.
  - Config: the root `components.json` moves to `apps/web/components.json`, `apps/mobile/components.json` is new, and
    `biome.json` fails an import from the `cn` package.
- **Dependencies:** `class-variance-authority`, `clsx`, and `tailwind-merge` move from `apps/web` to
  `packages/nightshift`. `apps/mobile` gains `@rn-primitives/slot`, `lucide-react-native`, and `react-native-svg`,
  which the icons and the coffee mug draw through, and the Storybook peers Expo pins for the SDK:
  `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `@gorhom/bottom-sheet`,
  `@react-native-async-storage/async-storage`, and the controls addon's `@react-native-community/datetimepicker` and
  `@react-native-community/slider`. `@storybook/react-native`, `storybook` at the web's version, and the on-device
  controls and actions addons are mobile development dependencies. The native modules need a rebuilt development
  client.
- **Behavior:** the one web class change is the shadow's new name, `shadow-raised`, which draws the same shadow on the
  web's buttons and avatars. The web's chat markdown gains the streamdown rules it lost in the workspace move. The
  mobile session screens take the shared Button's look: the web's heights, the medium radius, the contract's padding,
  and a pressed state, and show the web's logo.
- **Out of scope:** no other component becomes a contract, no raw button moves onto `Button`, `IconButton` and
  `CountBadge` stay as they are, and the mobile stories stay out of `/nightshift`, since the production image leaves
  `apps/mobile` out.
