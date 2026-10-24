## 1. Contracts and shared copy

- [x] 1.1 Add `MOBILE_APP_SCHEME` and `MOBILE_APP_SCHEME_ORIGIN` to `packages/contracts/mobileApp.ts`, and read the
  scheme from it in `apps/mobile/app.config.ts`
- [x] 1.2 Add `packages/contracts/signupGate.ts`: `GATE_COOKIE_NAME` (moved from `apps/api/signupGate.ts`),
  `MIN_PASSWORD_LENGTH` (moved from `apps/api/auth.ts`), `signupCredentialsPayload`, `appSignupChallengeResponse`, and
  `appSignupProofPayload` (the `ios`, `android`, and `development` union), with tests for the payloads
- [x] 1.3 Add `packages/core/lib/sessionCopy.ts` with `OAUTH_ERROR_TEXT`, `SIGN_OUT_FAILED_TEXT`,
  `CLOSE_ACCOUNT_CONFIRMATION`, `REQUEST_FAILED_TEXT`, and `APP_SIGNUP_GATE_FAILED_TEXT`, and import them in
  `SessionLayout.tsx`, `signOut.ts`, `AccountSettings.tsx`, and `useUsernameChange.ts` in place of their literals
- [x] 1.4 Give the web's signup password input `minLength={MIN_PASSWORD_LENGTH}`, and have `apps/api/auth.ts` read the
  constant from contracts

## 2. The client package

- [x] 2.1 Extend `ApiClientSettings` in `packages/client/apiClient.ts` with `headers`, `credentials`, and
  `onUnauthorized`, pass `headers`, `init.credentials`, and a 401-reporting `fetch` to `hc`, and add `fetchApi(path,
  init)`
- [x] 2.2 Replace every `fetch(toApiUrl(...))` in `packages/client/*Client.ts` with `fetchApi`, and route the six
  bare-path fetches in `chatClient.ts`, `chatRoomClient.ts`, and `voiceClient.ts` through it
- [x] 2.3 Test in `apiClient.test.ts`: a typed call and a plain fetch send the configured headers and credentials, a 401
  calls `onUnauthorized` once per response, and a client configured with none adds no header
- [x] 2.4 Rewrite `packages/client/authClient.ts`: `configureAuthClient(settings)` generic over the app's plugins, which
  throws an error after a first use, `authClient()` building the browser's own client on first call, the `AuthClient`
  type, `passSignupGate` unchanged, and `passAppSignupGate(proof)` through `authClient().$fetch` at the absolute gate
  url
- [x] 2.5 Test in `authClient.test.ts`: `authClient()` before configuration is the default client, a configured client
  is the one every later call returns, configuring after a use throws, and `useAvatar` and `useUsernameChange` read the
  configured client
- [x] 2.6 Update `packages/client/AGENTS.md` and `packages/core/AGENTS.md` for `fetchApi`, the settings, `authClient()`,
  `configureAuthClient`, and `sessionCopy.ts`

## 3. The web sweep

- [x] 3.1 Change `authClient.` to `authClient().` in the 39 web modules and the 2 core hooks, and `type AuthClient`
  where a module typed the object
- [x] 3.2 Export `authClient` as a function from `apps/web/.storybook/mocks/authClient.ts` and
  `apps/web/src/mcpCards/cardAuthClient.ts`, and fix `apps/web/.storybook/fixtures.ts`'s type import
- [x] 3.3 Run `bun run build:ui` and the Storybook tests, and confirm the web's sign-in, sign-up, and sign-out are
  unchanged in the browser on `:5173`

## 4. The api

- [x] 4.1 Add `@better-auth/expo` to `apps/api/package.json`, put `expo()` first in `plugins`, and extend
  `toTrustedOrigins` with `MOBILE_APP_SCHEME_ORIGIN` always and `exp://` in dev, with tests for the callback url, the
  cookie-bearing app request, and the dev-only `exp://`
- [x] 4.2 In `authHooks.ts`, report `/sign-in/social` with an `idToken` body by its provider, and add
  `toEntryPoint(headers)` so `login_completed` and `signup_completed` say `mobile` for a request with `expo-origin`,
  with tests
- [x] 4.3 Generalize `signupGate.ts` into `signSingleUseToken(purpose)` and `verifySingleUseToken(purpose, token)`, keep
  the gate token on it, add the challenge purpose, and add `setGateCookie(context)` that both gate routes call
