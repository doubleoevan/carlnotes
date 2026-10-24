# Add the mobile app

## Why

CarlNotes has no native app, and the Notion Mobile page already settled the stack: Expo on a development build, Expo
Router, Uniwind, EAS Build and EAS Update, TanStack Query over `@carlnotes/client`, PostHog and Sentry, Doppler as the
one home of every value. Every later mobile change — sign-in, the feed, the reader, tasting notes, chat, the podcast
player — needs the workspace, the toolchain, the theme, and the shared packages already wired in and proven, so each of
those changes starts from screens instead of setup.

## What Changes

- `apps/mobile` joins the workspaces as `@carlnotes/mobile`, the fifth app: an Expo app with Expo Router on the current
  SDK with the New Architecture on, built as a development build, never Expo Go.
- The app depends only on the universal four — `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/core`, and
  `@carlnotes/nightshift` — resolved by package name through Bun's isolated install, with no tsconfig paths and no
  Metro resolver aliases. `scripts/packageBoundaries.ts` and its test gain the rule that fails anything outside the
  four, a type-only import of `@carlnotes/api` included.
- `@carlnotes/core` moves `react` from dependencies to peer dependencies, so the mobile bundle and the web build each
  hold exactly one React even when Expo pins a different version than the web app's.
- Nightshift writes a Uniwind theme as one more written file beside `tokens.css` and the Figma files: both modes'
  resolved values, every shadcn semantic name and CarlNotes extra, and the radius scale, held to the source by
  `tokens.test.ts`.
- Karla and Architects Daughter load through `expo-font` before the splash screen hides, mapped onto the type roles in
  `typography.ts`.
- `@carlnotes/client` is configured once at startup with the api base url per environment and a native error display,
  and a TanStack Query client wraps the app.
- One screen at the root route proves the stack end to end: the CarlNotes name in the display font, body text in Karla,
  a swatch row of the Nightshift surfaces and accents in the current mode, and one public read through
  `@carlnotes/client` with its loading and error states.
- Sentry reports errors and uploads source maps from EAS builds behind a root error boundary; PostHog records screen
  views from Expo Router; neither reports in development unless its key is set.
- `app.config.ts` and `eas.json` link the app to the existing Expo project with development, preview, and production
  profiles; a script syncs the mobile values from Doppler into EAS environments; root scripts start the dev server and
  run the EAS commands.
- The Dockerfile keeps `apps/mobile` and every React Native dependency out of both stages while the frozen install
  still passes; CI proves Metro bundles through the isolated install by exporting the iOS and Android JavaScript
  bundles on Linux.
- `apps/mobile/AGENTS.md` sets the accessibility bar every later mobile change follows; the root module map, the
  routing table, and the README gain the mobile rows.

Out of scope, each its own later change: sign-in (with cookie handling and secure storage), the feed, the reader,
tasting notes, chat, the podcast player, and the release work including final icon and splash art.

## Capabilities

### New Capabilities

- `mobile-app`: the Expo app — the workspace and toolchain, the theme and fonts on the app side, the accessibility
  bar, the api client and TanStack Query wiring, the one screen, monitoring, and the build profiles and
  value sync.

### Modified Capabilities

- `workspace-structure`: a fifth app joins the workspaces; the boundary check gains the rule that `apps/mobile`
  declares and imports only the universal four; `@carlnotes/core` takes `react` as a peer dependency; the image keeps
  the mobile workspace and every React Native dependency out of both stages; CI proves Metro bundles through the
  isolated install.
- `design-system`: Nightshift writes a Uniwind theme as one more written file from the same TypeScript source,
  committed and held to the source by the tokens test.

## Impact

- New workspace: `apps/mobile/` (app code, `app.config.ts`, `eas.json`, Metro config, `global.css`, `AGENTS.md`).
- Changed packages: `packages/nightshift/` (the Uniwind theme writer and written file), `packages/core/package.json`
  (react becomes a peer dependency).
- Changed tooling: `scripts/packageBoundaries.ts` and `scripts/packageBoundaries.test.ts`, root `package.json` scripts,
  root `tsconfig.json` references, `Dockerfile`, `.dockerignore`, CI.
- New dependencies, in `apps/mobile` only: Expo and its SDK packages, React Native, Uniwind, TanStack Query,
  `posthog-react-native`, `@sentry/react-native`, `expo-mcp` (dev). `bun audit` stays clean or the design lists what
  React Native adds.
- Docs: `apps/mobile/AGENTS.md`, root `AGENTS.md` module map and routing table, `README.md`, and the
  `workspace-structure` and `design-system` specs.
- No api, schema, or web app behavior change; the production image serves the web app, `/docs`, and `/nightshift` as
  before.
