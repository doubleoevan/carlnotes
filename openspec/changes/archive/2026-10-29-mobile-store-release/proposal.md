# Proposal

## Why

This change puts the compatibility controls and the submit path in place before the first store build ships. The first
build is the one every later control has to reach. The mobile app's pages, chat, notes, and podcast player have shipped,
and the next step is the first store build. A store build differs from every build so far. Once it is installed, its api
calls keep arriving for months. Nothing in the repo today keeps the api compatible with those calls, tells an old build
to update, or lets a tapped `https://carlnotes.com` link open the app. The first submission also needs what a store asks
for: a repeatable submit path, a reviewer account, listing copy, a data inventory, verified links, and a decision on
what the app may offer for sale.

The audit before this proposal found the pieces to build on. Every mobile transport already sends
`x-carlnotes-platform`, `x-carlnotes-app-version`, and `x-carlnotes-app-build` through the one `headers` function the
api client, the auth client, the chat stream, and the room event source share, and `traceRequest` already parses them.
EAS has development, preview, and production profiles on the fingerprint runtime policy with an empty submit section
and no remote build numbering. Sentry and PostHog already tag every mobile event with the platform, the OS, the model,
and the app version. The app opens `carlnotes://` links through `+native-intent.ts` and remembers a sign-in return
path, but has no associated domains, no intent filters, and no domain association files, so an `https` link opens the
web. The native Plans screen, the Account header's Upgrade and Manage plan buttons, the spend meter, the topic
settings card, the scan button's alert, and the edit topic fields all lead to Stripe checkout or the portal in a
browser sheet. Nothing parses a mobile response tolerantly: the shared client parses some responses with the strict
contract schemas and casts the rest, and an unknown enum value would fail a whole page.

## What Changes

- **Minimum app versions.** The api gains a per-platform minimum version, stored in Postgres and edited from the admin
  console without a deploy, cached through Redis for a minute. A request whose platform header is `ios` or `android`
  and whose app version is below the minimum gets a 426 with the minimum and that platform's store url. A request
  without mobile version metadata, the web included, is never gated. The api client reports the 426 to the app, which
  shows a blocking full-screen update notice in Carl's voice with the store button and a "Check again" action, over
  every screen, until a supported build runs. The Account screen shows the app version and build. Tests prove the
  typed client, the plain fetch, the chat stream, the room event source, and the auth client all send the version and
  all surface the 426.
- **Tolerant reads on mobile.** The shared client reads every response through one `readApiResponse` that applies the
  app's configured schema adapter. The web configures none and parses as it does today. The app configures
  `toTolerantResponseSchema`, a Zod 4 walker derived from the strict contract: a malformed list entry is dropped and
  the rest render, a display enum's unknown value parses to the shared `UNKNOWN_CASE`, an optional or nullable field
  that fails parses to its documented default, and every authorization, membership, identity, or destructive-action
  field stays strict, so a failure there fails the entry or the response instead of granting anything. The display
  enums that take the unknown case are declared once in `enums.ts`, their types include it, and every switch over one
  of them handles it. The responses the app reads that are typed by inference or cast today get contract schemas, so
  the freeze and the tolerant read work from one source. Request validation does not change. A required response that
  fails to parse shows the screen's error state with a retry, never a blank page or a pretended success, and the
  design names each such screen.
- **Contract freeze.** `bun run contract:freeze` writes `contracts/<app-version>.json`: for every api capability the
  app reaches, found by the client parity walk through shared core and direct imports, the route, the method, and the
  request and response schemas as standalone JSON Schema from `z.toJSONSchema`, drawn from a route registry in
  `packages/contracts` that the freeze keeps complete. `contracts/releases.json` names each submitted and released
  app version. Preflight fails when a listed version has no snapshot, when a current response schema drops a field,
  narrows a type, or extends an enum that a live snapshot froze, or when a current request schema adds a required
  field or narrows one a live snapshot accepted. Adding an optional response field or loosening a request passes.
  In-process `app.request` tests send each frozen request example and validate the response against the frozen
  schema with Ajv, over the existing fixtures and stubs, with no server or network. The first snapshot is captured
  before the first submission, each later submission freezes again, and a snapshot is retired only when
  `releases.json` marks its version retired, the minimum version is above it, and PostHog shows its traffic drained.
- **First-release payments.** The first store release offers nothing for sale. The app's Plans screen shows the plans
  and limits read-only with the current plan marked, the Account header loses Upgrade and Manage plan, the spend meter,
  the topic settings card, the scan alert, the scan failure recap, and the edit topic fields lose their plans links and
  keep their words, and the failed-payment notice keeps its text without the portal button. Entitlements, the plan and
  usage on Account, Terms, Privacy, and Close your account stay. A preflight guard, `scripts/check-purchase-paths.ts`,
  reuses the parity walk and fails if the app reaches checkout or the portal, or if a file under `apps/mobile` names the
  plans path or a `PURCHASE_COPY` label. It lists its exceptions with reasons. The app's Account screen gains the
  Privacy and Terms links the web Account page has. Prompt 55 decides what the app sells later and revises the guard
  then.