- [x] 4.4 Add `apps/api/appAttest.ts`: the CBOR decode with `cbor2`, the chain to Apple's root with `@peculiar/x509`,
  and Apple's steps as `verifyAppAttestation({ attestation, keyId, challenge, appId, rootCertificate,
  isDevelopmentAllowed })`, with the root PEM as a constant
- [x] 4.5 Test `appAttest.ts` with a generated root, intermediate, and leaf with the nonce extension: a valid
  attestation passes, and a wrong chain, nonce, key id, app id, counter, and environment are each rejected
- [x] 4.6 Add `apps/api/playIntegrity.ts`: the service account access token through `jose`, cached until it expires, the
  decode call, and `verifyPlayIntegrityToken({ integrityToken, challenge })` over the verdict fields, off without the
  key
- [x] 4.7 Test `playIntegrity.ts` with stubbed fetches: a passing verdict passes, and each failing field, a stale time,
  and a missing key are rejected
- [x] 4.8 Add `apps/api/appSignupGate.ts` with `POST /api/signup-gate/app-challenge` and `POST /api/signup-gate/app`:
  consume the challenge, verify by platform, accept `development` in dev alone, set the gate cookie, reject with 400 and
  report `signup_gate_rejected`, under a ten-a-minute address limit in `rateLimit.ts`, and mount it in `api.ts`
- [x] 4.9 Test the gate routes: a valid proof sets the cookie that a signup then passes, a replayed challenge, a forged
  proof, a missing proof, and the development proof outside dev are rejected, and the web's `/api/signup-gate` and its
  signup are unchanged
- [x] 4.10 Update `apps/api/AGENTS.md` for the plugin, the origins, the gate modules, and the reporting

## 5. The mobile app

- [x] 5.1 Add `better-auth`, `@better-auth/expo`, `expo-secure-store`, `expo-web-browser`, `expo-network`,
  `expo-apple-authentication`, `expo-crypto`, and `@expo/app-integrity` through `expo install`, and in `app.config.ts`
  set `ios.usesAppleSignIn`, the `expo-apple-authentication` plugin, and the App Attest production entitlement
- [x] 5.2 Add `src/authClient.ts`: `configureAuthClient` with the api base url and `expoClient` over
  `expo-secure-store`, with `cookiePrefix: ["better-auth", GATE_COOKIE_NAME]`, exporting the typed `mobileAuthClient`
- [x] 5.3 Add `src/apiRequestSettings.ts`, pure logic with a test: the `headers` from `getCookie`, `credentials:
  "omit"`, and `onUnauthorized`, which signs out only if the client still holds a session, and pass it from
  `_layout.tsx`
- [x] 5.4 Add `src/appleSignIn.ts`: the nonce from `expo-crypto`, its SHA-256 for the sheet, `signInAsync`, and
  `signIn.social` with the raw nonce and the sheet's name as `idToken.user`; and `src/appSignupGate.ts`: the challenge,
  the attestation per platform, the `development` proof under `__DEV__`, and `passAppSignupGate`, with the platform
  choice as pure logic under test
- [x] 5.5 Add `app/sign-in.tsx`: Google, Apple to the Human Interface Guidelines, Continue with email, Forgot password
  to the web's reset page, the sign-up link, and `OAUTH_ERROR_TEXT` on a failure
- [x] 5.6 Add `app/sign-up.tsx`: email, then password, parsed with `signupCredentialsPayload`, the gate, `signUp.email`,
  and `APP_SIGNUP_GATE_FAILED_TEXT` with the web's sign-up page on a failure
- [x] 5.7 Guard the screens in `_layout.tsx` with `Stack.Protected` on the session, and add the name, the avatar through
  `useAvatar` and the public avatar url, and the settings link to `app/index.tsx`
- [x] 5.8 Add `app/settings.tsx` with Sign out and Close account over `sessionCopy.ts`, `sendDeleteAccount`, and
  `signOut`
- [x] 5.9 Update `apps/mobile/AGENTS.md` for the routes, the new modules, the dependencies, the values, and the rebuilt
  development client

## 6. Values and docs

- [x] 6.1 Add `PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY` and `EXPO_PUBLIC_PLAY_CLOUD_PROJECT_NUMBER` to `.env.example`, the
  README, and `scripts/sync-mobile-env.ts`
- [x] 6.2 Add the app's sign-in to the docs quickstart's sign-in step, and update the README Development section for the
  rebuilt development client
- [ ] 6.3 User setup: App Attest on the App ID, the Cloud project linked to the Play Console app with the Play Integrity
  api on, the service account key and the project number in Doppler dev and prd, then `bun run mobile:env:sync`

## 7. Verify

- [x] 7.1 `bun run check` passes, with the tests in 2.3, 2.5, 4.1, 4.2, 4.5, 4.7, and 4.9 green
- [ ] 7.2 Rebuild the development client, and on the iOS simulator sign in with Apple through the sheet, with Google,
  and with email and password, then quit and reopen the app and confirm it opens signed in with no loading state
- [ ] 7.3 On the Android emulator sign in with Apple through the browser, with Google, and with email and password
- [ ] 7.4 From a `preview` build, create an account by email on an iPhone and on an Android device from the Play
  internal test, with no visible check, and confirm the web's sign-up still passes Turnstile
- [ ] 7.5 Reset the password on the web while signed in on the app, open a screen, and confirm the sign-in screen shows
  once; close a throwaway account from settings and confirm it is gone from the admin users table
