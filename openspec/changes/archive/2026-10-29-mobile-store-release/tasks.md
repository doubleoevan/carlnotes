# Tasks

## 1. Minimum app versions

- [x] 1.1 Add `packages/contracts/appVersions.ts` with `compareAppVersions`, `isAppVersionSupported`, the
  `appVersionOutdatedResponse` schema, and the store url constants with `APP_STORE_ID` nullable in `mobileApp.ts`;
  verify with tests over dotted versions, an unparseable version, and the docs fallback url.
- [x] 1.2 Add the `mobile_minimum_versions` schema and migration in `packages/db/schema/`, with a reader through
  `cacheJson` at a 60 second ttl that returns no minimum on any failure; verify with a test that a Redis failure and
  an empty table both yield no minimum.
- [x] 1.3 Add the gate middleware after `traceRequest` on `/api/*` minus health, returning 426 with the body and
  `no-store`; verify with route tests for an older build, an equal build, a newer build, a web request, a request
  without a version, and the health route.
- [x] 1.4 Add the admin console read and write routes for the minimums with the `admin:console` gate, their payload
  contract, and the console card on the web and in `AdminPage.tsx` stories; verify with route tests for admin and
  non-admin callers and a story per state.
- [x] 1.5 Rename `fetchAndReportUnauthorized` to `fetchAndHandleRejections`, add `onAppVersionOutdated` to the client
  settings, and report a 426 from the typed client, the plain fetch, and the chat stream; verify with client tests per
  transport that the setting is called once and the response is returned.
- [x] 1.6 Add `packages/core/stores/appUpdateStore.ts` and the shared `AppUpdateNotice` copy in Carl's voice, and in
  the app the full-screen notice over the navigator, the store button, "Check again" invalidating the account query
  client, the room stream and auth client 426 hooks, and stories for the notice with and without a minimum; verify
  by setting a minimum above the dev build on the simulator and the emulator and seeing the notice on a read, a room
  stream, and sign-in, then lowering it and tapping "Check again".
- [x] 1.7 Add the version line to the Account screen from `expo-application` and `expo-updates`, with a story, and
  record the platform reason in `parity.md`; verify on the simulator and in the story.

## 2. Tolerant reads

- [x] 2.1 Add `UNKNOWN_CASE` and `displayEnum` to `packages/contracts/enums.ts` and `toTolerantResponseSchema` in
  `packages/contracts/tolerantReads.ts`; verify with tests for a dropped list entry, an optional and a nullable
  default, an unknown display value, a strict enum failure, a required field failure, a discriminated union, and a
  record.
- [x] 2.2 Switch the display enums in the response schemas to `displayEnum` per the design's list and add the unknown
  branch to every switch and lookup `tsc` names on both apps; verify with `bunx tsc -b` and a test per lookup helper.
- [x] 2.3 Add contract response schemas for every read the app reaches that is cast or inferred today, listed in the
  registry; verify with a test that each schema parses the route's existing test fixture.
- [x] 2.4 Add `readApiResponse`, `ApiResponseError`, `toResponseSchema`, and `onTolerantReadIssue` to the client, move
  every read onto `readApiResponse`, configure the app with the tolerant adapter and Sentry issue reporting; verify
  with client tests that the web parse is strict and the app parse drops an entry and reports the count.
- [ ] 2.5 Confirm the error state with a retry on each screen the spec names and the Feed's snapshot fallback; verify
  with a malformed response from a stubbed api on the simulator and a story per screen error state that lacks one.

## 3. Contract freeze

- [x] 3.1 Add `ajv` as a root dev dependency and `packages/contracts/apiRouteContracts.ts` with an entry for every
  capability the parity walk finds from `apps/mobile/app`; verify with the registry test that every key is an exported
  client function and every method and path is on the Hono route list.
- [x] 3.2 Add `scripts/freeze-contract.ts` behind `bun run contract:freeze` with `--check`, writing
  `contracts/<app-version>.json` from the registry with `z.toJSONSchema`, and `contracts/releases.json`; verify that
  two freezes are identical, that `--check` fails after a schema edit, and that a reached capability without an entry
  fails the freeze.
- [x] 3.3 Add `scripts/contractCompatibility.ts` and `scripts/check-contract-freeze.ts` in preflight after the client
  parity check; verify with tests for a removed required response field, a changed type, an extended response enum, a
  new optional field, a new required request field, a narrowed request type, a removed request enum value, a loosened
  request, and a declared version without a snapshot.
- [x] 3.4 Add `apps/api/contractFixtures.ts` and `apps/api/contractCompatibility.test.ts` validating each fixtured
  route's in-process response with Ajv against the frozen schema; verify the suite passes and the registry test names
  each route still without a fixture.
- [ ] 3.5 Capture the first snapshot at the submission version, declare it in `releases.json`, and document freeze,
  retirement, and the PostHog traffic check in `apps/mobile/AGENTS.md`; verify preflight is green with the snapshot
  present and red with it renamed.

## 4. First-release payments

- [x] 4.1 Make `PlanCard` render a purchase action only with a handler and `TopicScanFailure` link only with a href,
  keep the web passing both, and update their stories; verify the web Plans page and recap are unchanged in the
  browser and the new stories show the actionless states.