- **App links.** The api serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from
  Doppler values with the right content types and cache headers, and tests validate their shape. `app.config.ts` gains
  the associated domain and the Android intent filters for the paths the app implements: Home, Topic, Note, Podcast
  Episode, invite, search, profile, Activity, Team, the chat rooms, Teams, Account, and the read-only Plans. The native
  intent handler maps a web url through the same `toPlatformPath` the in-app links use, keeps the slug, query, and
  section context, sends a visitor to sign-in with the path remembered, and opens a listed path with no native route in
  the browser sheet. Terms, Privacy, docs, releases, blog, admin, MCP consent, and password reset stay with the web and
  are not listed. The web adds the App Store smart banner meta once the store id is known. Device checks cover installed
  and uninstalled, email and Messages, cold and warm.
- **Delivery.** `eas.json` gains remote version source, production auto-increment, and submit profiles whose
  credentials come from Doppler through the existing env sync. Root scripts `mobile:submit`, `contract:freeze`, and
  `reviewer:seed` join `mobile:build` and `mobile:update`. The Sentry release and dist are set from the app version,
  build, and update id. `scripts/seed-reviewer-account.ts` creates or refreshes a reviewer account in an explicitly
  chosen environment with a Topic, its Findings and recap, a Note, a Podcast Episode, and a Team room, on the free
  plan, reading the credentials from Doppler and printing none. The encryption declaration is set from the audited
  dependencies. `apps/mobile/store/` holds the listing copy in Carl's voice and the data inventory for the privacy
  and data-safety forms. `apps/mobile/AGENTS.md` and the README document build, test, freeze, submit, rollout,
  rollback, and minimum-version steps, and the docs site gains a "Get the app" page under Start here.
- **Release QA.** The acceptance list lists the unverified checks from earlier work: VoiceOver, the proposed Topic card
  with the iPhone SE keyboard, owner, member, editor, read-only follower, leader, and admin flows, a second account's
  Profile defaults, phones and tablets in both orientations with the keyboard, safe areas, larger text, and both
  palettes, Android device acceptance, and the PostHog and Sentry dashboards checked with real access.

## Capabilities

### New Capabilities

- `minimum-app-version`: the per-platform minimum, the 426 and its body, the blocking update notice, the version
  metadata on every mobile transport, the exemption for requests without it, and the version on the Account screen.
- `tolerant-client-reads`: the derived tolerant schema, list entry isolation, the unknown enum case, the default for a
  missing display field, the strict permission fields, and the screens that fail visibly.
- `api-contract-freeze`: the freeze script, the snapshot and release files, the route registry, the compatibility
  rules and preflight guard, the in-process compatibility tests, and the retirement policy.
- `app-links`: the domain association files, the associated domains and intent filters, the web-to-native path
  mapping, the web fallback, the sign-in return, and the smart banner.
- `mobile-store-delivery`: the submit profiles and scripts, build numbering, the Sentry release, the EAS Update rule,
  the freeze at submission, the reviewer account script, the store artifacts, and the release acceptance list.

### Modified Capabilities

- `mobile-app`: "Builds and values stay in Doppler and EAS" gains the submit profiles, remote build numbering, the
  associated domain, the intent filters, and the encryption declaration.
- `subscription-billing`: the app's first store release offers no purchase and keeps entitlements, with the guard that
  keeps a purchase path out of the app's reach.
- `mobile-feed`: "Plans opens to a visitor" becomes the read-only Plans screen: a visitor's action leads to sign-up and
  a user sees the current plan marked with no purchase action.
- `docs-site`: Start here lists three pages, the "Get the app" page after the quickstart.

## Impact

- `packages/contracts`: `appVersions.ts` (version compare, the 426 body, the store urls), `APP_STORE_ID` (a constant in
  `mobileApp.ts`), the tolerant schema walker and `UNKNOWN_CASE`, the api route registry, and response schemas for the
  routes the app reads by cast today.
- `packages/client`: `readApiResponse`, the `onAppVersionOutdated` setting, and every read moved onto a schema.
- `packages/core`: the update notice copy and store, the plans and account components without purchase actions,
  the unknown-case branches in display switches.
- `apps/api`: the minimum version gate after `traceRequest`, the `mobile_minimum_versions` table and migration, the
  admin console routes and card, the two well-known documents, and the compatibility tests.
- `apps/mobile`: the update notice screen, the version line on Account, the Privacy and Terms links, the native
  intent mapping, `app.config.ts` and `eas.json`, the stories for the new states, and `store/`.
- `apps/web`: the admin console card, the smart banner meta, and the shared Plans page unchanged in behavior.
- `scripts/`: `freeze-contract.ts`, `check-contract-freeze.ts`, `check-purchase-paths.ts`,
  `seed-reviewer-account.ts`, and the preflight steps that run them.
- Root: the `contracts/` folder with its snapshots and `releases.json`, and `ajv` as a dev dependency.
- Doppler, names only: the Apple team id, the Android signing fingerprints, the App Store Connect and Play submit
  credentials, and the reviewer account's email and password.
- Outside the repo: the App Store Connect and Play Console records, the test tracks, and the store forms, which the
  user completes from the artifacts this change writes.
