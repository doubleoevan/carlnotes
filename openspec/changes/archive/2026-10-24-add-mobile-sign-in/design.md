## Context

The api's Better Auth instance in `apps/api/auth.ts` signs the web in with email and password, Google, GitHub, and
Apple. Its `trustedOrigins` is a function, `toTrustedOrigins(request)`, which adds the LAN origins in dev and Apple's
origin on Apple's posted callback alone. Its plugins are `jwt`, the MCP oauth server, and `cimd`. Its hooks are
`beforeCredentialRequest` and `afterAuthRequest`, and its rate limit names the credential paths and `/oauth2/register`.
The Apple provider already names `com.carlnotes.app` as its ID token audience, so a native ID token verifies today.

`packages/client/authClient.ts` builds the auth client at module load, with no base url, for the browser's own origin.
Thirty-nine web modules, the two core hooks `useAvatar` and `useUsernameChange`, the Storybook mock, and the MCP card
alias import it as the object `authClient`. `packages/client/apiClient.ts` holds `configureApiClient`, which an app
calls once with the base url and `showError`; the web calls it in `router.tsx` at module scope, the mobile app in
`app/_layout.tsx` at module scope. Counted today, `@carlnotes/client` makes 107 typed `hc` calls, and 20 plain `fetch`
calls: 14 through `toApiUrl`, and 6 with a bare `/api/...` path that ignores the configured base url, in `chatClient`
(3), `chatRoomClient` (2), and `voiceClient` (2 through one retry helper). The two `EventSource` streams live in the web
app and send bare paths too.

The mobile app is the scaffold the `add-mobile-app` change left: one screen, the api client configured in the root
layout, no sign-in, no secure storage. React Native has no cookie store, so a session cookie the api sets reaches no
later request on its own.

Better Auth 1.7.11's Expo integration, read from the `@better-auth/expo` source at that tag:

- The server plugin `expo()` has one option, `disableOriginOverride`. Its `onRequest` copies an `expo-origin` header
  into `origin` on a request that has no `origin`. Its `init` adds `exp://` to the trusted origins only when `NODE_ENV`
  is `development`, which the api never sets. Its after hook, on a `/callback*` response whose redirect is a trusted
  non-http url, appends the response's `set-cookie` as a `cookie` query parameter to that redirect. It adds `GET
  /expo-authorization-proxy`, which sets the oauth state cookie in the system browser before sending it to the provider.
- The client plugin `expoClient()` keeps a cookie store and the last session in `expo-secure-store`, sends the cookie
  store as the `cookie` header with `credentials: "omit"` and the scheme url as `expo-origin` on every request through
  the auth client, stores every `set-cookie` whose name starts with a `cookiePrefix` entry, seeds `useSession` from the
  stored session before the first `/get-session` answers, and clears the cookie store and the cached session on
  `/sign-out`. It opens a social sign-in in `expo-web-browser` and reads the session from the `cookie` query parameter
  when the browser returns to the app. It exports `getCookie()` for a fetch the app makes itself. On a 401 from
  `/get-session` the in-memory session becomes null and the stored copies stay.
- Better Auth's origin check validates the `origin` of every non-GET request that sends a cookie against the trusted
  origins, and the email sign-in and sign-up paths validate it even without a cookie. A host-less pattern such as
  `carlnotes://` trusts every url of that scheme, callbacks like `carlnotes:///settings?cookie=...` included.
- A native Apple sign-in posts `signIn.social({ provider: "apple", idToken: { token, nonce, user } })`. The provider
  verifies the token for the audience `appBundleIdentifier`, compares the ID token's nonce with the raw nonce or its
  SHA-256 hex, and takes the name from `idToken.user.name`, the same field the web's posted callback gives it.
- `@better-auth/expo/client` imports `expo-constants`, `expo-linking`, and `react-native` at module top, so it cannot
  enter a universal package.

Device attestation, read from Expo's and the platforms' documentation:

- The Expo module is `@expo/app-integrity` 58.0.2. On iOS, `generateKeyAsync()` returns a key id and
  `attestKeyAsync(keyId, challenge)` returns a base64 CBOR attestation, with the module hashing the challenge string
  with SHA-256 as the client data hash. App Attest is unavailable on the simulator. On Android,
  `prepareIntegrityTokenProviderAsync(cloudProjectNumber)` then `requestIntegrityCheckAsync(requestHash)` returns a Play
  Integrity standard token, with the request hash included verbatim. Both throw an `ERR_APP_INTEGRITY_*` error where the
  platform cannot attest.
- Apple's server verification is nine steps over the attestation's certificate chain, nonce, key id, app id, counter,
  and environment. A development-signed build attests in the development environment, with the `appattestdevelop`
  aaguid. TestFlight and the App Store use production. A build distributed ad hoc follows its entitlement.
- Google decodes a standard token at `playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken` with a service
  account on the Cloud project linked in Play Console. A build that Play did not install reads as
  `UNRECOGNIZED_VERSION`, and an emulator does not meet device integrity, so neither a development build nor the
  emulator passes.

App Review guideline 5.1.1(v) requires an app that creates accounts to let a user delete the account in the app.

## Goals / Non-Goals

**Goals:**

- A visitor signs in to the app with Apple, Google, or email and password, or creates an account by email, and every api
  request from the app sends the session.
- The web behaves exactly as today: the same client objects, the same cookies, the same Turnstile gate.
- The signup route keeps one rule, the `signup_gate` cookie, and the app's gate sets it from device attestation.
- The app opens signed in with no loading state, and a revoked session returns the user to the sign-in screen once.
- Sign out and close account live in the app.

**Non-Goals:**

- GitHub on mobile, which comes with the account change.
- The `EventSource` streams, which the chat change handles.
- The public screens for a visitor without an account, which the browsing change opens.
- Linking a second provider to an account from the app.
- Persisting App Attest keys per device and asserting per request. The gate attests once per sign-up.

## Decisions

### 1. The `expo()` plugin goes first, and one pattern trusts the app

`apps/api/auth.ts` adds `expo()` as the first entry of `plugins`, with the origin override on. The override runs in
`plugins` order among the plugins' `onRequest` hooks, after the rate limiter and before every endpoint middleware and
before `hooks.before`, so first keeps it ahead of anything else that reads the origin.

`toTrustedOrigins` adds `MOBILE_APP_SCHEME_ORIGIN`, `carlnotes://`, in every environment, and `exp://` only when
`DOPPLER_ENVIRONMENT` is `dev`, beside the LAN origins. Better Auth's matcher treats a host-less scheme pattern as
"every url of this scheme", so the one pattern `carlnotes://` covers the app's origin header, the sign-in's
`callbackURL` (`carlnotes:///`), and the callback redirect that includes the session cookie. No list of deep-link paths
is kept, and nothing is added for a path later. `exp://` covers a dev server url of Expo Go's shape, which a development
client may report; the plugin's own `NODE_ENV` rule never fires here, so ours is the one rule. The new constant lives in
`@carlnotes/contracts/mobileApp.ts` beside the bundle identifier, and `app.config.ts` reads the scheme from it.

How the override meets the rest of the auth config:

- The MCP oauth plugin and `cimd` see browser requests, which have an `origin`, so the override never touches them. An
  MCP client registering with a loopback redirect is still inferred native by the MCP plugin on its own rule.
- `beforeCredentialRequest` and `afterAuthRequest` run after the override and see `origin: carlnotes://`. Neither reads
  the origin today. `afterAuthRequest` gains two things: a `/sign-in/social` request with an `idToken` body reports
  `login_completed` with the provider as its method, which the callback path reports today and the native path does not,
  and both sign-in and signup reports send `entryPoint: "mobile"` for a request with an `expo-origin` header, through
  one `toEntryPoint(headers)` beside `toLoginMethod`. The MCP connection report is unchanged.