- [x] 4.2 Remove the Upgrade and Manage plan buttons, the portal button on the failed-payment notice, and every plans
  link from the app's Account, spend meter, topic settings card, scan alert, scan recap, and edit topic fields, keeping
  the sentences, with stories; verify on the simulator and in the stories.
- [x] 4.3 Add the Privacy and Terms links to the app's Account screen in the web's order, remove the story-only
  `SettingsContent.tsx` if nothing else needs it, and update `parity.md`; verify the links open the web pages in the
  browser sheet.
- [x] 4.4 Add `PURCHASE_COPY` to `packages/contracts/plans.ts`, `scripts/check-purchase-paths.ts` in preflight with
  its listed exceptions, and the `deferred | Prompt 55` rows for the two billing capabilities in `parity.md`; verify
  with tests over a fixture tree for a reached capability, a plans path in an unlisted app file, and a listed exception,
  and that preflight passes on the real tree.

## 5. App links

- [x] 5.1 Add `packages/contracts/appLinkPaths.ts` with the implemented path patterns and the apple-app-site-association
  (AASA) and assetlinks builders, serve both files from `documentsRoute` from `APPLE_TEAM_ID` and
  `ANDROID_SIGNING_FINGERPRINTS` with `application/json`, an hour of caching, and 404 when unset; verify with route
  tests for the shape, the headers, and the unset case.
- [x] 5.2 Set `ios.associatedDomains` and build the Android `intentFilters` from the path list in `app.config.ts`;
  verify with `expo prebuild` output showing the entitlement and one verified filter listing every path.
- [x] 5.3 Run `toPlatformPath` in `toLinkedPath` before the sign-in gate, add the `open-web` fallback route, and keep
  the query and section context; verify with tests that every listed pattern reaches a native route or the fallback,
  a slugged Topic url keeps its season, and a visitor's signed-in link is remembered.
- [x] 5.4 Emit the `apple-itunes-app` meta in the web root head when `APP_STORE_ID` is set; verify with a route test
  for both values of the id.
- [ ] 5.5 Set the Doppler values, confirm the AASA from Apple's CDN endpoint and the assetlinks with `adb shell pm
  verify-app-links`, and check a Topic, Podcast Episode, invite, search, profile, Activity, Team, and chat link from
  Mail and Messages, installed and uninstalled, cold and warm, on both platforms; record results in
  `apps/mobile/store/release-checklist.md`.

## 6. Delivery

- [x] 6.1 Set `appVersionSource` remote, production `autoIncrement`, and the submit profiles in `eas.json`, keep the
  store keys in Doppler with `scripts/sync-mobile-env.ts` unchanged, and seed the remote build number; verify with
  `eas build:version:get`.
- [x] 6.2 Add `scripts/submit-mobile.ts` behind `bun run mobile:submit` running the freeze check, writing the App Store
  Connect key to a temporary folder and the Play service account to `apps/mobile/play-service-account.json`, which is
  gitignored, submitting, and removing them; verify with a dry run that stops on a stale freeze and that no key file
  remains after a run.
- [ ] 6.3 Set Sentry `release` and `dist` in `startMonitoring`; verify a preview build's crash shows the release and the
  update id with readable frames.
- [ ] 6.4 Publish an EAS Update to a preview build and confirm it loads, then make a native change and confirm the
  fingerprint differs; record both in `apps/mobile/AGENTS.md`.
- [x] 6.5 Add `scripts/seed-reviewer-account.ts` behind `bun run reviewer:seed` with the environment check and the
  fixtures the spec names; verify it exits with an error without the flag, runs twice against dev leaving one account,
  and prints no credential.
- [x] 6.6 Add `apps/mobile/store/listing.md`, `data-inventory.md`, and `release-checklist.md`, set
  `ITSAppUsesNonExemptEncryption` from the dependency audit, and add the docs "Get the app" page to Start here with
  the docs embed rerun; verify the docs build lists the page and the inventory names every module in `package.json`
  that collects data.
- [x] 6.7 Document build, test, freeze, submit, rollout, rollback, update, and minimum-version steps in
  `apps/mobile/AGENTS.md` and the README Development section, and update the root module map for `contracts/` and
  the new scripts; verify the ship docs check resolves every path.

## 7. Release QA and integration

- [ ] 7.1 Run the acceptance list on an iPhone, an iPad, an Android phone, and an Android tablet: both orientations,
  keyboard, safe areas, larger text, both palettes, VoiceOver, the proposed Topic card on the iPhone SE, the six roles,
  a second account's Profile defaults, forced update and recovery per platform; record each result or its unverified
  status in `release-checklist.md`.
- [ ] 7.2 Check the PostHog and Sentry dashboards with real access for platform and device separation and private
  content redaction on mobile events; record the result in the checklist.
- [x] 7.3 Run `bun run check` and the mobile exports for both platforms; verify preflight is green with the snapshot,
  the freeze check, the purchase guard, and the compatibility tests in place.

## Workflow follow-up

- Build and submit through TestFlight and the Play test track from the documented path, then set each platform's
  minimum once the released version's traffic shows in PostHog.
- Archive the change through `/ship`.
