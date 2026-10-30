# Design

## Context

See proposal.md for the gaps. What shapes the approach:

- Every mobile request already sends the device headers `packages/contracts/clientTelemetry.ts` names, through
  `mobileApiRequestSettings.headers` for the typed client, `fetchApi`, the chat stream, and the room event source,
  and through `deviceTelemetryHeaders` for the auth client. `traceRequest` parses them once per request and
  `toClientTelemetry` treats a platform other than `ios` or `android` as the web. The api has no per-request handling
  of 426 anywhere, and the client special-cases only 401 and the terms 403 in `fetchAndReportUnauthorized`.
- There is no runtime setting the api reads from anywhere but `Bun.env`, which Doppler injects at process start. The
  admin console already writes two per-user columns through `apps/api/admin.ts` with the `admin:console` gate, and
  `packages/db/redis.ts` has `cacheJson` with a ttl and a fail-open read.
- The shared client parses nine responses with contract schemas and casts about forty with `as`. The contracts use
  `z.enum` from the `as const` arrays in `enums.ts` with no `.catch` on a response enum. Zod is 4.6, which has
  `z.toJSONSchema`, and Ajv is only a transitive dependency.
- `scripts/clientParity.ts` already walks each app's modules from its routes through `@/`, relative, and
  `@carlnotes/*` imports and names the `packages/client` capabilities each app reaches. The route tests call route
  objects in-process with `app.request` over `stubConnectionPool` and `signInAs`.
- `app.config.ts` sets the scheme, the bundle identifier, App Attest, and the Sentry wrap, and nothing for `https`
  links. `+native-intent.ts` strips the host and gates signed-in paths but does not run `toPlatformPath`, so a web
  topic url with a slug has no matching route. The in-memory `sessionReturnPath` returns a visitor after sign-in.
  `documentsRoute` serves `/.well-known/security.txt` with `toDocumentHeaders`, and the vite dev server proxies
  `/.well-known` to the api.
- `eas.json` has the three build profiles pinned to Bun 1.4.4 with `channel` on preview and production, no
  `appVersionSource`, no `autoIncrement`, and an empty `submit.production`. `scripts/sync-mobile-env.ts` moves five
  named values from Doppler into the EAS environments. Sentry gets no explicit `release` or `dist`.
- The native Plans screen, `AccountBudget`, `SpendMeter`, `TopicSettingsCard`, `TopicScanButton`, `TopicScanRecap`,
  and `EditTopicFields` reach `/plans`, `fetchCheckoutUrl`, or `fetchBillingPortalUrl`. The shared `PlanCard` and
  `TopicScanFailure` take the purchase actions as props. `apps/mobile/parity.md` lists the Plans screen as shared and
  names Prompt 55 for store payments but has no row for the two billing capabilities.
- The mobile Account screen renders `AccountSettings` and no legal links. `SettingsContent.tsx`, which has them, is
  rendered only by its stories.

## Goals / Non-Goals

**Goals:**

- A build that reaches the store can be told to update, and the api cannot drift from a snapshot that build was
  frozen against without preflight saying so.
- One source for each shape: the contract schema feeds the web's strict parse, the app's tolerant parse, and the
  frozen JSON Schema. No hand-copied response types in the app.
- Web parsing, request validation, and the web's purchase flows are unchanged in behavior.
- Every secret stays in Doppler, every store credential arrives through the existing env sync, and nothing the
  release path needs is typed into a dashboard.

**Non-Goals:**

- What the app sells and how (Prompt 55). This change removes the offers and leaves the guard for 55 to revise.
- Push notifications, new-topic chat and attachments, and voice (Prompts 52 to 54). They stay in the parity
  inventory against their prompts and ship on a later build.
- Forcing an EAS Update. The gate keys on the native app version, which only a store build changes. An update that
  must reach every device is shipped as a store build with a raised minimum.
- A `/u/<username>` profile route, standalone note or Podcast Episode urls, or any web path the web does not have today.
  The app links cover the web's current paths.
- Gating a request by its platform header for authorization. The headers stay telemetry, and the gate only decides
  whether to ask for an update.

## Decisions

**1. The minimum lives in Postgres, edited from the admin console, cached a minute in Redis.** A
`mobile_minimum_versions` table with `platform` as the key, `minimum_version`, `updated_at`, and
`updated_by_user_id`. The admin console reads both rows and writes one with a new
`POST /api/admin/mobile-minimum-versions/:platform` behind `admin:console`, and the gate reads through `cacheJson` with
a 60 second ttl and a Redis miss falling through to one query. Alternatives: a Doppler value needs a service restart
and leaves no audit of who raised it; a Redis-only value has no backup in production and would silently lift the gate
after a Redis loss; a PostHog feature flag adds a network read to the hot path and the server disables remote flags on
purpose. A missing row, an unreadable database, or a Redis failure all mean no minimum, so the gate fails open.

