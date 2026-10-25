## Context

The first Nightshift change, `start-the-nightshift-design-system`, put every token, the radius scale, the fonts, and the
type roles into `@carlnotes/nightshift`, wrote `tokens.css` for the web and `uniwind.css` for the Expo app, and built
the Storybook component browser at `/nightshift`. Its Inventory page names the Nightshift component each web pattern
would become. The Notion Mobile page then decided the component model: Nightshift owns each component's name, variants,
props, and base classes, and each app keeps its own implementation, rendered with Radix on the web and React Native
Reusables, the shadcn/ui components ported to React Native, on mobile, with a preflight check that every contract is
implemented.

Today the two apps share no component code:

- `apps/web/src/components/primitives/button.tsx` is shadcn's new-york Button: one `cva` function with six variants
  (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) and six sizes (`default`, `sm`, `lg`, `icon`,
  `icon-sm`, `icon-lg`). Its base mixes classes both platforms can draw with classes only a browser can: `inline-flex`,
  `focus-visible:` rings, `aria-invalid:`, `[&_svg]` selectors, and `has-[>svg]` padding. Nine files call its exported
  `buttonVariants({ variant, size, className })` to style a link as a button.
- `badge.tsx` is shadcn's Badge: three variants (`default`, `secondary`, `outline`) and `shadow-lift`, exported with
  `badgeVariants({ variant })`.
- `shadow-lift` is an `@utility` in `apps/web/src/globals.css`, the one elevation.
- `apps/mobile/src/components/session/SessionButton.tsx` is a hand-built `Pressable` with four variants of its own
  (`hero`, `primary`, `destructive`, `link`), used by the sign-in, sign-up, and settings screens.
- The package boundary check lets the web import Nightshift's TypeScript only from a test, a story, `.storybook/`, or
  `src/nightshift/`, so no palette module reaches the browser bundle. The mobile app imports Nightshift freely.
- The mobile app has no `@/` path alias, no `cn`, and no component browser. `bun test` renders no React Native
  component.

Reusables' Uniwind registry (`packages/registry/src/uniwind/` in `founded-labs/react-native-reusables`) writes Button as
`buttonVariants`, the classes on the `Pressable`, and `buttonTextVariants`, the classes that a `TextClassContext` gives
to the `Text` inside, since React Native text does not inherit color from its container. Its web-only classes sit behind
`Platform.select({ web })`, and its pressed states use `active:` and `group-active:`. Uniwind 1.13 applies `active:` on
a `Pressable`, but it reads no group variant: Tailwind compiles `group-active:` to an `:is()` selector, which Uniwind's
selector reader skips, and group variants are a Uniwind Pro feature. Its CLI, `@react-native-reusables/cli`, adds
components with `add <names> --styling-library uniwind`.

Storybook for React Native 10.7 runs on the device. Its Expo Router guide puts the UI at a route, `app/storybook.tsx`,
behind `Stack.Protected`, and its Metro wrapper, `withStorybook` from `@storybook/react-native/metro/withStorybook`,
replaces Storybook's modules with empty ones when `enabled` is false. It peers on `react-native-reanimated`,
`react-native-gesture-handler`, `react-native-svg`, `@gorhom/bottom-sheet`, and `react-native-safe-area-context`, and
keeps its state in AsyncStorage.

## Goals / Non-Goals

**Goals:**

- One module per component in `packages/nightshift/components/` holds what the web and mobile implementations must agree
  on.
- The web renders exactly the classes it renders today, for every variant and size, with `shadow-raised` in place of
  `shadow-lift`.
- The mobile app gets Button and Badge implementations built on the contracts, and its session screens use the new
  Button.
- A preflight check fails on a missing implementation or an orphaned one, an implementation with no contract that names
  its app, and a variant added or renamed in a contract fails `tsc -b` in both apps until both implementations match.
- Storybook for React Native shows the mobile implementations on the device, in development builds only.

**Non-Goals:**

