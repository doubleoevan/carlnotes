# Design: add the mobile app

## Context

The Notion Mobile page decided the stack, and this change does not reopen it: Expo with Expo Router on a development
build, Uniwind for styling, EAS Build and EAS Update, TanStack Query over `@carlnotes/client`, `posthog-react-native`,
`@sentry/react-native`, Doppler as the one home of every value, iOS and Android from one codebase. The repo is Bun
1.4.3 workspaces installed with the isolated linker (the store sits in `node_modules/.bun`), four apps over nine
packages, with the universal four — `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/core`,
`@carlnotes/nightshift` — provably free of server code. Preflight is the gate: Biome, the package boundary check,
`tsc -b` over one solution file, the workflow bundle check, and `bun test`.

Facts below about Expo, Uniwind, EAS, Sentry, and PostHog were read from their current docs and changelogs on
2026-10-23, not from memory. The current Expo SDK is 58 (released 2026-10-15), pinning React Native 0.88 and React
19.3.0. The New Architecture is mandatory since SDK 55, so there is no flag to set. Two local probes against the
pinned Bun 1.4.3 settle the Docker and React questions; their findings are quoted where they decide something.

## Goals / Non-Goals

**Goals:**

- `apps/mobile` exists as `@carlnotes/mobile`, type-checked, linted, and boundary-checked like every workspace.
- Metro bundles through Bun's isolated layout with no resolver aliases and no tsconfig paths.
- The mobile bundle and the web build each hold exactly one React.
- The Nightshift theme, the fonts, the api client, monitoring, and the build profiles are wired in and proven by one
  screen on a development build.
- The production image, the web app, the docs, and the component browser are untouched.

**Non-Goals:**

- Sign-in, cookie handling, and secure storage (the sign-in change).
- The feed, the reader, tasting notes, chat, and the podcast player (their own changes).
- Store submission, final icon and splash art, and EAS Submit config (the release change).

## Decisions

### The SDK and the toolchain

**Expo SDK 58 on a development build.** `apps/mobile` takes `expo ~58.0.0`, React Native 0.88, React 19.3.0, and
`expo-dev-client`. The New Architecture is on because SDK 55 removed the Legacy Architecture and the `newArchEnabled`
option; nothing is set. Hermes V1 is the default engine since SDK 56 and stays.

**The repo's TypeScript stays.** SDK 56 bumped Expo's TypeScript to 6.x, and the changelog's opt-out is the
`expo.install.exclude` field: `apps/mobile/package.json` holds `"expo": { "install": { "exclude": ["typescript"] } }`
and declares no TypeScript of its own, so `tsc -b` keeps type-checking every workspace with the root's 5.9.3.
`skipLibCheck` is already on in `tsconfig.base.json`, so a React Native declaration file that uses newer TypeScript
features cannot fail the build. If 5.9.3 ever fails on app code that React Native's types force, the fallback is
bumping the root TypeScript for the whole repo, not forking versions.

**The mobile tsconfig.** `apps/mobile/tsconfig.json` extends `tsconfig.base.json`, references the universal four,
mirrors its `package.json` as the boundary check requires, and joins the root solution file. It overrides
`lib: ["ESNext"]`, so `window` or `document` fails the type check. It keeps `types: ["bun", "react"]` like
`packages/core`, which deviates from the brief's "drop the Bun types" on purpose: `@types/bun` is the one source of the
`bun:test` module declaration, which the mobile unit tests import, and the types cannot be split from the `Bun` global.
The brief's intent — a Bun global fails preflight — holds anyway: the Biome `noRestrictedGlobals` override that already
guards the universal packages gains an `apps/mobile/**` entry denying the browser globals and `Bun` outside tests. The
mobile entry does not deny `process`, unlike the universal one, because Metro inlines `process.env.EXPO_PUBLIC_*`
literals at export time and the app must write them.