**2. One middleware after `traceRequest`, on every `/api` path but health.** The gate reads the parsed telemetry,
returns early for a web entry point or an app version that does not parse as dotted integers, compares against the
cached minimum with `compareAppVersions` in `packages/contracts/appVersions.ts`, and answers
`{ rejection: "appVersionOutdated", minimumVersion, storeUrl }` with 426 and `Cache-Control: no-store`. It runs
before the session lookup, so a revoked session and an old build both get one clear response, and it skips
`/api/health`. The auth routes under `/api/auth` are gated too, since the Expo auth client sends the same headers and a
build that cannot sign in should say why. The store urls are constants in `packages/contracts/mobileApp.ts`: the Play
url from the package name and the App Store url from `APP_STORE_ID`, which is `null` until the record exists and
falls back to the docs "Get the app" page, so the body is never wrong before the id is known.

**3. The client reports the 426 through one setting and the app shows one notice.** `fetchAndReportUnauthorized`
becomes `fetchAndHandleRejections`: 401 as today, the terms 403 as today, and a 426 parsed with
`appVersionOutdatedResponse` and passed to `settings.onAppVersionOutdated`, then returned. The typed client, the plain
fetch, the chat stream, and voice all pass through it. The room event source's `error` event exposes the status but not
the body, so the mobile stream handler calls the same store on a 426 with no body, and the auth client's
`fetchOptions.onError` does the same. `packages/core/stores/appUpdateStore.ts` holds the requirement, and the root
layout renders `AppUpdateNotice` in place of the navigator while one is held: Carl's words, the minimum when the body
had one, an "Update CarlNotes" button that opens the platform's store url from the contracts constant, and a "Check
again" that clears the store and invalidates the account query client, so the next read either succeeds or brings the
notice back. The notice is not dismissible and the version line on Account reads `Application.nativeApplicationVersion`,
`nativeBuildVersion`, and the first eight characters of `Updates.updateId` when one is loaded. Alternative considered:
a launch-time version check against a new route, rejected because the first read already answers and a new route is
one more thing to freeze.

**4. Tolerance is derived from the strict schema by a walker, and display enums declare their unknown case at the
source.** `packages/contracts/tolerantReads.ts` exports `toTolerantResponseSchema(schema)`, which walks the Zod 4
definition (`object`, `array`, `optional`, `nullable`, `default`, `union`, `discriminatedUnion`, `record`, `enum`,
`literal`, and the primitives) and rebuilds it: an array's items are parsed one at a time and a failing entry is
dropped and counted, an optional or nullable member that fails parses to `undefined` or `null`, an enum whose entries
include `UNKNOWN_CASE` gets `.catch(UNKNOWN_CASE)`, and everything else stays as it was, so a required string, number,
boolean, id, role, visibility, or strict enum fails its entry or the response. Display enums are declared with
`displayEnum(values)` in the response schemas, which appends `UNKNOWN_CASE` to the entries, so the inferred type
includes it on both apps and `tsc` finds every switch and record lookup that lacks a branch. The request payload
schemas keep `z.enum(values)`, so validation does not change. The `displayEnum` list, under the rule that a value
that unlocks an action stays strict: the frequency, the day of week, the section key, the Source kind, the resource
kind, the scan status, the attachment status, the Podcast Episode status, the chat attachment kind, the avatar source,
and the plan name in response schemas. The Podcast Episode speaker is no response enum, and the moderation category
is a request value, so neither is on it. Alternatives: a per-enum fallback table in `enums.ts`, rejected because a
fallback like `weekly` for an unknown frequency misinforms where `unknown` is honest; a mobile-side mapped type adding
`unknown` to every literal union, rejected because it widens the shared component props the same way with less
precision.

**5. Every client read goes through `readApiResponse`, and the app configures the adapter.** `packages/client`
gets `readApiResponse(schema, response)`, which applies `settings.toResponseSchema`, memoized per schema in a
`WeakMap`, and throws `ApiResponseError` naming the route when the parse fails. The web configures no adapter and the
app passes `toTolerantResponseSchema` beside an `onTolerantReadIssue` that records the route and the dropped count in
Sentry with no content. The casts the app reaches get contract schemas: the chat room message page, the room list,
the private chat conversation, the activity page, the team pages, the notes and comments, the profile, the topic
counts, the search results, and the podcast reads that still cast. A web-only read, such as the admin console, may
keep its inference and is listed as such in the registry. The screens that must fail visibly, each through its
query's error state with a retry: the Topic page, the Podcast Episode page, a Note, a chat room, Account, Activity,
Teams, a Team page, a Profile, Search, and the invite route, with the home Feed falling back to its persisted snapshot
and then the error state.

