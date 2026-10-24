## Why

The mobile app renders the theme and one public read, and nothing a user does in it belongs to an account: no sign-in,
no session on a request, and no way to create or close an account, which App Review requires of an app that creates
them. Sign in with Apple shipped on the web and the api first because the native sheet needs the server to verify the
app's ID tokens, and that is in place. This change puts the account in the app: a visitor signs in with the account they
already have, or creates one, and every api request from the app sends their session.

## What Changes

- **The auth server trusts the app.** `apps/api/auth.ts` adds Better Auth's `expo()` plugin. `toTrustedOrigins` gains
  the app's scheme `carlnotes://` with its deep-link paths, and the `exp://` development wildcards in dev alone, the way
  the LAN origins are gated today.
- **The auth client is configured, like the api client.** `packages/client/authClient.ts` becomes `authClient()`, a
  function that returns the client an app configured once at startup with `configureAuthClient`, or the browser's own
  client if the app configured nothing. The web configures nothing and behaves as today. The mobile app passes its api
  base url and the Expo client plugin, which keeps the session cookie in `expo-secure-store`.
- **Every api request sends the session.** `configureApiClient` takes `headers`, a function whose headers every request
  sends, applied by the typed `hc` client and by `fetchApi`, the one plain fetch every client module uses. The six plain
  fetches that send a bare path today go through it too, so they reach the configured base url. It also takes
  `onUnauthorized`, which a 401 from any request calls. The web passes neither and keeps its same-origin cookies.
- **Three sign-in methods on mobile.** Apple through the native sheet on iOS, sending the ID token and nonce to
  `signIn.social`; Apple on Android and Google on both platforms through the system browser, returning to
  `carlnotes://`; and email and password natively. Forgot password opens the web flow.
- **Email sign-up with an app gate.** A native sign-up form asks for what the web's form asks for, in the same order. In
  place of the web's Turnstile, the app proves it is a genuine install: App Attest on iOS and Play Integrity on Android
  through `expo-app-integrity`, verified on the server against a one-time challenge, which sets the same five-minute
  gate token the signup route already reads. The signup route keeps one rule, and the web's Turnstile path does not
  change. A development build passes in dev alone, and a release build that cannot attest is sent to the web's sign-up.
- **Screens.** A sign-in screen with the three methods and a sign-up path, Apple's button to Apple's Human Interface
  Guidelines. Expo Router's `Stack.Protected` shows a visitor the sign-in screen and a user the home screen with their
  name and avatar from the session. A settings screen holds sign out and close account, which confirms, calls the
  existing `DELETE /api/users/me`, and returns to the sign-in screen.
- **Session lifetime.** The Expo client caches the session in secure storage, so the app opens signed in with no loading
  state. A revoked session returns the user to the sign-in screen on the next 401, once, without a loop.
- **Docs.** `apps/mobile/AGENTS.md`, `packages/client/AGENTS.md`, `apps/api/AGENTS.md`, the README, `.env.example`, and
  the docs quickstart's sign-in step cover the app.

Out of scope: GitHub sign-in on mobile, which comes with the account change; the EventSource streams, which the chat
change handles; the public screens for people without an account, which the browsing change opens.

## Capabilities

### New Capabilities
- `mobile-sign-in`: how a visitor signs in or signs up, and how a user stays signed in, signs out, and closes their
  account in the mobile app, and how the app's requests send the session.

### Modified Capabilities
- `user-auth`: the password signup gate takes a second proof, device attestation from the app, behind the same gate
  token; the auth server trusts the app's scheme; the Apple provider's ID token path signs the app in.
- `mobile-app`: the client configuration at startup covers the auth client, the request headers, and the 401 handler;
  the one screen becomes the signed-in home screen.
- `account-closing`: a user closes their own account from the app's settings screen too.

## Impact

- `apps/api`: `auth.ts` (the `expo()` plugin, the trusted origins), a new `appSignupGate.ts` and its routes beside
  `/api/signup-gate` (the challenge, the App Attest and Play Integrity verification), new Doppler values for Play
  Integrity's service account, and the `APPLE_TEAM_ID` that App Attest's app id needs.
- `packages/client`: `apiClient.ts` (`headers`, `onUnauthorized`, `fetchApi`), `authClient.ts` (`configureAuthClient`,
  `authClient()`), every client module's plain fetch, and the signup-gate call.
- `packages/core`: the two hooks that read `authClient` call `authClient()`.
- `apps/web`: the 39 importers of `authClient` call `authClient()`; the Storybook mock and the MCP card alias export the
  function form. No behavior changes.
- `apps/mobile`: new dependencies (`@better-auth/expo`, `better-auth`, `expo-secure-store`, `expo-web-browser`,
  `expo-apple-authentication`, `expo-app-integrity`), the routes `sign-in`, `sign-up`, and `settings`, the guarded home
  screen, and the api fetch, auth client, and gate modules under `src/`. The development client is rebuilt, since the
  change adds native modules.
- `packages/contracts`: the app gate payloads.
- Setup outside the repo: the App Attest capability on the App ID, a Google Cloud project linked to the Play Console app
  with the Play Integrity api on, and its service account key in Doppler.