**No Metro monorepo config.** The Expo monorepo guide for SDK 58 says Expo configures Metro automatically for
monorepos, isolated installs are supported since SDK 54, `autolinkingModuleResolution` is on by default in monorepos
since SDK 55, and SDK 56 made Bun's virtual store usable and dropped the `watchFolders` requirement. So Metro needs
nothing for Bun's isolated layout: each `@carlnotes` package resolves by name through the app's `node_modules`
symlinks, exactly what the brief requires. `apps/mobile/metro.config.js` exists only for the two wrappers:

```js
const { getSentryExpoConfig } = require("@sentry/react-native/metro")
const { withUniwindConfig } = require("uniwind/metro")

module.exports = withUniwindConfig(getSentryExpoConfig(__dirname), {
	cssEntryFile: "./global.css",
	dtsFile: "./uniwind-types.d.ts",
})
```

`getSentryExpoConfig` replaces `expo/metro-config`'s `getDefaultConfig` as the base, so Debug IDs reach the bundles and
source maps, and `withUniwindConfig` wraps outermost as Uniwind's docs require. The generated `uniwind-types.d.ts` is
committed like `apps/web/src/routeTree.gen.ts` — `tsc -b` runs without Metro, so the file has to exist in a fresh
checkout — and joins the Biome excludes; the boundary check already skips declaration files.

### Exactly one React

`@carlnotes/core` moves `react` from `dependencies` to `peerDependencies`, so the package stops pinning a copy of its
own. A probe against Bun 1.4.3's isolated linker shows the rest of the story: Bun links exactly one `react` into
`packages/core/node_modules`, and when the workspaces disagree on the version it silently follows the root
`devDependencies` pin — with root at 19.1.0, web at 19.1.1, and mobile at 19.1.0, core linked 19.1.0 and the web app
would have bundled two Reacts. A symlinked workspace package has one `node_modules`, so no linker can give it a
different React per consuming app.

So the peer dependency alone is not enough; the guarantee is one React version in the whole repo, pinned to what the
Expo SDK pins:

- `apps/mobile` declares `react` at the SDK's exact version, 19.3.0, as `expo install` writes it.
- Every other workspace that declares React — `apps/web`, `apps/api`, `packages/emails` — and the root
  `devDependencies` move from `^19.3.1` to the same exact 19.3.0 (`react-dom` with them), a patch-level step down.
- `@carlnotes/core` declares `peerDependencies: { "react": "^19.3.0" }` and keeps `@types/react` as a dev dependency.

With one version everywhere, the store holds one `react` entry and every symlink points at it, so the mobile bundle and
the web build each hold exactly one React by construction. The one screen calls a `@carlnotes/core` hook, so a
second React would fail loudly as an invalid hook call on the first run. The trade-off is real and accepted: the web
app's React now moves in step with the Expo SDK's pin, in either direction, and a React bump is one edit in three
`package.json` files. Rejected alternatives: a Metro resolver alias forcing `react` to the app's copy (the brief
forbids resolver aliases, and it would mask the mismatch instead of removing it), and leaving the versions apart (the
probe shows one app then bundles two Reacts, which breaks every hook).

### The boundary check

`scripts/packageBoundaries.ts` gains three edits, each covered in `scripts/packageBoundaries.test.ts` with fixtures:

- `@carlnotes/mobile` joins `APP_PACKAGE_NAMES`, so nothing imports it and its own import of another app already
  fails. `apps/mobile` is not in `TYPE_ONLY_API_IMPORTERS`, so `import type { AppType } from "@carlnotes/api"` fails
  under the existing "an app is never imported" rule with no new code.
- A new rule over the mobile folder's imports: a `@carlnotes` import from `apps/mobile` whose package is outside the
  universal four is a violation, whatever the package.json declares.
- A new package.json rule: every `@carlnotes` name `apps/mobile` declares, in dependencies or devDependencies, must be
  a universal package — the same walk `toNonUniversalDependencyViolations` does for the universal packages, without the
  type-only api exception.

The runtime closure walk stays as it is: it guards the universal packages, and the mobile app's own third-party
dependencies (React Native among them) are its own business, like Vite is the web app's.

### The image