**6. A route registry in contracts is the one source the freeze serializes.** `packages/contracts/apiRouteContracts.ts`
maps each client capability, keyed `module.function` as the parity walk names it, to its method, path, and the
params, query, body, and response schemas, with `multipart` and `stream` markers for the upload and NDJSON routes and
the event schema for the room stream. `scripts/freeze-contract.ts` runs the parity discovery from `apps/mobile/app`,
fails if a reached capability has no entry, and writes `contracts/<app-version>.json` with `z.toJSONSchema` at
`io: "input"` for requests and `io: "output"` for responses, draft 2020-12, `unrepresentable: "any"`, and `$ref` for
cycles, reading the version from `app.config.ts`. The registry has a test that every key names an exported client
function and every path and method exists on the Hono app's route list. Alternative considered: recording routes by
running each client function against a stubbed fetch, rejected because each function needs its own arguments and
the recording proves nothing about response shapes.

**7. Compatibility is readers against writers, checked twice.** `contracts/releases.json` lists each app version
with `status` `submitted`, `released`, or `retired`, its platforms, and the date. `scripts/check-contract-freeze.ts`
fails when a listed, unretired version has no snapshot, and for every live snapshot runs
`scripts/contractCompatibility.ts` over the current and frozen JSON Schema: a response property the snapshot requires
must remain, must keep a type the snapshot accepts, and must not gain an enum value, since an installed reader has
no branch for it, while a new property, optional or required, passes; a request must still accept everything the
snapshot accepted, so a new required field, a narrowed type, or a removed enum value fails, while a new optional
field, a widened type, or a new enum value passes. The comparator covers the JSON Schema subset zod emits and fails
conservatively on anything it cannot decide, naming the capability and the path. The second check is behavioral:
`apps/api/contractCompatibility.test.ts` iterates the routes that have fixtures in `apps/api/contractFixtures.ts`,
calls the route in-process with the frozen request example over `stubConnectionPool` and `signInAs`, and validates
the response with Ajv 2020 against the frozen response schema, so a route that drifted in a way the schema did not
show still fails. Fixtures start from the routes whose tests already stub rows and the registry test names each route
without one. Both run in preflight, the comparator after the client parity check and the tests under `bun test`.
`contract:freeze --check` fails when a fresh freeze differs from the file, and the submit script runs it first.

**8. The first release removes the offers and a guard keeps them out.** `PlanCard` renders a purchase action only
when its handler is passed, `TopicScanFailure` links only when given a href, and the app passes neither. The app's
Plans screen keeps the cards and the cutoffs table with the current plan marked, the Account header keeps the plan
badge and loses the Upgrade and Manage plan buttons, the spend meter, topic settings card, scan alert, scan recap,
and edit topic fields keep their sentences without the link, and the failed-payment notice keeps its sentence
without the portal button. `scripts/check-purchase-paths.ts` reuses `clientParity.ts` discovery: the app must not
reach `billingClient.fetchCheckoutUrl` or `fetchBillingPortalUrl`, and no file under `apps/mobile` may contain a plans
path or a purchase label from `PURCHASE_COPY` in `packages/contracts/plans.ts` except the exceptions the script lists
with reasons: the Plans route itself, the user menu's Plans item that opens the read-only screen, and the sign-up
prompts, which lead to an account, not a purchase. The two billing capabilities get `deferred | Prompt 55` rows in
`parity.md`. The Account screen gains Privacy and Terms links in the web's order, opening the web pages in the browser
sheet, since the stores require both to be reachable from the app.

**9. App links come from one path list.** `packages/contracts/appLinkPaths.ts` lists the path patterns the app
implements. `documentsRoute` serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from
that list and the Doppler values `APPLE_TEAM_ID` and `ANDROID_SIGNING_FINGERPRINTS`, as `application/json`, cached an
hour, with the apple-app-site-association (AASA) file's `webcredentials` naming the same app, and answers 404 when a
value is unset so a dev stack never publishes a broken file. `app.config.ts` sets `ios.associatedDomains` to
`applinks:carlnotes.com` and `webcredentials:carlnotes.com`, and builds the Android `intentFilters` with `autoVerify`
from the same list. `toLinkedPath` runs `toPlatformPath` first, so the slug and query survive, then the sign-in gate,
and a listed path with no native route returns the `open-web` route, which opens the url in the browser sheet and goes
Home. A test asserts every listed pattern reaches a native route or the fallback. The web's root head emits the
`apple-itunes-app` meta with the current url as `app-argument` once `APP_STORE_ID` is set. The open `split-web-from-api`
change routes only the OAuth well-knowns to the api service; its routing list gets the two files when it applies, and
until then the one service serves them.