- No other component becomes a contract. `IconButton`, `CountBadge`, and every other inventory row stay as they are.
- No raw `<button>` moves onto `Button`, and no web call site changes.
- No variant is renamed or removed. The unused secondary button and the default badge stay.
- The mobile stories do not join `/nightshift`. The production image leaves `apps/mobile` out.
- No React Native component renders under `bun test`.

## Decisions

### A contract is its box and text classes, the names, and the shared props

Each contract module exports, for Button:

- `buttonVariantNames` and `buttonSizeNames`, the names as `as const` tuples, and the `ButtonVariant` and `ButtonSize`
  unions over them.
- `buttonDefaults`, `{ variant: "default", size: "default" }`.
- `buttonBoxVariants`, the box classes, a `cva` function of the classes both platforms draw on the container, and
  `buttonTextVariants`, the text classes, a `cva` function of the classes both platforms draw on the label. Each
  function's variant map is written with `satisfies Record<ButtonVariant, string>`, so the names tuple and the classes
  cannot drift apart.
- `ButtonVariantProps`, the variant and size, and `ButtonSharedProps`, those plus `disabled` and `asChild`. Event props
  stay with each platform: the web implementation takes `onClick` from `React.ComponentProps<"button">`, and the mobile
  implementation takes `onPress` from `PressableProps`.
- `platforms`, the implementations the contract needs, `["web", "mobile"]` for both contracts here. A web-only contract
  writes `["web"]`. The `ComponentPlatform` type lives in `packages/nightshift/componentPlatforms.ts`, outside the
  contracts folder, so the parity check reads every file in the folder as a contract.

Badge has the same shape without a size: `badgeVariantNames`, `badgeDefaults`, `badgeBoxVariants`,
`badgeTextVariants`, `BadgeVariantProps`, and `BadgeSharedProps` with `asChild`.

Box classes and text classes, instead of one pair of strings per variant, because `cva` already resolves variants,
defaults, and compound variants, and each implementation calls both functions with the same props. The web applies both
to its one element, since browser text inherits. The mobile implementation gives the text classes to its
`TextClassContext`, as Reusables does. Alternatives: one shared class string per variant, rejected because the web
strings lean on hover and selectors native lacks, and one cross-platform component through react-native-web, which the
Mobile page rejected.

`class-variance-authority` joins `packages/nightshift`'s dependencies. It is a pure function with one dependency,
`clsx`, so the package stays universal, and the boundary check's closure walk proves no server package is reached.

### The contract holds the classes both platforms draw, and each implementation layers its own

The split for Button, read off today's primitive and Reusables' Uniwind Button:

| Part | Contract (both) | Web implementation only | Mobile implementation only |
| --- | --- | --- | --- |
| Box base | `shrink-0 items-center justify-center gap-2 rounded-md disabled:opacity-50` | `inline-flex whitespace-nowrap transition-all outline-none`, `disabled:pointer-events-none`, `aria-disabled:*`, `focus-visible:*`, `aria-invalid:*`, `[&_svg]:*` | `flex-row` |
| Text base | `text-sm font-medium` | | the Karla family through the mobile `Text` |
| `default` | box `bg-primary shadow-raised`, text `text-primary-foreground` | `hover:bg-primary/90` | `active:bg-primary/90` |
| `destructive` | box `bg-destructive dark:bg-destructive/40 shadow-raised`, text `text-white` | `hover:bg-destructive/90`, `focus-visible:ring-destructive/*` | `active:bg-destructive/90` |
| `outline` | box `border bg-background shadow-raised dark:bg-input/30 dark:border-input` | `hover:bg-accent hover:text-accent-foreground dark:hover:bg-input/50` | `border-border active:bg-accent dark:active:bg-input/50`, pressed text `text-accent-foreground` |
| `secondary` | box `bg-secondary shadow-raised`, text `text-secondary-foreground` | `hover:bg-secondary/80` | `active:bg-secondary/80` |
| `ghost` | nothing | `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50` | `active:bg-accent dark:active:bg-accent/50`, pressed text `text-accent-foreground` |
| `link` | text `text-link` | `hover:underline underline-offset-4` | pressed text `underline` |
| Sizes | `h-9 px-4 py-2`, `h-8 gap-1.5 px-3` (`sm`), `h-10 px-6` (`lg`), `size-9`, `size-8`, `size-10` | `has-[>svg]:px-*` on the three label sizes | `h-auto` with `min-h-9`, `min-h-8`, and `min-h-10` on the label sizes, and a hit slop to 44 points on every size |