**`apps/mobile` joins `.dockerignore`; the Dockerfile only learns to copy `patches/`.** A probe against Bun 1.4.3 settles it: with a
workspace folder missing from disk, `bun install --frozen-lockfile` passes and prints `note: skipped 1 workspace listed
in bun.lock but not on disk`, installing only the remaining workspaces' dependencies. So excluding `apps/mobile` from
the build context keeps every React Native dependency out of both stages, keeps the image's size, and leaves the web,
docs, and Storybook builds untouched, with a `.dockerignore` edit and no new `COPY` line. One exception rides along:
`apps/mobile/tsconfig.json` stays in the context, because the docs build reads the root tsconfig, whose references name
`apps/mobile`, and Astro fails on a reference to a folder with no tsconfig. A second wrinkle came out of the first
image build: `markdown-to-jsx`, a dependency of the api and the web app, names `react-native` in its
`peerDependenciesMeta`, and with React Native in the lockfile Bun linked the whole React Native closure — Metro and
the Hermes compiler included — into both image stages beside it. The fix is a `bun patch` dropping that meta entry
(`patches/markdown-to-jsx@9.10.3.patch`) with the same peers removed from the package's `bun.lock` manifest entry,
since Bun links peers from the lockfile's record instead of the patched file. A boundary test holds the lock entry to
that shape, because a future `bun update markdown-to-jsx` would write the registry's peers back. The Dockerfile copies
`patches/` beside the lockfile in both stages, because the install refuses a lockfile that names a missing patch. The alternative —
copying `apps/mobile/package.json` and filtering both installs with `--filter '!@carlnotes/mobile'` (which the probe
also shows working) — was rejected because it edits both install lines to ship a package.json the image never uses.

### The Uniwind theme

**Nightshift writes `packages/nightshift/uniwind.css` as one more written file.** A new `uniwindCss.ts` module beside
`tokensCss.ts` returns the text, `writtenFiles.ts` adds the path, so `bun run nightshift:write` writes it and the
existing loop in `tokens.test.ts` holds the committed file to the source with no new test code. The package.json gains
the export `"./uniwind.css": "./uniwind.css"`, and the file joins the Biome excludes beside `tokens.css`.

The format follows Uniwind's documented theming, which has no `@theme inline`: per-mode color variables live in
`@layer theme` under `:root`, one `@variant` block per mode, and non-color tokens live in a plain `@theme` block.

```css
@theme {
	--radius-sm: 6px;
	--radius-md: 8px;
	--radius-lg: 10px;
	--radius-xl: 14px;
}

@layer theme {
	:root {
		@variant light {
			--color-background: #e2d8c4;
			/* … every mapped name … */
		}
		@variant dark {
			--color-background: #584532;
			/* … every mapped name … */
		}
	}
}
```

- The names are `shadcnThemeColorNames` and `extraThemeColorNames` from `theme.ts` — every name the web theme maps —
  so `bg-primary`, `text-muted-foreground`, and `border-separator` resolve on both platforms. Uniwind drops the
  `--color-` prefix to name a utility, which matches the web's `@theme inline` mapping exactly.
- Each mode writes resolved values from `colors.ts`, not `var()` references, since Uniwind's per-mode blocks hold the
  values themselves. Both modes define every variable, because Uniwind warns in development on a missing one, and the
  writer runs each value through `toColorChannels`, which throws on anything that is not six-digit hex or rgba — the
  forms React Native reads. Uniwind also documents oklch, but the source holds hex and rgba only.
- The radius scale writes `toRadiusPixels` values. The web's `calc(var(--radius) ± Npx)` form has no meaning in a
  native app with no root font size, so the resolved pixels at the 16-pixel rem are the scale.
- The font families stay out of the theme file: native font loading goes through `expo-font` and the type roles, below.

**The app side.** `apps/mobile/global.css` is three imports — `tailwindcss`, `uniwind`,
`@carlnotes/nightshift/uniwind.css` — imported from the root layout, not from the entry file, as Uniwind's docs
require. Uniwind's `adaptiveThemes` defaults to true, so the app follows the system appearance between Latte and Dark
roast with no code.

### Fonts and type roles