**10. EAS submits from Doppler through the sync, with remote version numbers.** `eas.json` gets
`cli.appVersionSource: "remote"`, `build.production.autoIncrement: true`, and submit profiles whose iOS fields come
from `ASC_APP_ID`, `APPLE_TEAM_ID`, `ASC_KEY_ID`, and `ASC_ISSUER_ID` and whose key files come from
`ASC_API_KEY_BASE64` and `PLAY_SERVICE_ACCOUNT_BASE64`. `scripts/submit-mobile.ts`, behind `bun run mobile:submit`,
runs under `doppler run --config prd`, runs `contract:freeze --check`, writes the App Store Connect key to a temporary
folder and the Play service account to `apps/mobile/play-service-account.json`, which is gitignored, runs `eas submit
--profile production --platform <ios|android>`, and removes the files. The store keys stay in Doppler and never enter an
EAS environment, since a submit runs on the machine under `doppler run`, so `sync-mobile-env.ts` is unchanged. Sentry's
`release` is `com.carlnotes.app@<version>+<build>` and `dist` is the update id or the build, set in `startMonitoring`,
so an EAS Update's frames resolve. The fingerprint policy stays: a native change changes the fingerprint and needs a
build, and the AGENTS.md says how to tell.

**11. The reviewer account is seeded by a root script in an explicitly chosen environment.**
`scripts/seed-reviewer-account.ts` exits with an error unless `--environment <name>` matches `DOPPLER_CONFIG`, reads
`REVIEWER_EMAIL` and `REVIEWER_PASSWORD` from Doppler and prints neither, creates the account through the Better Auth
server api or resets its password, marks the email verified and the Terms accepted, creates a Topic with the site's
own blog feed as its Source, starts a scan through the Temporal client and waits for its Findings and recap, writes
a Note, creates a Team with a room and one message, and follows a public Topic that has a published Podcast Episode,
so the reviewer can play one on the free plan. Rerunning refreshes the same account.

**12. The store artifacts are files in the repo, and the forms are the user's.** `apps/mobile/store/listing.md`
holds the Apple and Google copy in Carl's voice, `apps/mobile/store/data-inventory.md` lists what the app, the api,
PostHog, Sentry, and each native module collect for the privacy and data-safety forms, and
`apps/mobile/store/release-checklist.md` holds the acceptance list the QA tasks fill in. The encryption declaration
is `ITSAppUsesNonExemptEncryption: false` in `app.config.ts` after the audit confirms the app uses only TLS and the
system keychain. The docs "Get the app" page sits at the content root beside the quickstart and is named in the
Start here section.

## Risks / Trade-offs

- [The tolerant walker depends on Zod 4's definition shape] → The walker reads `_zod.def` behind one module with a
  test over every schema in the registry, so a zod upgrade fails one test instead of a screen.
- [A display enum's `unknown` reaches a web switch that never sees it] → `tsc` requires the branch on both apps, and
  the branch renders nothing or a neutral label. The web's strict parse never produces the value.
- [The registry drifts from the client] → The freeze fails on a reached capability without an entry, and the registry
  test fails on an entry whose function or route is gone.
- [The comparator is too strict and blocks a compatible change] → It names the capability and path, and a compatible
  change the comparator cannot read is fixed in the comparator, never by editing a snapshot.
- [Apple's AASA cache holds for days after a change] → The files ship with the api before the store build, and the
  path list is checked against Apple's CDN endpoint and `adb shell pm verify-app-links` in the acceptance list.
- [Remote version source has no number on the first run] → `eas build:version:set` seeds it once, documented in the
  AGENTS.md.
- [Raising the minimum strands a build that cannot update yet] → The console shows both minimums and the version
  traffic lives in PostHog, and the policy in the AGENTS.md says to raise only above a version whose traffic drained.
- [The `split-web-from-api` change moves documents to the web service] → Its routing list gains the two well-known
  files, and the api service keeps every path, so neither service answers 404.
- [The reviewer's own Topic on the free plan has no Podcast Episode] → The script follows a public Topic with a
  published one, and the review notes say where to find it.

## Migration Plan

1. Ship the api with the gate, the table, the console card, the well-known files, and the registry. The table is
   empty, so no build is gated, and the files answer 404 until the Doppler values are set.
2. Set the Doppler values, confirm the two files from Apple's CDN endpoint and from Android's verifier, and set the
   `APP_STORE_ID` constant in `packages/contracts/mobileApp.ts` once the record exists.
3. Freeze the first contract at the submission version, list it in `releases.json`, build, and submit.
4. Set each platform's minimum to the first released version after its traffic shows in PostHog.
5. Rollback: clear a platform's minimum from the console to lift the gate, mark a version retired to drop its
   snapshot, and the app links can be withdrawn by removing the Doppler values, which makes the files 404.
