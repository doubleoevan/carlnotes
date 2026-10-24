# Tasks: add the mobile app

## 1. One React, and the Uniwind theme

- [x] 1.1 Move `react` in `packages/core/package.json` from dependencies to `peerDependencies` at `^19.3.0`, keeping
  `@types/react` as a dev dependency
- [x] 1.2 Pin `react` and `react-dom` to exactly 19.3.0 in `apps/web/package.json` and `react` in the root
  `devDependencies`, run `bun install`, and confirm `node_modules/.bun` holds one `react@` entry
- [x] 1.3 Run `bun run check` and `bun run build:ui` to prove the web build and suite pass on the pinned React
- [x] 1.4 Add `packages/nightshift/uniwindCss.ts`: the `@theme` block with the radius steps from `toRadiusPixels`, and
  `@layer theme` with a light and a dark `@variant` block writing each mapped name's resolved value, every value run
  through `toColorChannels`
- [x] 1.5 Add `uniwind.css` to `toWrittenFiles`, run `bun run nightshift:write`, and commit the written file
- [x] 1.6 Export `./uniwind.css` from `packages/nightshift/package.json` and add the file to the Biome excludes; confirm
  `tokens.test.ts` covers it

## 2. The mobile workspace

- [x] 2.1 Scaffold `apps/mobile` as `@carlnotes/mobile`: Expo SDK 58, `expo-dev-client`, `expo-router`, `uniwind`,
  `tailwindcss`, `@tanstack/react-query`, the universal four, `react` 19.3.0, and
  `"expo": { "install": { "exclude": ["typescript"] } }`; add any postinstalling package to root `trustedDependencies`
- [x] 2.2 Write `apps/mobile/tsconfig.json` extending the base with `lib: ["ESNext"]` and references mirroring the
  package.json, and add the workspace to the root solution file's references
- [x] 2.3 Write `apps/mobile/metro.config.js` wrapping `getSentryExpoConfig` in `withUniwindConfig` outermost, write
  `global.css` with its three imports, commit the generated `uniwind-types.d.ts`, and gitignore `.expo` and `dist`
- [x] 2.4 Write `app.config.ts`: CarlNotes, `com.carlnotes.app`, scheme `carlnotes`, owner `carlnotes`, slug
  `carlnotes`, projectId `7b874ce7-cb2a-4d50-a8d7-fb89e078b247`, the `withSentry` wrapper naming organization
  `carlnotes` and project `carlnotes-mobile`, the icon and splash from the favicon art copied into
  `apps/mobile/assets/`, and the splash background from the Nightshift `background` token
- [x] 2.5 Write `eas.json`: development, development-simulator, preview, and production profiles, each naming its EAS
  environment, Bun pinned to 1.4.3, and `runtimeVersion` policy `fingerprint`

## 3. Boundaries, Biome, and the image

- [x] 3.1 Extend `scripts/packageBoundaries.ts`: `@carlnotes/mobile` joins `APP_PACKAGE_NAMES`, a mobile import of a
  `@carlnotes` package outside the universal four fails, and a mobile package.json declaring one fails
- [x] 3.2 Extend `scripts/packageBoundaries.test.ts` with the mobile fixtures: a `@carlnotes/db` import fails, an
  `import type` of `@carlnotes/api` fails, and a declared non-universal dependency fails
- [x] 3.3 Extend `biome.json`: an `apps/mobile/**` restricted-globals override denying the browser globals and `Bun`
  but not `process`, and excludes for `uniwind.css` and `uniwind-types.d.ts`
- [x] 3.4 Add `apps/mobile` to `.dockerignore`, build the production image, and confirm the frozen install skips the
  workspace, the size holds, and the web app, `/docs`, and `/nightshift` serve as before

## 4. The app code

- [x] 4.1 Write `apps/mobile/src/apiBaseUrl.ts` choosing `https://carlnotes.com` in production and the dev server's
  host on port 3000 from `hostUri` in development, with its `bun test`
- [x] 4.2 Write `apps/mobile/src/typeRoleStyles.ts` mapping each Nightshift type role to a React Native text style,
  with its `bun test` and a type-only `react-native` import
- [x] 4.3 Write the root layout: the Karla and Architects Daughter faces through `useFonts`, the splash screen held
  until they load, `configureApiClient` with the chosen url and an `Alert` `showError`, the TanStack Query provider,
  the PostHog provider disabled without a key with the screen-view effect, `Sentry.init` gated on the DSN,
  `Sentry.wrap`, and the exported `ErrorBoundary`
- [x] 4.4 Write the root screen: the CarlNotes name in the display font, body text in Karla, the swatch row of
  Nightshift surfaces and accents, the `searchSite` read with loading and error states, one `@carlnotes/core` hook,
  and the accessibility bar honored

## 5. Values, scripts, and CI

- [x] 5.1 Write `scripts/sync-mobile-env.ts` calling `eas env:set` per value with explicit visibility —
  `EXPO_PUBLIC_SENTRY_DSN` and `EXPO_PUBLIC_POSTHOG_KEY` plaintext, `SENTRY_AUTH_TOKEN` secret — mapping Doppler dev to
  the development and preview environments and prd to production
- [x] 5.2 Add the root scripts `dev:mobile` (Doppler dev, `EXPO_UNSTABLE_MCP_SERVER=1`), `mobile:build`,
  `mobile:update`, and `mobile:env:sync`, with `eas-cli` and `expo-mcp` as `apps/mobile` dev dependencies
- [x] 5.3 Run `mobile:env:sync` for every environment — the three values already sit in Doppler dev and prd — and
  confirm they land in EAS with the right visibility
- [x] 5.4 Add the `mobile-export` job to `ci.yml` running `CI=1 expo export --platform ios --platform android` from
  `apps/mobile`
- [x] 5.5 Run `bun audit` and record what React Native's tree adds; resolve anything actionable

## 6. Docs and verification

- [x] 6.1 Write `apps/mobile/AGENTS.md`: the accessibility bar, the layout and entry points, the commands, and the
  `adb reverse` note for a USB-connected Android device
- [x] 6.2 Add the Mobile rows to the root `AGENTS.md` module map and routing table, and the scripts to the README's
  Development section
- [x] 6.3 Run `bun run check` green, and `expo export` for both platforms locally through the isolated install
- [x] 6.4 Build the development client with `mobile:build` (simulator and device profiles), connect it to
  `dev:mobile`, and prove the screen: both modes follow the system appearance, the fonts render, the read loads, the
  error state shows with the api stopped, and no invalid hook call fires
- [x] 6.5 Search the exported bundles for `SENTRY_AUTH_TOKEN` to prove no secret ships, and confirm a release build's
  source maps reach Sentry from EAS