**The faces form of `expo-font`.** Karla's 400, 500, 600, and 700 faces and Architects Daughter's single 400 face come
from `@expo-google-fonts/karla` and `@expo-google-fonts/architects-daughter`, so no binary font files land in the repo.
The root layout loads them with `useFonts` in the faces form — all faces of a family in one entry, each with its
`weight` — which SDK 58 documents as the way one `fontFamily: "Karla"` plus `fontWeight` selects the right face on iOS
and on Android. That answers the brief's weight question: the medium, semibold, and bold faces resolve through the
declared weights, not through family-per-weight names like `Karla-Bold`.

**The type roles map in the app.** A small `apps/mobile/src/typeRoleStyles.ts` turns each `typeRoles` entry from
`@carlnotes/nightshift/typography` into a React Native text style: the family name from `fontFamilies`, `fontSizeRem`
and `lineHeightRem` times 16, the `fontWeight`, `letterSpacingEm` times the font size, and uppercase where the role
says so. It is pure logic with a type-only `react-native` import, so a `bun test` covers it without loading React
Native. The mobile app may import nightshift's TypeScript freely; the component-browser restriction is the web app's
own bundle rule.

**The splash screen waits.** `SplashScreen.preventAutoHideAsync()` runs at module scope in the root layout, and an
effect hides the splash once the fonts load or fail, per the Expo fonts guide, so no screen flashes a fallback font.

### The api client and the one screen

**Choosing the url is one pure function.** `apps/mobile/src/apiBaseUrl.ts` exports `toApiBaseUrl`, covered by a unit
test: in production it returns `https://carlnotes.com`; in development it takes the host from Expo's
`Constants.expoConfig.hostUri` — the address the device already reached the dev server on — and returns
`http://<that host>:3000`. That one rule serves all three development cases: the iOS simulator reaches the machine as
localhost, and the Android emulator and a phone on the same network reach it by the LAN address the dev server
advertised. The one gap, a USB-connected Android device in localhost mode, needs `adb reverse tcp:3000 tcp:3000` and is
written into `apps/mobile/AGENTS.md`. The root layout calls `configureApiClient` once with that url and a `showError`
that shows the message through React Native's `Alert` — no toast dependency until a screen change wants one.

**TanStack Query wraps the app.** One `QueryClient` in the root layout's provider stack. The one screen's read goes
through `useQuery`.

**The screen reads the site search.** The root route renders the CarlNotes name in the display font, body text in
Karla, a swatch row of the Nightshift surfaces and accents in the current mode, and one public read: `searchSite` from
`@carlnotes/client/searchClient` with a fixed query, rendering its loading state, its results, and its error state. The
site search was picked over a public topic page because it needs no seeded topic id — no value to configure, nothing to
break when content changes. The screen follows the accessibility bar below and calls one `@carlnotes/core` hook so an
accidental second React fails loudly on first run.

### Accessibility

`apps/mobile/AGENTS.md` writes the bar for every mobile change, the same bar Storybook's accessibility checks hold the
web to: every pressable control has an accessibility label and role, text scales with the system's text size on iOS and
Android without clipping, touch targets are at least 44 points, and colors come from Nightshift, whose contrast test
already holds text to WCAG AA. The one screen follows it from day one.

### Monitoring

**Sentry.** `app.config.ts` wraps with `withSentry` from `@sentry/react-native/expo`, naming organization `carlnotes`
and project `carlnotes-mobile` — the project already exists, and neither name is secret, so both are written in the
config instead of kept in Doppler. The Metro base is `getSentryExpoConfig`, above. The root layout calls `Sentry.init`
only when `process.env.EXPO_PUBLIC_SENTRY_DSN` is set — Sentry's own docs say a missing DSN sends nothing, and skipping
`init` also skips the instrumentation overhead in development — and exports the layout through `Sentry.wrap`. The root
layout also exports Expo Router's `ErrorBoundary`, the root error boundary the brief asks for, which Sentry's Expo
Router integration captures through. On an EAS release build the config plugin uploads bundles and source maps itself,
reading `SENTRY_AUTH_TOKEN` from the EAS environment; the token never enters the bundle or the repo.

