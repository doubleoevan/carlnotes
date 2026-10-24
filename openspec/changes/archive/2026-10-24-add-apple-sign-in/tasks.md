## 1. The client secret

- [x] 1.1 Add `jose` to `apps/api/package.json` at 6.2.12, the version Better Auth already installs, and run
  `bun install`
- [x] 1.2 Create `apps/api/appleProvider.ts` with `toAppleProviderValues(env)`, which returns the four values or null if
  any is unset, turns literal `\n` sequences in the key into line breaks, and trims the key
- [x] 1.3 Add `toAppleClientSecret(...)`: import the PKCS#8 key with `importPKCS8` and sign an ES256 JWT with `kid`,
  `iss`, `sub`, `aud`, `iat`, and a 30-day `exp`
- [x] 1.4 Add `toAppleProviderOptions(env)`, which signs the first secret, returns `enabled: false` if a value is unset
  or the key will not sign, and starts the weekly unreferenced timer that replaces the secret
- [x] 1.5 Add `replaceAppleClientSecret(...)`, which keeps the current secret and reports the error under a new `auth`
  stage in `packages/server/monitoring.ts` if signing fails
- [x] 1.6 Write `apps/api/appleProvider.test.ts` with a P-256 key pair generated in the test: the secret verifies
  against the public key, the header and claims match the four values, the lifetime is under Apple's limit, an unset
  value returns null, a one-line key imports, Apple is off without values or with a bad key, a replaced secret is newer
  on the same options object, and Better Auth's provider takes the name from the posted `user` field, has no name
  without it, and keeps a private relay address

## 2. The provider

- [x] 2.1 Create `packages/contracts/mobileApp.ts` with `MOBILE_APP_BUNDLE_IDENTIFIER`, and read it in
  `apps/mobile/app.config.ts` for the iOS bundle identifier and the Android package
- [x] 2.2 In `apps/api/auth.ts`, pass `apple: () => toAppleProviderOptions(Bun.env)`, which Better Auth awaits once
  while it builds its context
- [x] 2.3 Set `trustedOrigins` to `toTrustedOrigins`, which trusts `https://appleid.apple.com` for Apple's callback
  alone, plus the LAN dev origins in dev only, and read `APPLE_DEV_REDIRECT_URL` in dev only
- [x] 2.4 Update the header comment of `auth.ts` and its provider comment to name Apple
- [x] 2.5 Add tests in `apps/api/auth.test.ts`, with Better Auth's origin check turned on, that Apple's posted callback
  redirects to the app's own callback with its fields, and that one from another origin is rejected
- [x] 2.6 Probe that Better Auth registers only Google and GitHub without the values, registers Apple with them, and
  reads a replaced secret from its own provider options
- [x] 2.7 Add `toAppleProfileUser`, which returns the stored email of the user who holds the Apple account if the ID
  token has none, with tests, and an index on `accounts` for the provider and the account id
- [x] 2.8 Show the sign-in message if `signIn.social` throws an error too, and treat a whitespace-only value as unset
- [x] 2.9 Add `revokeAppleTokens` to `appleProvider.ts`, which posts a closing account's Apple refresh tokens to Apple's
  revoke endpoint at once, each with a 5-second timeout, and reports a failure with Apple's reason, with tests
- [x] 2.10 Add `loadAppleProviderOptions` to `auth.ts`, and call `revokeAppleTokens` from `deleteUser` in
  `apps/api/users.ts` before the `users` row is deleted

## 3. The web buttons

- [x] 3.1 Add Apple to `BrandIcon` from simple-icons, and `AppleIcon` to
  `apps/web/src/components/session/OAuthProviderIcons.tsx`
- [x] 3.2 Move the provider sign-in from `LoginPage.tsx` and `SignupPage.tsx` into `SessionLayout.tsx`, which takes a
  `redirectPath` prop, types the providers as `OAuthProviderId`, and says the sign-in didn't open under the buttons if
  `signIn.social` returns an error
- [x] 3.3 Add the **Continue with Apple** button below GitHub in `OauthButtons`, enabled in an in-app browser too

## 4. The dev loop

- [x] 4.1 Add `infra/cloudflared/dev-tunnel.yml` for the `carlnotes-dev` named tunnel: route only
  `^/api/auth/callback/apple$` on `apple-dev.carlnotes.com` to `http://localhost:3000`, and return 404 for everything
  else
- [x] 4.2 Add the `dev:tunnel` root script,
  `cloudflared tunnel --config infra/cloudflared/dev-tunnel.yml run carlnotes-dev`

## 5. Docs

- [x] 5.1 Add the four Apple values and `APPLE_DEV_REDIRECT_URL` to `.env.example`, each with what it is for
- [x] 5.2 Update the README: `dev:tunnel` in the Development scripts, Apple beside Google and GitHub, and the Apple
  setup steps, with both return URLs, the tunnel's one-time setup, and the Resend domain registered with Apple's
  private email relay
- [x] 5.3 Update the sign-in step in `apps/docs/src/content/docs/quickstart.md` to name **Continue with Apple**, the
  private relay address, and that Apple sign-in works inside an embedded browser
- [x] 5.4 Update `apps/api/AGENTS.md`'s auth paragraph for `appleProvider.ts`, and the root `AGENTS.md` module map's
  `infra/` entry for the tunnel config
- [x] 5.5 Add Sign in with Apple, the Services ID, and the private relay address to the domain-model skill's auth
  section

## 6. Setup outside the repo

- [ ] 6.1 The user creates the Apple pieces once the Developer Program membership is active, and sets the four values in
  Doppler dev and prd, and `APPLE_DEV_REDIRECT_URL` in dev
- [ ] 6.2 The user creates the `carlnotes-dev` tunnel and its DNS route, and registers the Resend sending domain with
  Apple's private email relay

## 7. Verify

- [x] 7.1 `bun run check` passes with no Apple values set
- [x] 7.2 A dev api with no Apple values starts, registers no Apple provider, and the sign-in pages show the Apple
  button and say the sign-in didn't open when it is pressed
- [ ] 7.3 Once the values exist, with `bun run dev` and `bun run dev:tunnel` running, sign up through Apple from
  `localhost:5173`: the session exists afterward, the `users` row has the name, and a second sign-in returns to the
  same user
- [ ] 7.4 Once the values exist, sign up through Apple with Hide My Email and check that the user's email is a relay
  address