- The rate limit's custom rules key on the client address and name paths, so the app's email sign-in and sign-up share
  the web's ten a minute. `/expo-authorization-proxy` is a GET under the default limit.
- The email sign-in and sign-up paths validate the origin even on a cookie-less first request. `carlnotes://` is
  trusted, so they pass. Apple's posted callback keeps its own rule, trusted on its path alone.
- Trusting the scheme everywhere also lets Better Auth accept it in every redirect field, and any installed app can
  claim a scheme. `beforeCredentialRequest` rejects a `callbackURL`, `redirectTo`, `errorCallbackURL`, or
  `newUserCallbackURL` on the scheme on any path but `/sign-in/social`, so a reset link or a verification never opens
  whichever app holds it. The plugin's `/expo-authorization-proxy` sets the oauth state cookie from its url, which a web
  page could point at a state of its own choosing. The same hook holds the proxy to the providers' sign-in pages
  (Google, GitHub, and Apple) and rejects a browser that already holds a session, so the proxy serves the app's own
  sign-in browser alone.

Alternatives: a list of `carlnotes://path` patterns per screen (rejected: every new screen would edit the api, and the
matcher already scopes a host-less pattern to the scheme); trusting `exp://` in every environment (rejected: a
production api has no Expo dev server to trust).

### 2. `authClient()` is a function an app configures once

`packages/client/authClient.ts` exports `configureAuthClient(settings)` and `authClient()`, in the shape of
`configureApiClient` and `apiClient()`:

- `authClient()` returns the configured client, or builds the browser's own client on the first call if nothing was
  configured: `createAuthClient({ plugins: [inferAdditionalFields<typeof auth>()] })`, today's client exactly. The web
  configures nothing.
- `configureAuthClient({ baseURL, plugins })` builds the client with `inferAdditionalFields<typeof auth>()` first and
  the app's plugins after it, stores it, and returns it. It throws an error if `authClient()` already built or handed
  out a client, so configuring after the first use is a crash on the first launch in development instead of a client
  that half the app never saw.
- The type the shared code sees is `AuthClient`, the client with `inferAdditionalFields` alone, so `session.user.role`,
  `plan`, `username`, `avatarSource`, and the rest type as today. `configureAuthClient` is generic over the app's
  plugins and returns the client typed with them, so the mobile app's own handle has `getCookie()`. The app keeps that
  handle in `apps/mobile/src/authClient.ts`, and shared code never needs it.
- The first use is a call inside a hook or a handler, never module load: `useAvatar`, `useUsernameChange`,
  `requireSession`, and every web importer call `authClient()` where they used the object. The mobile root layout calls
  `configureAuthClient` at module scope right after `configureApiClient`, before any screen module runs a hook, which is
  the same guarantee the api client has today. The web's `router.tsx` needs nothing.
- The sweep is mechanical: `authClient.` becomes `authClient().` in the 39 web modules and 2 core hooks. The Storybook
  mock and the MCP card alias export a function returning their stub, so an aliased import keeps working.

Alternatives: a `Proxy` object that forwards to the configured client (rejected: it keeps the import unchanged at the
cost of a mechanism a reader has to decode, and `useSession` through a proxy hides where the hook comes from); passing
the client into the core hooks as a parameter (rejected: every page would thread it).

### 3. The api client sends an app's headers and reports a 401

`ApiClientSettings` gains three optional fields, each left out by the web:

- `headers: () => Record<string, string> | Promise<Record<string, string>>`, the headers every request sends. The typed
  client passes it to `hc` as its `headers` option, which `hono/client` resolves per request, sync or async.
- `credentials: RequestCredentials`, passed to `hc` as `init.credentials` and to every plain fetch. The app sets
  `"omit"`, since a native fetch with `include` lets the platform's own cookie store conflict with the `Cookie` header
  the app sets. The web keeps the browser default.
- `onUnauthorized: () => void`, called once per response whose status is 401, from a `fetch` wrapper the typed client
  takes as its `fetch` option and from the plain fetch.