**PostHog.** `PostHogProvider` wraps the app with `EXPO_PUBLIC_POSTHOG_KEY` — the same project the web app sends to —
and `disabled` when the key is unset, so a build without the key reports nothing. The host is not a value: the provider
names the same host the web app sends to, written in code.
PostHog documents automatic screen capture only for React Navigation, not Expo Router; the documented Expo Router way
is manual, so the root layout records a screen view per route from a `usePathname` effect calling `posthog.screen`.
The path alone goes, so a route's params can never ship a sign-in code or token to analytics.

### Builds and values

**`app.config.ts`** names the app CarlNotes with `ios.bundleIdentifier` and `android.package` `com.carlnotes.app` and
the scheme `carlnotes`, which the sign-in change needs for its redirects. It links the existing Expo project with
`owner: "carlnotes"`, `slug: "carlnotes"`, and `extra.eas.projectId: "7b874ce7-cb2a-4d50-a8d7-fb89e078b247"` written in
the config — with a dynamic config the EAS CLI cannot write the id itself, so writing it is the expected path and no
`eas init` runs. The icon and Android adaptive icon come from the existing favicon art
(`apps/web/public/web-app-manifest-512x512.png` and the maskable variant, copied into `apps/mobile/assets/`), and the
splash goes through the `expo-splash-screen` config plugin with the icon image and the `background` token's two mode
values; the config imports them from `@carlnotes/nightshift/colors`, falling back to literals with a pointing comment
only if Expo's config loader cannot load workspace TypeScript. Final art comes with the release change.

**`eas.json`** has the three profiles plus the simulator variant the EAS docs recommend keeping separate, each naming
its EAS environment, with Bun pinned to the repo's 1.4.3 (this pin joins the Bun-version update list):

- `development`: `developmentClient: true`, `distribution: "internal"`, environment `development`.
- `development-simulator`: extends `development`, `ios.simulator: true`.
- `preview`: `distribution: "internal"`, environment `preview`.
- `production`: the store build, environment `production`.

The runtime version policy is `{ "policy": "fingerprint" }`: the fingerprint bumps the runtime whenever anything that
could affect the native runtime changes, so an EAS Update can never land on an incompatible build; the cost, more
frequent builds, is right for a young app. `appVersion` was rejected because a forgotten version bump on a native
change ships a mismatched update.

**Every value the app reads, and where it lives.** Doppler stays the one home: dev config for development, prd for
production, and the three mobile values already sit in both configs under the names below. EAS builds in the cloud, where neither `doppler run` nor a local environment reaches, so a script,
`scripts/sync-mobile-env.ts` behind the root script `mobile:env:sync`, moves the values from Doppler into EAS
environments — Doppler dev fills the EAS `development` and `preview` environments, prd fills `production`. The script
runs under `doppler run` and calls `eas env:set` per value with an explicit `--visibility` and `--non-interactive`;
`eas env:push` was rejected because the visibility it assigns pushed values is undocumented. No one types a value into
the EAS dashboard.

| Value | Visibility | Ships in the bundle |
| --- | --- | --- |
| `EXPO_PUBLIC_SENTRY_DSN` | plaintext | yes — a DSN is a public write-only address |
| `EXPO_PUBLIC_POSTHOG_KEY` | plaintext | yes — the web already ships the same project key |
| `SENTRY_AUTH_TOKEN` | secret | no — read by the Sentry plugin at build time only |

The `EXPO_PUBLIC_*` names are forced by Expo: Metro inlines exactly those `process.env` references into the bundle.
Anything without the prefix never reaches the JavaScript. The api base url and the PostHog host are not values at all —
code chooses them, as above. Reporting gates on the key's presence alone, so unsetting a key in a Doppler config
silences that reporter for every build the config feeds.

**Root scripts.** `dev:mobile` starts the Expo dev server under Doppler's dev config with `EXPO_UNSTABLE_MCP_SERVER=1`,
so the `expo-mcp` dev dependency (installed through `expo install`, so its version matches the SDK) serves screenshots,
taps, and React Native DevTools to a connected coding agent. The EAS commands get root scripts in the same style —
`mobile:build`, `mobile:update`, `mobile:env:sync` — delegating to `apps/mobile` scripts, with `eas-cli` pinned as an
`apps/mobile` dev dependency instead of assumed global. The `mobile:` prefix keeps `build:<module>` meaning what the
Dockerfile runs. The README's Development section gains the scripts in the same change.