Badge:

| Part | Contract (both) | Web implementation only | Mobile implementation only |
| --- | --- | --- | --- |
| Box base | `shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 shadow-raised` | `inline-flex w-fit whitespace-nowrap`, `[&>svg]:*` | `flex-row self-start` |
| Text base | `text-xs font-medium` | | the Karla family through the mobile `Text` |
| `default` | box `border-transparent bg-primary`, text `text-primary-foreground` | | |
| `secondary` | box `border-transparent bg-secondary`, text `text-secondary-foreground` | | |
| `outline` | text `text-foreground` | | `border-border` |

The classes with no native equivalent, and what the mobile implementation does instead:

- `shadow-lift` moves into Nightshift as `shadow-raised` (next decision), so both platforms draw the same raised
  shadow. React Native's `boxShadow` draws it on the New Architecture, and Uniwind compiles an `@utility` with a
  `box-shadow` into it.
- `inline-flex` and `w-fit`: React Native has no inline layout. The implementation uses `flex-row`, and the badge adds
  `self-start` so it hugs its label inside a column.
- `whitespace-nowrap`: no native class. A native label wraps instead of clipping, which the accessibility bar's text
  scaling needs, so the implementation leaves it out.
- `transition-all`: native has no CSS transition. A pressed state switches at once.
- `outline-none`, `focus-visible:*`, `aria-invalid:*`, `aria-disabled:*`: Uniwind skips aria selectors, and a touch
  screen draws no focus ring. The system draws focus for a keyboard or switch control. Nothing replaces them.
- `disabled:pointer-events-none`: a disabled `Pressable` takes no press. `disabled:opacity-50` stays in the contract,
  since Uniwind applies `disabled:` on a `Pressable`.
- `hover:*`: replaced by the matching `active:` class on the box. The label's pressed classes, the "pressed text" in
  the table, are added while the Button's own `onPressIn` and `onPressOut` say a finger is on it, since Uniwind reads
  no `group-active:` on native.
- `[&_svg]:*`, `[&>svg]:*`, `has-[>svg]:*`: native has no descendant selectors. The mobile `Icon`, Reusables' own,
  reads its color from the `TextClassContext` and sizes itself with its `className`, `size-4` by default. A button
  with an icon keeps its full side padding.
- `underline-offset-4`: no native equivalent. The underline sits where the platform draws it.
- `border` alone takes its color from the web's base layer, which sets `border-border` on every element. Native has no
  base layer, so the mobile implementation writes `border-border` itself.
- A fixed height would clip a label that the system text size grows, so the mobile implementation writes `h-auto` with
  the web's height as a minimum on the label sizes: `min-h-9`, `min-h-8`, and `min-h-10`. The square icon sizes keep
  their size. Every size draws at the web's height, 32 to 40 points, under the 44-point touch target, so the Button
  passes `hitSlop`, half the difference, on every side. The contract's `buttonHeightsRem` holds each size's height, and
  `button.test.ts` holds it to the box classes. Drawing every size at 44 points, the alternative, makes the mobile
  buttons visibly taller than the web's and than Apple's native button beside them.
- `text-sm font-medium` sets the size and the weight on native, but no family. The mobile `Text` sets the Karla family
  from `fontFamilies`, and the weight selects the face the root layout registered.

### The elevation joins the Nightshift source