`fetchApi(path, init)` is the one plain fetch: it prefixes the configured base url, merges the configured headers under
the call's own, sets the configured credentials, and reports a 401. Every `fetch(toApiUrl(...))` becomes `fetchApi`, and
so do the six bare-path fetches, which reach the base url for the first time. `toApiUrl` stays exported for a url the
platform loads itself, such as an avatar image or an `EventSource`. No client module reads or sends a cookie.

The app configures `headers` to return `{ cookie: await mobileAuthClient.getCookie() }`, the cookie store the Expo
client keeps, so a typed call and a plain fetch send the same session cookie the auth client sends.

Alternatives: one `fetch` setting that the app wraps itself (rejected: the brief asks for headers on every request, and
a wrapper per app puts the cookie rule in the app instead of the client); reading the cookie in each client module
(rejected: a hundred call sites).

### 4. Three sign-in methods, each ending in the same session

- **Apple on iOS** opens the native sheet through `expo-apple-authentication`. The app makes a random nonce with
  `expo-crypto`, gives the sheet its SHA-256 hex, and posts `signIn.social({ provider: "apple", idToken: { token, nonce,
  user } })` with the raw nonce and the sheet's `fullName` as `user.name`. Better Auth verifies the token for the bundle
  identifier the Apple provider already names, compares the nonce by its hash, and reads the name from `idToken.user` as
  it reads the web callback's `user` field, so the first authorization's name is kept with no new route.
  `appleProvider.ts` does not change. `app.config.ts` sets `ios.usesAppleSignIn`, which the module's config plugin
  needs.
- **Apple on Android and Google on both platforms** call `signIn.social({ provider, callbackURL: "/" })`. The Expo
  client rewrites the callback to `carlnotes:///`, opens the api's `/expo-authorization-proxy` in `expo-web-browser`,
  and on return stores the session from the `cookie` query parameter. Google's existing OAuth app needs nothing: the
  provider still returns to the api's https callback, and the api redirects to the scheme. Apple's web flow is the one
  the web uses, Services ID and posted callback included.
- **Email and password** call `signIn.email` natively.
- **Forgot password** opens `${SITE_URL}/reset-password` in the system browser. The reset ends signed in on the web and
  revokes every session, which the app sees as Decision 7 describes.

A sign-in that does not open, or that the visitor abandons in the browser or the sheet, shows `OAUTH_ERROR_TEXT`, the
web's line, under the buttons. `signIn.social` resolves without navigating on native, so each handler re-reads nothing:
the session store updates, and the router guard moves the user.

### 5. Email sign-up passes an app gate that sets the same cookie

**The form.** `app/sign-up.tsx` asks for email, then password, the web's two fields in the web's order, and parses them
with `signupCredentialsPayload` from `@carlnotes/contracts/signupGate.ts`, new, which holds `MIN_PASSWORD_LENGTH` (12,
moved from `apps/api/auth.ts`, which reads it from there) and the two app gate payloads. The web's password input gets
the same constant as its `minLength`, which changes nothing a valid signup does. The signup sends `name` as the email's
local part, as the web does.

**The gate routes**, in `apps/api/appSignupGate.ts` beside `/api/signup-gate`:

- `POST /api/signup-gate/app-challenge` returns `{ challenge }`, a signed single-use token: a random nonce and an expiry
  under the auth secret's HMAC, with the nonce recorded in Redis for five minutes. `signupGate.ts`'s `signGateToken` and
  `verifyGateToken` become `signSingleUseToken(purpose)` and `verifySingleUseToken(purpose, token)`, with the purpose in
  the signature and the Redis key, and the gate token and the challenge are the two purposes. A challenge passes once, a
  replay finds its nonce consumed, and a Redis outage passes the signature and expiry alone, the gate's own rule.
