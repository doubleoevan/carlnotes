# mobile-app Specification

## Purpose
TBD - created by archiving change add-mobile-app. Update Purpose after archive.
## Requirements
### Requirement: The mobile app is an Expo development build on the current SDK

`apps/mobile` SHALL be an Expo app with Expo Router, built as a development build and never run in Expo Go, on the
current Expo SDK release with the New Architecture, serving iOS and Android from one codebase. The repo's one
TypeScript SHALL type-check it through `tsc -b`: the app SHALL opt out of Expo's own TypeScript version with the
`expo.install.exclude` field in its `package.json`. The root script `dev:mobile` SHALL start the Expo dev server under
Doppler's dev config. `apps/mobile` SHALL take `expo-mcp` as a dev dependency installed through `expo install`, so a
coding agent with the Expo MCP connected can take screenshots, tap, and open React Native DevTools against the dev
server.

#### Scenario: The check gate covers the mobile app

- **WHEN** `bun run check` runs after the mobile workspace lands
- **THEN** Biome lints `apps/mobile`, `tsc -b` type-checks it on the repo's TypeScript version, and the suite passes

#### Scenario: The dev server starts under Doppler

- **WHEN** a developer runs `bun run dev:mobile`
- **THEN** the Expo dev server starts with the dev config's values, and a development build on a simulator, an
  emulator, or a phone connects to it

### Requirement: The app renders the Nightshift theme through Uniwind

`apps/mobile/global.css` SHALL import `tailwindcss`, `uniwind`, and the Nightshift Uniwind theme, and the Metro config
SHALL wrap everything in `withUniwindConfig` as its outermost wrapper. The app SHALL follow the system appearance
between Latte and Dark roast.

#### Scenario: The system appearance switches the palette

- **WHEN** the device switches from light to dark appearance while the app is open
- **THEN** every utility re-resolves from Latte to Dark roast without a reload

#### Scenario: A utility reads the Nightshift token

- **WHEN** a mobile component renders `text-muted-foreground`
- **THEN** the text draws in the `mutedForeground` value of the current mode

### Requirement: The fonts load before the first screen shows

Karla and Architects Daughter SHALL load with `expo-font` before the splash screen hides. The sans and display families
SHALL map onto the type roles in `typography.ts`, so a role reads the same on both platforms, and the medium, semibold,
and bold weights the roles use SHALL resolve to the right face on iOS and Android.

#### Scenario: The splash screen waits for the fonts

- **WHEN** the app launches
- **THEN** the splash screen hides only after the fonts load or fail, and no screen flashes a fallback font

#### Scenario: A type role renders its weight

- **WHEN** a mobile component renders the `label` role
- **THEN** the text draws in Karla at the semibold face on iOS and on Android

### Requirement: Every mobile screen meets the accessibility bar

`apps/mobile/AGENTS.md` SHALL write the accessibility bar every later mobile change follows: every pressable control
has an accessibility label and role, text scales with the system's text size on iOS and Android without clipping, touch
targets are at least 44 points, and colors come from Nightshift, whose contrast test already holds text to WCAG AA. The
one screen SHALL follow these rules.

#### Scenario: The one screen passes the bar

- **WHEN** the one screen renders with the system text size raised
- **THEN** every control reads a label and a role to the screen reader, no text clips, and every touch target measures
  at least 44 points

### Requirement: The api client is configured once at startup

The app SHALL configure `@carlnotes/client` once at startup with `configureApiClient`: the api base url, a `showError`
that shows the message natively, `headers` that return the session cookie the Expo client stores, `credentials: "omit"`,
and an `onUnauthorized` that signs the app out of a revoked session. It SHALL configure the auth client once at startup
too, with `configureAuthClient`: the api base url and the Expo client plugin over `expo-secure-store`, with the gate
cookie's name among the cookie prefixes it stores. Both calls SHALL run in the root layout's module scope, before any
screen runs a hook, and `configureAuthClient` SHALL throw an error if the auth client was already used. In development
the url SHALL reach the api that `bun run dev:api` serves on the machine, from the iOS simulator, the Android emulator,
and a phone on the same network; in production it SHALL be `https://carlnotes.com`. Choosing the url SHALL be pure logic
a `bun test` covers. A TanStack Query client SHALL wrap the app.