`packages/nightshift/elevation.ts` holds the raised shadow's two shadows. `tokensCss.ts` and `uniwindCss.ts` each write
it as `@utility shadow-raised`, and the web's `@utility shadow-lift` leaves `apps/web/src/globals.css`. Tailwind v4
reads an `@utility` in an imported stylesheet, so the web's computed shadow is unchanged, which the tokens test and a
computed-style check prove. The Figma files gain it as a Design Tokens Community Group `shadow` token named `raised`.
The alternative, a second copy of the utility in `apps/mobile/global.css`, would drift.

The move renames the utility. No design system names a shadow "lift", Atlassian's tokens call this one
`elevation.shadow.raised`, and the source already described it as the shadow under every raised surface. Every web use,
the class fixture, and the user-avatars spec move to `shadow-raised` in one scripted sweep.

### The web implementations keep their exports and their class strings

`button.tsx` keeps exporting `Button` and `buttonVariants`, and `badge.tsx` keeps `Badge` and `badgeVariants`, with the
same call signatures, so no call site changes. `buttonVariants({ variant, size, className })` returns
`cn(buttonBoxVariants(...), buttonTextVariants(...), the web base, the web class for the variant, the web class for the
size, className)`. The web records are `satisfies Record<ButtonVariant, string>` and `Record<ButtonSize, string>`
objects, so a variant added or renamed in the contract fails `tsc -b` in the web implementation. The mobile
implementation's records are typed the same way.

The class order inside each string changes, and the order of classes in an attribute changes no style. The old
`buttonVariants` and `badgeVariants` were bare `cva` functions that returned their classes unmerged, so the `sm` size
returned both `gap-2` and `gap-1.5`, and `destructive` both focus ring colors, while `Button` and `Badge` merged them.
The new functions merge, as the components always did. Every call site that uses `sm` or `destructive` without a
component already wraps the call in `cn`, so no element's classes change. The test,
`apps/web/src/components/primitives/primitiveClasses.test.tsx`, enumerates every variant and size of both components,
with and without a `className`, and compares each result as a set of classes to
`primitiveClassesTestFixtures.ts`, recorded from the primitives on `main` before the change. A recorded function result
compares after the same `cn` merge. A set comparison still catches a class that tailwind-merge drops or keeps
differently, since the sets then differ. An intended style change later rewrites the fixture in the same change.

Tailwind's automatic source detection reads `apps/web` alone, so `globals.css` adds
`@source "../../../packages/nightshift/components"`, and `apps/mobile/global.css` adds the same for Uniwind. Without
it, a class written only in a contract would emit no CSS.

Moving the classes into the contracts leaves the built CSS with the same rules at the same byte size. The review found
that the line beside the new source, `@source "../../node_modules/streamdown/dist/*.js"`, has pointed at a folder that
does not exist since the workspace move, so Tailwind read none of streamdown's classes and the chat's markdown drew
without their rules. The path becomes `../node_modules/streamdown/dist/*.js`, and the built CSS gains 118 rules for
streamdown's classes and loses none. The client's JavaScript grows by 2,132 bytes raw and 927 bytes gzipped across its
124 chunks, from the classes split into box and text, the per-variant records, and `cn`'s module moving between chunks.
The names tuples and `platforms` are tree-shaken, since only stories and tests read them.

### The boundary check lets any web file import a contract, and the parity check holds it to the implementation

The web's Nightshift rule lets any file import `@carlnotes/nightshift/classNames`, `coffeeMug`, `oauthProviderIcons`,
and the contracts under `@carlnotes/nightshift/components/`. None of them imports a palette module, so no color value
reaches the browser bundle. Where a contract may come from is the parity check's rule alone: an implementation, a story,
or a test, so a call site reaches the box and text classes through the implementation and a story's controls read the
contract's names. Every other Nightshift module still reaches the web only from a test, a story, or the component
browser.

### `cn` moves to Nightshift