- `POST /api/signup-gate/app` takes `appSignupProofPayload`, a discriminated union on `platform`: `ios` with
  `challenge`, `keyId`, and `attestation`; `android` with `challenge` and `integrityToken`; `development` with
  `challenge`. It consumes the challenge first, verifies the proof for its platform, and on success sets the
  `signup_gate` cookie exactly as the web's gate route does, through one `setGateCookie(context)` both routes call, and
  returns `{ ok: true }`. A rejected proof returns 400 with the reason, and the reason and platform are reported as a
  `signup_gate_rejected` event, so a failure rate shows before anyone writes in.
- Each route sits under its own per-address limit of ten a minute through `rateLimit.ts`, the credential paths' number,
  so a sign-up attempt spends one hit on each. Every Android proof spends one of Google's ten thousand daily decodes,
  and a token that is not a JWE of five parts is rejected before Google sees it.

**How the gate reaches the signup request.** The signup route's one rule stays: the create hook reads the `signup_gate`
cookie and verifies it. The app sends the cookie through the Expo client's cookie store. The app calls `POST
/api/signup-gate/app` through `authClient().$fetch` with the absolute url, in `passAppSignupGate` beside
`passSignupGate` in `packages/client/authClient.ts`, and configures `expoClient` with `cookiePrefix: ["better-auth",
GATE_COOKIE_NAME]`, so the response's `Set-Cookie: signup_gate=...` is stored in the cookie store and the next
`/sign-up/email` request sends `cookie: better-auth.session_token=...; signup_gate=...`. The cookie's five-minute
`Max-Age` ages it out of the cookie store as it does out of the browser. `GATE_COOKIE_NAME` moves to the contracts
module so the app can name it, beside the signup CTA cookie name that already lives in contracts.

**App Attest verification**, in `apps/api/appAttest.ts`, Apple's steps in order: decode the CBOR attestation with
`cbor2`; parse the `x5c` chain with `node:crypto`'s `X509Certificate` and verify it to Apple's App Attest root, whose
PEM is a constant in the module; compute the client data hash as the SHA-256 of the challenge string, since the module
hashes the string; compute the nonce as the SHA-256 of `authData` plus that hash and compare it with the certificate
extension `1.2.840.113635.100.8.2`; compare the SHA-256 of the leaf's uncompressed public key with the key id; compare
the RP ID hash with the SHA-256 of `${APPLE_TEAM_ID}.${MOBILE_APP_BUNDLE_IDENTIFIER}`; require a zero counter; require
the production aaguid, or the development aaguid too when `DOPPLER_ENVIRONMENT` is `dev`; and compare the credential id
with the key id. The verifier takes the root certificate and the app id as parameters, so its tests build their own
root, intermediate, and leaf with the nonce extension and prove a valid attestation passes while a forged chain, a wrong
nonce, a wrong app id, a nonzero counter, and a replayed challenge are rejected. The gate attests a fresh key per
sign-up and stores nothing: a sign-up is a once-per-install event, far under the rate Apple throttles, and no table or
migration is needed. If a later change gates more actions, it stores the key id and asserts.

**Play Integrity verification**, in `apps/api/playIntegrity.ts`: sign a service account assertion with `jose` from
`PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY`, the JSON key in Doppler, trade it for an access token at Google's token endpoint
and cache the token until it expires, post the integrity token to `decodeIntegrityToken` for
`MOBILE_APP_BUNDLE_IDENTIFIER`, and require `requestDetails.requestPackageName` to be the package,
`requestDetails.requestHash` to be the challenge, `requestDetails.timestampMillis` to be inside five minutes,
`appIntegrity.appRecognitionVerdict` to be `PLAY_RECOGNIZED`, and `deviceIntegrity.deviceRecognitionVerdict` to include
`MEETS_DEVICE_INTEGRITY`. The app passes the challenge itself as the request hash, which Google includes verbatim and
which is under its 500 bytes. The tests stub the two fetches and prove a passing verdict passes and each failing field
is rejected. Google protects a standard token against replay on its side, and the consumed challenge does on ours.

**Development builds.** A build with `__DEV__` sends the `development` proof and attests nothing, since the simulator
has no App Attest and the emulator and a sideloaded build never read as Play-recognized. The api accepts the
`development` proof only when `DOPPLER_ENVIRONMENT` is `dev`, so a production api rejects it and a development build
cannot create an account there by email. The real attestation is first exercised by a `preview` build, which is not
`__DEV__`, reaches the production api, and attests: App Store and TestFlight builds attest in Apple's production
environment on their own, and `app.config.ts` sets the entitlement
`com.apple.developer.devicecheck.appattest-environment` to `production`, so an ad hoc preview build does too. Android's
preview builds attest from the Play internal test track. The user's manual steps cover both.

**A failed or unsupported attestation.** A release build whose attestation throws, or whose proof the gate rejects,
shows `APP_SIGNUP_GATE_FAILED_TEXT`, Carl saying he could not verify this install, with a button that opens
`${SITE_URL}/signup` in the system browser, where Turnstile gates the sign-up. The Turnstile WebView fallback the brief
allows is not built: the two attestations cover every store install, what remains is a device without Google Play or a
sideloaded build, and the web's sign-up already serves those with the gate it has, at the cost of one browser hop. The
reported rejection rate decides whether the WebView is worth its dependency and its hosted page later. The Apple and
Google verifiers are each off without their values, so a proof for a platform with no values is rejected and reported
the same way, and the api starts without them.

Alternatives: a second place the signup hook reads the token from, such as a header (rejected: two rules for one gate);
returning the gate token in the body and sending it as a header the app merges into the cookie (rejected: the Expo
client assigns the cookie header from its cookie store, so a header the call sets is lost); storing App Attest keys per
device (rejected: a table for a once-per-install event); `node-app-attest` (rejected: it takes no root certificate, so
no test could prove its rejections, and it is one maintainer's package).

### 6. Screens, the guard, and shared copy

- Routes: `app/sign-in.tsx`, `app/sign-up.tsx`, `app/index.tsx` (the home screen), and `app/settings.tsx`. The root
  layout wraps them in `Stack.Protected`: the home and settings screens behind `guard={isSignedIn}`, the sign-in and
  sign-up screens behind `guard={!isSignedIn}`, where `isSignedIn` reads `authClient().useSession()`. The Expo client's
  cached session seeds that hook before the first fetch, so a user sees the home screen with no loading state.
- The sign-in screen: the three buttons in the web's order, Google, then Apple, then **Continue with email** opening the
  email form, **Forgot password?**, and the sign-up link. Apple's button follows the Human Interface Guidelines: the
  Apple logo, **Continue with Apple**, the same height and corner radius as the other buttons, and black on light or
  white on dark, which is what App Review checks. On Android the same button opens the browser flow. The buttons and
  fields draw from Nightshift through Uniwind and meet the accessibility bar.
- The home screen keeps the scaffold's content and adds the user's name, their avatar through `useAvatar`, and a
  settings link. The avatar image url is `toApiUrl(`/api/avatars/${userId}?v=${avatarVersion}`)`, the public avatar
  route the web loads, with the initials from `toAvatarInitials` and `toAvatarTint` when there is no image.
- The settings screen: **Sign out**, one press as the web's menu item is, and **Close account**, which confirms with the
  web's dialog words, calls `sendDeleteAccount`, then `signOut` to clear the cookie store, and lets the guard show the
  sign-in screen. The codebase closes an account; App Review's "delete" is the same action, so the copy says close.
- Shared copy moves to `packages/core/lib/sessionCopy.ts`, the DOM-free home the web and the app both import:
  `OAUTH_ERROR_TEXT` from `SessionLayout.tsx`, the sign-out failure line from `signOut.ts`, the close-account title,
  body, confirm, and cancel labels from `AccountSettings.tsx`, `REQUEST_FAILED_TEXT` ("That didn't reach Carl. Try
  again.", which `useUsernameChange` and `AccountSettings` each hold today), and the new `APP_SIGNUP_GATE_FAILED_TEXT`.
  The web imports them from there.

### 7. The session's lifetime

- The Expo client stores the session in `expo-secure-store` under the `better-auth` prefix and seeds `useSession` from
  it, so the app opens signed in and the first `/get-session` refreshes it in the background.
- A revoked session: the api's session middleware reads no session for the dead cookie, the route returns 401, the api
  client calls `onUnauthorized`, and the app's handler calls `mobileAuthClient.signOut()` if the client still holds a
  session. The Expo client clears the cached session before the sign-out request and the cookie store when it succeeds,
  the session store becomes null, and the guard shows the sign-in screen. The handler does nothing if the session is
  already null, so a burst of 401s from one screen signs out once, and the sign-in screen makes no signed-in request, so
  nothing loops.
- Sign out from settings is the same call, and a sign-out that fails shows the web's line and leaves the user where they
  are.

### 8. Values and setup

- Doppler, dev and prd: `PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY`, the service account's JSON key, server-only. The api runs
  without it, with Android proofs rejected. `APPLE_TEAM_ID` already exists for the client secret and names the App
  Attest app id.
- Doppler, public, inlined by Metro: `EXPO_PUBLIC_PLAY_CLOUD_PROJECT_NUMBER`, the Cloud project number
  `prepareIntegrityTokenProviderAsync` takes. `scripts/sync-mobile-env.ts` adds it to the values it moves into EAS.
- `.env.example`, the README's Development section, and the Apple setup notes name each.
- Outside the repo, the user turns on App Attest for the App ID, links a Cloud project to the Play Console app with the
  Play Integrity api on, and creates the service account. The development client is rebuilt, since the change adds
  native modules.

## Risks / Trade-offs

- [Development builds never attest] → A `preview` build attests against production, and the manual steps sign up from
  one on each platform before release. The rejection event shows a broken verifier in production within the first
  sign-ups.
- [Google's decode quota is ten thousand a day] → The gate routes are limited to ten a minute per address, and a
  rejected proof consumes its challenge, so a loop from one address stops at the limit.
- [A development client reports an `exp://` origin] → `exp://` is trusted in dev, where that client runs, and the
  `carlnotes://` pattern covers the scheme a development client reports when it uses its own.