### Verification

**CI exports both bundles; preflight does not.** A new `mobile-export` job in `ci.yml` runs
`CI=1 expo export --platform ios --platform android` from `apps/mobile` on ubuntu, which bundles both platforms through
Metro with no simulator and no secret — the one proof that Metro resolves every import through Bun's isolated layout.
It stays out of preflight because preflight is the local pre-push gate and runs in a couple of minutes today; a Metro
bundle of the React Native graph adds minutes per push while `tsc -b` already catches everything but Metro-specific
resolution, which every PR's CI run covers. The job runs parallel to the gate job, so CI's wall clock barely moves.

**The rest of the gate.** `bun run check` covers `apps/mobile` with no new wiring: Biome checks everything, the
boundary check scans `apps/*`, the solution file gains the reference, and the tokens test covers `uniwind.css` through
`toWrittenFiles`. The boundary test gains the mobile fixtures. `bun test` runs the two pure mobile tests and no React
Native component.

**What `bun audit` recorded after the install.** `bun audit fix` resolved the advisories fixable within ranges, the
DOMPurify critical among them. 23 advisories remain as exact nested pins only an upstream release can move, beside the
repo's pre-existing chains through `@react-email/ui` and `drizzle-kit`. Every mobile-attributable chain but one runs
through developer and build tooling that never ships — `eas-cli`, Expo's CLI and config plugins, Sentry's bundler
plugins, Uniwind's metro config, `expo-mcp` — and the one runtime chain is `expo-router > nanoid`, whose advisories
need generator sizes the router never passes. CI's audit stays report-only.

## Risks / Trade-offs

- [One React version couples web and mobile upgrades] → Accepted and documented; today it is a patch-level step from
  `^19.3.1` to 19.3.0, and a future React move is one version string in five package.json files, caught by the
  invalid-hook-call failure and the store listing if missed.
- [TypeScript 5.9.3 against React Native 0.88's types, written for TS 6] → `skipLibCheck` is already on, so declaration
  files cannot fail the build; if app-code inference breaks anyway, the repo bumps its one TypeScript instead of
  forking versions.
- [Expo's config loader may not import workspace TypeScript in `app.config.ts`] → The splash colors fall back to
  literal values with a comment naming the Nightshift token; nothing else imports a workspace from the config.
- [Bun skips lifecycle scripts by default, and some React Native packages postinstall] → Expo's Bun guide's own
  remedy: add the package to root `trustedDependencies`, where `@swc/core` and `protobufjs` already sit.
- [`uniwind-types.d.ts` can drift from the theme until a dev server regenerates it] → It is committed and
  Biome-excluded like `routeTree.gen.ts`; drift shows as a type error in the next dev loop, never a runtime change.
- [A USB-connected Android device in localhost mode cannot reach port 3000] → `adb reverse tcp:3000 tcp:3000`, written
  into `apps/mobile/AGENTS.md`.
- [`bun audit` may report new advisories from React Native's tree] → CI's audit is report-only; the apply lists what
  arrives and resolves anything actionable in this change.

## Migration Plan

The change is additive: no url, schema, api, or deploy topology changes. The image builds from the same Dockerfile with
one more `.dockerignore` line, and Northflank starts nothing new. Rollback is deleting `apps/mobile`, the
`.dockerignore` line, the boundary and Biome entries, the `uniwind.css` writer, and the root scripts, and restoring the
React version pins — no data, no deploy, no stored state.

## Open Questions

None. Every decision the brief left open is made above: Metro needs nothing for the isolated layout, the image excludes
the workspace through `.dockerignore`, the one-React guarantee is the peer dependency plus one pinned version, the
export proof runs in CI alone, the value sync goes value-by-value through `eas env:set`, and the screen's public read
is the site search.