The web's `cn`, clsx inside a tailwind-merge taught that `shadow-raised` is a shadow, moves to
`packages/nightshift/classNames.ts`, and the mobile implementations import the same function, instead of a second copy
in `apps/mobile`. It lives in Nightshift instead of `packages/core` because it has to know Nightshift's own utilities,
and `packages/core` does not import Nightshift. `packages/nightshift` declares `clsx` and `tailwind-merge`, both pure.
The boundary check lets any web file import `@carlnotes/nightshift/classNames`, which imports no palette module. The
web's 153 importers of `cn` from `@/lib/utils`, the two rebuilt implementations among them, move to the new path in one
scripted sweep, with the two files in `lib/` that imported it as `./utils`, and `cn` and its tests leave
`apps/web/src/lib/`.

### Each app keeps its own components.json, and the Reusables CLI writes Nightshift's `cn`

The shadcn CLI reads `components.json` from its working folder only, so the root file moves to
`apps/web/components.json`, with the stylesheet at `src/globals.css`. Both apps' files point the utils alias at
`@carlnotes/nightshift/classNames`. The CLI resolves an alias only through an exact package export, and it reads the
wildcard `./*` as no match, so `packages/nightshift/package.json` exports `./classNames` by name beside the wildcard.
With that, the Reusables CLI writes `import { cn } from '@carlnotes/nightshift/classNames'` into an added mobile
component. shadcn's own registry components import `cn` from the `cn` package and add it as a dependency, and no alias
rewrites that import, so Biome's `noRestrictedImports` fails any import from `cn`, and `apps/web/AGENTS.md` says to move
it after an `add`. A tsconfig `paths` entry would also resolve the alias, but it changes how `tsc` resolves the package
in two apps.

### The mobile implementations come from the Reusables CLI and are rebuilt on the contracts

`apps/mobile/components.json` points the CLI's ui alias at `@/components/primitives` and its utils alias at
`@carlnotes/nightshift/classNames`, and `apps/mobile/tsconfig.json` gains the `@/*` to `./src/*` path the web uses,
which Expo's Metro reads. Then:

```bash
bunx @react-native-reusables/cli@0.7.1 add button badge text icon --styling-library uniwind
```

writes Reusables' Uniwind `button.tsx`, `badge.tsx`, `text.tsx`, and `icon.tsx` into
`apps/mobile/src/components/primitives/`. The two implementations are then rebuilt on the contracts: each puts the
contract's box classes with its mobile record on the `Pressable` or `View`, gives the contract's text classes with its
mobile record to the `TextClassContext`, and drops Reusables' own variants and `Platform.select({ web })` classes, since
the app does not build for the web. `text.tsx` and `icon.tsx` stay mobile-only primitives with no contract, as the web's
`dialog.tsx` has none. `text.tsx` drops Reusables' typography variants, which the app never uses, and keeps the
`TextClassContext` and the Karla family. A primitive's label takes its type from the contract's text classes,
`text-sm font-medium` on a Button and `text-xs font-medium` on a Badge, which the web's labels use too. Other mobile
text keeps going through the type roles. All four import Nightshift's `cn`, the import the utils alias has the CLI
write. `components.json` stays, so a later `add` lands at the same path. The existing `../../typeRoleStyles` imports in
`src/components/session/` move to the alias.

The mobile Button types its props as `PressableProps & ButtonSharedProps` and makes `accessibilityLabel` required, so
the accessibility bar's label is a type error to forget. It renders `accessibilityRole="button"`, and `asChild` renders
through `@rn-primitives/slot`, as Reusables' Badge does.

### The session screens use the new Button

`SessionButton` is deleted. Each `SessionButton` becomes
`<Button accessibilityLabel={label} ...><Text>{label}</Text></Button>`:

- The oauth buttons pass `OAUTH_BUTTON_CLASS`, the hero fill and its pressed fill, to the button and
  `OAUTH_BUTTON_LABEL_CLASS`, `text-hero-foreground`, to the label, as the web's `SessionLayout` passes its
  `OAUTH_BUTTON_CLASS` to the web `Button`.
- Log in, Sign up, and Sign out are the `default` variant. Close account is `destructive`.
- Continue with email and Forgot password are the `link` variant with `text-muted-foreground underline` on the label,
  the color the web's matching links use.

The buttons take the contract's medium radius, 8 points instead of `SessionButton`'s 10, which also matches the
native Apple button's `cornerRadius`, and the pressed state.