- [The browser sign-in's callback returns the session cookie on a custom scheme] → This is the Expo plugin's flow, and
  on Android another installed app can register the same scheme and receive that redirect. The callback redirect is the
  one place the scheme is accepted, every other redirect field rejects it, and the sign-in is one the visitor started
  moments before on the same device. Verified App Links and Universal Links, which bind `https://carlnotes.com` paths to
  the app, close it, and are recommended as a change of their own.
- [The sweep touches 39 web files] → Each edit is `authClient.` to `authClient().`, Biome and `tsc -b` catch a missed
  one, and the web's behavior does not change.
- [The stored cookie outlives a revoked session] → The handler signs out, which clears it, and a cold start with a stale
  cached session is corrected by the first `/get-session`. A dead cookie that stays in the cookie store authenticates
  nothing.
- [App Attest's parsing is hand-written] → It follows Apple's numbered steps over `cbor2` and `node:crypto`, and the
  synthetic-chain tests prove each rejection. A real attestation from a `preview` build is the end-to-end check.
- [A visitor without Google Play cannot sign up by email in the app] → The web's sign-up is one tap away, and the
  rejection event measures how often it happens.

## Migration Plan

1. Ship the api, the client packages, and the web sweep together: the web is unchanged in behavior, the api accepts the
app's origin and gate, and nothing requires the app to exist. 2. Add the Doppler values and the Apple and Google setup,
then run `mobile:env:sync`. 3. Rebuild the development client, verify the three sign-ins and the development sign-up on
the simulator and the emulator, then a `preview` build on a device for the real attestation on each platform. 4.
Rollback: the web and the api keep working with the Expo plugin in place, since it only acts on requests that send
`expo-origin`. Reverting the app's EAS Update returns the scaffold screen.

## Open Questions

None that block the apply. The audience of a native Apple ID token is the bundle identifier the Apple provider already
names, and the Services ID path is untouched, so no Apple change is needed beyond the App Attest capability.
