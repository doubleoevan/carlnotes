# apps/mobile

The Expo app: CarlNotes for iOS and Android from one codebase, on a development build, never Expo Go. It depends on the
universal packages alone — `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/core`, `@carlnotes/nightshift` —
and the package boundary check fails anything else, a type-only import of `@carlnotes/api` included.

## Layout

- `app/` — the Expo Router routes. `_layout.tsx` configures the api client with the session cookie on every request,
  loads the fonts and the session behind the splash screen, stacks the providers (PostHog, the TanStack Query client,
  and Sentry's wrap), and guards the screens with `Stack.Protected`: a user sees `index.tsx`, the home
  screen, and `settings.tsx`, with sign out and close account; a visitor sees `sign-in.tsx`, the three
  sign-in methods and the email form, and `sign-up.tsx`, the email form behind the app signup gate. `storybook.tsx` is
  the component browser, which the layout shows only in a development build. A route's component is a screen
  (`HomeScreen`), the native word for what the web calls a page.
- `src/` — the app's own modules. `authClient.ts` configures the shared auth client at module load with the api base
  url and Better Auth's Expo plugin over `expo-secure-store`, and exports `mobileAuthClient`, the app's handle with
  `getCookie`, and `apiBaseUrl`. `apiRequestSettings.ts` is what the api client sends on every request and what a 401
  does. `appleSignIn.ts` is the native Sign in with Apple sheet. `appSignupGate.ts` attests the install through
  `@expo/app-integrity` and passes the gate, over `appSignupProofPlatform.ts`, which says which proof a build sends.
  `apiBaseUrl.ts` chooses the api url, and `typeRoleStyles.ts` maps the Nightshift type roles to native text styles.
  `hooks/useFontScaledSize.ts` grows a size with the system text size, up to double, and
  `hooks/useIsReduceMotionEnabled.ts` follows the system's reduce motion setting. The pure modules have `bun test`
  coverage beside them. No test renders a React Native component or imports a native module.
- `src/components/primitives/` — the app's implementation of each Nightshift component contract, at the path and file
  name of the web's implementation, added from React Native Reusables' Uniwind registry with its CLI and rebuilt on the
  contract. `button.tsx` and `badge.tsx` give the contract's box classes to the `Pressable` or `View` and its text
  classes to the label through `TextClassContext`, and add only the mobile classes: a pressed state for each Button
  variant in place of the web's hover, `flex-row` in place of `inline-flex`, the web's height as a minimum that grows
  with the label, a label that wraps beside an icon, and the border color the web's base layer gives. The Button
  draws each size at the web's height and reaches the 44-point touch target through a hit slop. `toButtonHeight`
  returns a size's height in points from `buttonHeightsRem`, and `toTouchTargetHitSlop` returns the hit slop that
  grows any drawn height to 44 points, for the Button and for a control drawn to match it. Uniwind
  reads `active:` on a `Pressable` but no `group-active:`, so the Button tracks its own press for its label's pressed
  classes. The mobile Button requires an `accessibilityLabel`. `text.tsx` is the label inside them, in the Karla
  family, and `icon.tsx` a Lucide icon whose className sets its size and color. Every primitive has a story beside
  it, and each implementation's story has the web story's names, args, and controls. `components.json` points the
  Reusables CLI at this folder and its `cn` at `@carlnotes/nightshift/classNames`:
  `bunx @react-native-reusables/cli@0.7.1 add <name> --styling-library uniwind --cwd apps/mobile`, at the version that
  added the primitives here.
- `src/components/<area>/` — the app's own components, one PascalCase file per component, at the web's path and file
  name where the web has the same component. `branding/CoffeeMug.tsx` is the web's steaming mug, drawn from
  `@carlnotes/nightshift/coffeeMug` with the steam on React Native's `Animated` and its native driver. As on the web,
  the steam holds still below Nightshift's `md` breakpoint and under reduced motion, and rises on a wider screen.
  `common/` holds the components shared across areas: `ClassNameSvg.tsx` is an svg whose className sets the
  `currentColor` its paths draw in. `session/` holds what the sign-in, sign-up, and settings screens share:
  `SessionScreen.tsx` (the frame with the logo, the mug beside the name in the `logo` type role), `SessionTextInput.tsx`
  (the labeled field and the email and password fields over it), `SessionLink.tsx` (the text link to a route, the one
  way a screen links, and the footer line to the other form, which replaces the screen), `SessionErrorText.tsx`, and
  `OAuthProviderIcons.tsx` (the Google and Apple icons from `@carlnotes/nightshift/oauthProviderIcons`). Their buttons
  are the primitives' `Button`. A route imports `src/` through the `@/` alias, and so does a module whose relative
  import would climb two folders, as in `apps/web`.
- `global.css` — the stylesheet: tailwind, uniwind, and `@carlnotes/nightshift/uniwind.css`, the theme and the
  `shadow-raised` utility Nightshift writes, with the component contracts read as a Tailwind source. Change a token in
  `packages/nightshift/`, never here.
- `metro.config.js` — Sentry's base config inside Storybook's `withStorybook`, inside `withUniwindConfig`, which must
  stay the outermost wrapper. Storybook is on outside production. In an export, a release build, or an update,
  `withStorybook` empties every Storybook module and every file under `.rnstorybook/`, and the CI export job fails if
  a bundle holds Storybook's `SET_CURRENT_STORY` or either platform's bundle is missing. `metro.config.js` also turns
  Storybook's telemetry off however Metro starts. Expo configures Metro for the monorepo and Bun's isolated install on
  its own, so add no watchFolders and no resolver aliases.
- `.rnstorybook/` — Storybook for React Native: `main.ts` finds the stories under `src/components/`, with the
  on-device controls and actions and the backgrounds feature, and `preview.tsx` loads the stylesheet, switches the
  Uniwind theme with the light and dark toggle, and puts a `surface: "card"` story on the card fill.
  `storybook.requires.ts` is the stories index Storybook's Metro wrapper writes on each start, committed so `tsc -b`
  resolves the route. Never edit it. Leaving the route sets the theme back to the system's.
- `uniwind-types.d.ts` — generated by Uniwind from the theme, committed like the web app's route tree. Regenerate with
  the dev server, never edit it.
- `app.config.ts` — the identity, the scheme from `@carlnotes/contracts/mobileApp`, the EAS project link, Sign in
  with Apple, the App Attest production entitlement, and the Sentry, splash screen, Apple sign-in, secure store, and
  web browser plugins. `eas.json` — the build profiles, each pinned to Bun 1.4.3 and an EAS environment. EAS is Expo
  Application Services, the vendor's name for its cloud build and update services, so identifiers and files keep its
  word. A change that adds a native module, as the sign-in change did, needs a rebuilt development client.

## Commands

- `bun run dev:mobile` — the Expo dev server under Doppler's dev config, with the expo-mcp server on, from the repo
  root. In a development build connected to it, `carlnotes:///storybook` opens the component browser.
- `bun run mobile:build -- --profile development-simulator` — an EAS cloud build; profiles: development,
  development-simulator, preview, production.
- `bun run mobile:update` — an EAS Update on the fingerprint runtime policy.
- `bun run mobile:env:sync` — moves the mobile values from Doppler into the EAS environments. Never type a value into
  the EAS dashboard.
- CI exports both platforms' bundles (`expo export`) to prove Metro resolves the isolated install; preflight does not,
  because the bundle takes minutes.

## The api in development

`apiBaseUrl.ts` points the client at port 3000 on the host the device reached the dev server on, so the iOS simulator,
the Android emulator, and a phone on the same network all reach `bun run dev:api` with no setting. The one gap is a
USB-connected Android device in localhost mode, which needs `adb reverse tcp:3000 tcp:3000`.

## Accessibility bar

Every mobile change holds to the bar the web's Storybook checks set:

- Every pressable control has an `accessibilityLabel` and an `accessibilityRole`. The primitives' `Button` gives the
  role, and a Button without the label fails to type-check.
- Text scales with the system's text size on iOS and Android without clipping. Leave `allowFontScaling` on, and give
  a box around text a minimum height, never a fixed one, as the primitives' `Button` does. The logo and the oauth
  provider icons grow with the text up to double, the 200 percent the web is built for, so they still fit the screen
  at the largest sizes. The mug and the icons size through `useFontScaledSize`, and the name through
  `maxFontSizeMultiplier`.
- Touch targets are at least 44 points. A control drawn smaller, to match the web, reaches 44 through its hit slop,
  as the primitives' `Button` does.
- Colors come from Nightshift through Uniwind utilities (`bg-primary`, `text-muted-foreground`), whose contrast test
  already holds text to WCAG AA. No literal color values.
- Type goes through the roles in `src/typeRoleStyles.ts`, so a role reads the same on both platforms. A primitive's
  label takes its type from its contract's text classes instead, as the web's implementation does.

## Sign-in

The session is Better Auth's, kept by the Expo client in secure storage and sent as the `Cookie` header on every
request, the api client's through `apiRequestSettings.ts` and the auth client's own. Apple signs in through the native
sheet on iOS and the system browser on Android, Google through the system browser on both, and email and password
natively. On iOS the Apple button is Apple's native button at the other sign-in buttons' height, never shorter, inside
a `Pressable` whose hit slop gives it the 44-point touch target, since the native view takes touches only inside its
own bounds. A browser sign-in returns on `carlnotes://`, which the api trusts. Email sign-up passes the app signup gate
in place of the web's Turnstile: a release build attests the install with App Attest or Play Integrity against a
one-time challenge, and a development build sends the development proof, which only the dev api accepts. A release
build that cannot attest is sent to the web's sign-up. A 401 from any request signs a revoked session out once, and the
guard shows the sign-in screen.

## Values

The app reads `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, and `EXPO_PUBLIC_PLAY_CLOUD_PROJECT_NUMBER`, the
Google Cloud project number Play Integrity is prepared with, inlined by Metro, and an EAS build reads
`SENTRY_AUTH_TOKEN` to upload source maps. All four live in Doppler (dev and prd) and reach EAS through
`mobile:env:sync`. A reporter without its key stays off, so a build without keys sends nothing, and an Android
release build without the project number cannot attest and sends sign-ups to the web.