Apple's native button on iOS draws at the `default` Button's height, 36 points, and grows with the system text size but
never below that height, since Apple's guidelines ask that it be no smaller than the other sign-in buttons. The native
view takes touches only inside its own bounds, so it sits inside a `Pressable` with a hit slop to 44 points, the
accessibility label, and the button role, and the native view itself takes no touches.

### The session screens show the web's logo, drawn from Nightshift

The mobile session screens showed the name alone, while the web's login page shows the logo, the steaming mug beside
the name, and a provider logo on each oauth button. Nightshift now holds what both apps draw, and each app keeps its
own component, as a contract's implementations do:

- `packages/nightshift/coffeeMug.ts` holds the mug's 32-unit view box, the cup and handle paths, the stroke widths and
  opacities, the three steam wisps with their delays, `toSteamWispPath`, and the steam's motion: the period, the peak,
  the rise, the widening, and the resting opacity. The steam holds still below `MD_BREAKPOINT_REM`, Tailwind's 48rem
  `md` breakpoint, which `packages/nightshift/breakpoints.ts` holds for code that reads a screen width outside a class.
  The web's `CoffeeMug.tsx` draws its svg from these, and `coffeeMugSteam.test.ts` holds `animations.css`'s keyframes
  and its phone and reduced-motion still rules to the motion, since CSS cannot import it.
- The web holds the logo's steam still on a phone-width screen and under reduced motion, and only a loading mug keeps
  moving there. The mobile `CoffeeMug.tsx` matches that: the steam holds still below the `md` breakpoint, as on a phone,
  and under reduced motion, and rises on a wider screen such as an iPad. It stacks one full-size svg per wisp under
  the cup, so each wisp's animated style can move it: the opacity, the rise in view box units times the points per
  view box unit, and the widening from the bottom center, the web's transform origin. React Native's `Animated` runs
  each loop on the native driver, so a frame needs no layout commit and the app starts no second JavaScript runtime,
  as Reanimated would. `useIsReduceMotionEnabled` follows the system setting as it changes. The mug is memoized, so a
  keystroke on the sign-up form does not redraw it, and the footer link between sign-in and sign-up replaces the
  screen, so switching never stacks screens.
- `packages/nightshift/oauthProviderIcons.ts` holds the Google logo's four colored paths and the Apple logo's path,
  from simple-icons, which the web's `BrandIcon` read before. The web's `OAuthProviderIcons.tsx` and `BrandIcon.tsx`
  and the mobile `OAuthProviderIcons.tsx` draw from it.
- A `logo` type role, `font-display text-xl`, names the name's type on both platforms. The web's `LOGO_CLASS` writes
  it, and a test holds the class to the role.
- An svg path in `currentColor` on native needs a color, so `src/components/common/ClassNameSvg.tsx` wraps `Svg` with
  Uniwind's `withUniwind`, mapping the className's text color to the svg's `color` prop. The mug and the Apple logo
  take `text-primary` and `text-hero-foreground` the way the web's do.

The web's mug and icons are sized in rem and grow with the root font size. Native text grows up to about three times
at the largest accessibility size, past the 200 percent the web is built for, and a mug and name at that size do not
fit a phone's width. `src/hooks/useFontScaledSize.ts` grows a size with the system text size up to double, and the
name's `maxFontSizeMultiplier` stops at the same limit, so the logo keeps the web's proportions and fits the screen at
every size. An icon inside a Button sits beside a label that now shrinks to wrap, centered, so the icon stays inside
the button at the largest sizes, and the footer link wraps under its prompt.

### Storybook for React Native runs at a development route

- `apps/mobile/.rnstorybook/main.ts` finds `../src/components/**/*.stories.tsx`, with the on-device controls and
  actions addons and on-device backgrounds turned on. `preview.tsx` imports `global.css`, and a decorator reads the
  backgrounds global, `light` or `dark`, calls `Uniwind.setTheme` with it, and renders the story on `bg-background`.
  The backgrounds' swatches are the Latte and Dark roast `background` values from `@carlnotes/nightshift/colors`.