#### Scenario: A development build reaches the machine's api

- **WHEN** a phone on the same network opens the app against the dev server
- **THEN** api requests reach the machine serving `bun run dev:api`, not localhost on the phone

#### Scenario: A production build reaches the production api

- **WHEN** a production build chooses its api base url
- **THEN** the url is `https://carlnotes.com`, and the unit test covers both choices

#### Scenario: The clients are configured before the first screen

- **WHEN** the app launches
- **THEN** the api client and the auth client are configured in the root layout before any screen's hook runs, and a
  configuration after the first use throws an error

### Requirement: One screen proves the stack end to end

The app SHALL ship the home screen at the root route, behind the sign-in guard: the CarlNotes name in the display font,
body text in Karla, the user's name and avatar from the session, a swatch row of the Nightshift surfaces and
accents in the current mode, one public read through `@carlnotes/client` with its loading and error states, and a link
to the settings screen.

#### Scenario: The public read renders

- **WHEN** the screen opens with the api reachable
- **THEN** a loading state shows, then the public read's result renders through the typed client

#### Scenario: The error state shows natively

- **WHEN** the screen opens with the api unreachable
- **THEN** the screen shows its error state instead of crashing or hanging on the loading state

#### Scenario: The user's name and avatar show

- **WHEN** a user opens the home screen
- **THEN** it shows their name and their avatar at the session's version, or their initials when they have no image

### Requirement: Errors and screen views report outside development

The app SHALL report errors through `@sentry/react-native` with its Expo config plugin, uploading source maps from EAS
builds, behind a root error boundary. The app SHALL record screen views from Expo Router through `posthog-react-native`
with the project key the web app already sends to. Neither SHALL report in development unless its key is set.

#### Scenario: A development build without keys reports nothing

- **WHEN** the app runs in development with no Sentry key and no PostHog key set
- **THEN** no event leaves the app

#### Scenario: A release build reports a crash with readable frames

- **WHEN** a release build built on EAS crashes
- **THEN** Sentry shows the error with source-mapped frames

### Requirement: Builds and values stay in Doppler and EAS

`app.config.ts` SHALL name the app CarlNotes, with the iOS bundle identifier and Android package `com.carlnotes.app`
and the URL scheme `carlnotes`, and SHALL link the app to the existing Expo project with owner `carlnotes`, slug
`carlnotes`, and `extra.eas.projectId` `7b874ce7-cb2a-4d50-a8d7-fb89e078b247`, written in the config so no `eas init`
is needed. The icon and splash SHALL come from the existing favicon art. `eas.json` SHALL have development, preview,
and production profiles — a development client for simulators and devices, an internal preview build, and the store
build — with EAS Update's runtime version policy set. Doppler SHALL stay the one home of every value, its dev config
for development and prd for production, and a script under `scripts/` SHALL sync the mobile values from Doppler into
EAS environments, so no value is typed into the EAS dashboard. The design SHALL name every value the app reads, mark
which ship in the bundle as public, and keep anything secret out of the bundle. The EAS commands SHALL get root scripts
in the same style as `dev:mobile`.

#### Scenario: The value sync fills an EAS environment

- **WHEN** the sync script runs for the production environment
- **THEN** the mobile values move from Doppler's prd config into the EAS production environment without anyone typing
  them into the dashboard

#### Scenario: A secret stays out of the bundle

- **WHEN** the exported JavaScript bundles are searched for the Sentry auth token
- **THEN** the token appears nowhere, because only public values ship in the bundle

### Requirement: Mobile tests cover pure logic only

`bun test` SHALL run no React Native component. A mobile test SHALL cover pure logic, such as choosing the api url.

#### Scenario: The suite stays free of React Native

- **WHEN** `bun test` runs after the mobile workspace lands
- **THEN** no test imports `react-native` or renders a native component, and the suite passes without a simulator