- `apps/mobile/app/storybook.tsx` renders `view.getStorybookUI` from the generated
  `.rnstorybook/storybook.requires.ts`, with AsyncStorage as its storage. `_layout.tsx` adds it in a
  `Stack.Protected guard={__DEV__}` beside the session guards, so only a development build shows the route. The route
  file still ships in a release bundle. Opened there, Expo Router's guard sends it to the first screen the session's
  guards allow, and the emptied Storybook modules never render.
- `metro.config.js` wraps Sentry's config in `withStorybook`, inside `withUniwindConfig`, which stays outermost, with
  `enabled: process.env.NODE_ENV !== "production"`. Expo's CLI sets `NODE_ENV` to `production` before it loads the
  Metro config for `expo export`, an EAS release build, and `eas update`, so those bundles get Storybook's empty
  modules, and every file under `.rnstorybook/` with them. The CI export job then fails if either platform's bundle
  contains `SET_CURRENT_STORY`, a Storybook event name that survives minification: a development export holds it 14
  times, and the production export none. Module paths such as `@storybook` do not survive a production bundle, so they
  cannot be the marker.
- The route builds the component browser inside the screen's first render, never at module load, since its import is
  an empty module outside development.
- The route is reached at `carlnotes:///storybook` in a development build. The Metro config turns Storybook's
  telemetry off however Metro starts, as the web's scripts do for theirs. Leaving the route returns the theme the story
  toggle set to the system's.
- `storybook.requires.ts` is generated by `withStorybook` on each Metro start, committed so `tsc -b` resolves the
  route's import, and added to the root "Never read" list.
- The route uses Storybook's own Metro-specific wrapper, not entry-point swapping, so the app and its stories run from
  one dev server. Storybook's docs prefer swapping for the smaller setup, but it replaces the whole app, which leaves
  the session screens out of reach while a story is open.

The Storybook peers are installed with `expo install`, so each is the version Expo pins for SDK 58:
`react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-svg`,
`@gorhom/bottom-sheet`, and `@react-native-async-storage/async-storage`, and the controls addon's
`@react-native-community/datetimepicker` and `@react-native-community/slider`. Backgrounds are Storybook 10's built-in
feature flag, so no backgrounds addon is installed. `@storybook/react-native` and `storybook` are development
dependencies, `storybook` pinned at the web's 10.6.2 so the workspace installs one copy.
`lucide-react-native` is a dependency of the mobile `icon.tsx`. Each install respects `bunfig.toml`'s three-day
release age, so a version newer than that is pinned back to the newest one that clears it.

### The stories match the web's

`button.stories.tsx` and `badge.stories.tsx` sit beside the mobile implementations with the web stories' titles, story
names, args, and controls: Button's Default, Destructive, Outline, Secondary, Ghost, Link, Sizes, IconSizes, WithIcon,
and Disabled, and Badge's Secondary, Default, and Outline. Each story's `variant` and `size` options read the contract's
names tuples, on the web and on mobile, so a renamed variant fails both apps' stories as well. The web's `onClick: fn()`
is the mobile's `onPress` through the actions addon. The mobile preview reads the web's `surface: "card"` parameter and
puts those stories on the card fill. The mobile meta adds one arg, a default `accessibilityLabel`, since the mobile
Button requires one, and each story reads its label from its own text.

### The parity check reads the contracts folder and both apps' primitives

`scripts/componentParity.ts` holds the rules as a pure function over the contracts, each with its name and platforms,
and every TypeScript file in `apps/web` and `apps/mobile` outside `node_modules`, `dist`, `.tsbuild`, `.expo`, and the
declaration files, like the boundary check, through the shared `scripts/sourceFiles.ts`.
`scripts/check-component-parity.ts` reads the folder, imports each contract module for its `platforms`, reads the
source files, and prints each violation. `preflight.sh` runs it after the boundary check. The rules:

- Every contract `packages/nightshift/components/<name>.ts` that names a platform has
  `apps/<platform app>/src/components/primitives/<name>.tsx`, and that implementation imports a value, not types alone,
  from `@carlnotes/nightshift/components/<name>`. A violation names the contract and the path it expected.
- Each implementation has `<name>.stories.tsx` beside it.
- An implementation at the mirrored path of a platform the contract does not name, or an implementation whose contract
  file does not exist, is an orphan. A violation names the implementation and the contract path it expected.
- No other file in either app imports a contract, except a story and a test. A call site imports its own app's
  implementation, which the violation names, or learns that the contract names no implementation in its app.
- A contract module that does not export `platforms` fails, naming the file.

`scripts/componentParity.test.ts` covers each rule with fixtures: a missing web implementation, a missing mobile
implementation, an implementation that imports no value from its contract, its types alone included, an implementation
without a story, a web-only contract with a mobile implementation, an implementation with no contract, a contract
without `platforms`, an app file importing a contract, and a fixture with both implementations passing. Preflight's run
of the check proves the repo's own tree.

### The component browser rule extends to the mobile app

The boundary check grew past 400 lines with this change, so it splits by concern: `scripts/workspaces.ts` holds the
workspace map both rule modules read, `scripts/importBoundaries.ts` the import rules, and `scripts/packageBoundaries.ts`
the whole check, the package.json rules, and the runtime closure walk, each with its test.

`importBoundaries.ts` gains `MOBILE_COMPONENT_BROWSER_PATHS`: `apps/mobile/.rnstorybook` and
`apps/mobile/app/storybook.tsx`. A mobile file other than a `*.stories.tsx` or one of those that imports a `.stories`
path, a `storybook` or `@storybook/*` module, or a `.rnstorybook` path fails. `apps/mobile/tsconfig.json` includes
`.rnstorybook/**`, so `tsc -b` checks the config and the generated file.

## Risks / Trade-offs

- [Storybook's native peers link into every binary] → Metro empties Storybook's JavaScript outside development, and CI
  proves it, but `react-native-reanimated`, `react-native-gesture-handler`, AsyncStorage, the date picker, and the
  slider still autolink into the preview and production binaries, inert without the JavaScript. `react-native-svg` is
  the app's own now, through `lucide-react-native`. Unlinking them per profile through
  `react-native.config.js` would give a production build a different native fingerprint from the one `eas update`
  computes, and the fingerprint runtime policy would then send that build no update. The binary grows by those
  modules. `react-native-svg` and Reanimated are on the Mobile page's own list.
- [A class set differs from today's] → the fixture test fails naming the variant, the size, and the classes added and
  removed. The Storybook build and a click through the home page, a topic page, and account settings in light and dark
  confirm the pixels.
- [Uniwind skips a class silently] → the design's tables list every class each implementation keeps, and the mobile
  Storybook shows every variant and size in light, dark, pressed, and disabled on the iOS simulator and an Android
  emulator.
- [`boxShadow` draws nothing on an old Android] → React Native draws `boxShadow` on Android 9 and later. Earlier
  versions show the button without its raised shadow, still on its fill.
- [The `@source` path breaks if the package moves] → a class written only in a contract emits no CSS, and the fixture
  test cannot see it. The task greps the built CSS for every contract class.
- [The Reusables CLI writes a layout the app does not use] → its output is a starting point that the implementations
  replace, and the diff holds only the rebuilt files.
- [The `@/` alias reaches Metro] → Expo's Metro reads tsconfig `paths` by default. The CI export proves it.
- [The 155-file `cn` sweep] → it changes only an import line in each file, by script, and `tsc -b` and the tests
  prove it.

## Migration Plan

No data moves. The web deploy renames `shadow-lift` to `shadow-raised` and changes no pixel, and the api's own pages
are unchanged. The mobile change needs a rebuilt development client for the Storybook peers before the stories open.
Rollback is a revert.

## Open Questions

None. Renaming or removing a variant, adding a hero variant for the oauth buttons, and composing the mobile stories
into `/nightshift` are later decisions.
