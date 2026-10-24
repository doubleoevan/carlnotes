## Context

`apps/api/auth.ts` configures Better Auth 1.7.11 with email and password, Google, and GitHub. Each provider's client id
and secret are plain strings from Doppler, read with `Bun.env.X ?? ""`. The sign-in buttons live in
`apps/web/src/components/session/SessionLayout.tsx`, which `LoginPage` and `SignupPage` both render, and the provider
id is typed `"google" | "github"` in four places.

Better Auth ships an `apple` provider (`@better-auth/core/dist/social-providers/apple.mjs`). Reading it and the
callback route settles most of the behaviors the brief asks about:

- The provider asks for `email` and `name` with `response_mode=form_post`, so Apple posts the code, the state, and, on
  the first authorization only, a `user` JSON field with the name.
- The callback route accepts a POST, merges the body into a query string, and redirects the browser to the GET form
  of the same callback on the app's own origin. The GET reads `user`, builds the name, and creates the user in that
  request.
- The token exchange reads `options.clientSecret` and `options.redirectURI` on every call, from the options object the
  config passed in.
- The provider's ID token check, with issuer `https://appleid.apple.com`, Apple's keys, and an audience of
  `audience ?? appBundleIdentifier ?? clientId`, runs only for `signIn.social({ idToken })` and for linking by ID
  token. The web code flow does not check it.
- The global origin check validates a POST's `Origin` header only when the request includes a cookie.

## Goals / Non-Goals

**Goals:**

- Apple sign-in on the web for a new user, a returning user, and a user whose verified email matches an existing
  account.
- A client secret that is never stored and never expires under a running process.
- An api that starts with Apple off while the Apple values do not exist yet.
- A provider setup that the mobile sign-in change extends with the native flow alone.
- A dev loop that reaches Apple from a laptop.

**Non-Goals:**

- The native iOS flow and the mobile sign-in screen. The mobile sign-in change owns those.
- Apple's server-to-server notifications for a revoked consent or a changed private relay address. A later change can
  add the endpoint once accounts need to react to them.

## Decisions

### The client secret is signed at runtime, valid for 30 days, and signed again every week

Apple's client secret is an ES256 JWT that the app signs with its `.p8` key. The header names `kid` (`APPLE_KEY_ID`),
and the claims are `iss` (`APPLE_TEAM_ID`), `sub` (`APPLE_CLIENT_ID`, the Services ID), `aud`
(`https://appleid.apple.com`), `iat`, and `exp`. Apple rejects an `exp` more than 15,777,000 seconds (about six
months) after `iat`.

A new module, `apps/api/appleProvider.ts`, holds the provider's options:

- `toAppleProviderValues(env)` returns the four values, or null if any of them is unset. It turns literal `\n`
  sequences in the key back into line breaks and trims the key, so a key pasted on one line still imports.
- `toAppleClientSecret(values, issuedAt)` imports the PKCS#8 key with jose's `importPKCS8` and signs the JWT with
  `SignJWT`, valid for 30 days, well under Apple's limit.
- `toAppleProviderOptions(env)` signs the first secret and returns the provider's options. It returns options with
  `enabled: false` if a value is unset or the key will not sign, and reports a key that will not sign under the new
  `auth` stage in `packages/server/monitoring.ts`.
- `replaceAppleClientSecret(options, values)` signs a new secret into the options, and keeps the current one if
  signing fails.

Apple is optional in every environment. The Apple Developer membership is still pending, so `bun run dev`,
`bun run check`, and a prd deploy all run with no Apple values, and the api starts with Apple off.

`auth.ts` passes Better Auth a function for the `apple` key, `() => toAppleProviderOptions(Bun.env)`. Better Auth awaits
a provider's function config once while it builds its context, and leaves a provider with `enabled: false` out. The
secret is then signed at runtime, never at deploy time, with no top-level `await`, and no error from the key can stop
the api.

A process that runs past the secret's expiry fails every Apple code exchange, since Apple checks the secret at each
one. So `toAppleProviderOptions` sets a weekly interval timer, unreferenced so the timer never holds the process open.
Each tick signs a new secret into the options object. Better Auth passes that same object to its provider and reads
`options.clientSecret` on every token request, which a probe confirmed: the provider's own options showed the new
secret after a replacement. A failed tick keeps the current secret, which has at least three weeks left.

Alternatives considered:

- A hand-made JWT stored in Doppler, or one signed at deploy time. It expires silently with no deploy to blame.
- A top-level `await` in `auth.ts`. A bad key would stop the api from starting, which an optional provider must not do.
- `node:crypto`'s synchronous signing behind a getter. It avoids the timer, but jose is the library Better Auth already
  uses for Apple, and the timer is a few lines.

`jose` becomes a direct dependency of `apps/api` at 6.2.12, the version Better Auth already installs. Bun's isolated
install only links a package's declared dependencies, so the import needs the declaration.

### The provider config

```ts
{
	clientId: appleProviderValues.clientId,
	clientSecret,
	appBundleIdentifier: MOBILE_APP_BUNDLE_IDENTIFIER,
	redirectURI: devRedirectUrl,
	mapProfileToUser: toAppleProfileUser,
}
```

- `redirectURI` is set only if `DOPPLER_ENVIRONMENT` is `dev`, so a dev redirect url copied into prd by mistake is
  ignored.
- `toAppleProfileUser` canonicalizes the address like Google's. A private relay address such as
  `x@privaterelay.appleid.com`, or `x@private.icloud.com` for a sign-up from late 2026, is only lowercased, since
  `toCanonicalEmail` changes Gmail addresses alone. No code matches on either domain.
- If an ID token has no email, `toAppleProfileUser` returns the stored email of the user who holds the Apple account,
  found by Apple's subject. Better Auth's callback stops a sign-in that has no email before it looks up the account, so
  a returning user whose token lacks the claim would otherwise be locked out. A new user with no email still stops
  there. The lookup filters `accounts` on the provider and the account id, which gains an index
  (`accounts_provider_id_account_id_idx`). Better Auth runs the same filter on every OAuth sign-in.
- The mapper returns only `email`, and Better Auth spreads the mapper's result over the name it built, so the name
  stays.

### The name from the first authorization

Apple sends the name once, on the first authorization, in the posted `user` field. The ID token never has it. Better
Auth parses the `user` field in the same callback request that creates the `users` row and writes the name there, so
the change needs no code of its own to keep it. A later sign-in has no `user` field and an empty name, and Better Auth
leaves the stored name alone, since `overrideUserInfoOnSignIn` is off.
The databaseHooks `user.create.before` hook spreads `...user`, so the name passes through. A matching existing
account keeps its own name when Apple links to it.

If the create fails after Apple sent the name, the name is gone. Apple sends it again only after the user removes
CarlNotes under Sign in with Apple in their Apple ID settings. The user then gets an empty name, and the app shows the
username everywhere a name would appear, so nothing breaks.

### Account linking

`account.accountLinking.enabled` already links an OAuth identity to an existing user only when both sides have a
verified matching email: Better Auth requires the provider's `emailVerified`, since no provider is trusted, and
`requireLocalEmailVerified` defaults to true. The Apple provider sets `emailVerified` from `email_verified`, true or
`"true"`, so a real address that Apple verified links to a verified account, and an unverified one does not.

Apple makes a private relay address for one Apple ID and one app, so a private relay address matches no account but the
user's own. A Hide My Email user therefore gets a new account. The only match possible is an account that someone signed
up with the private relay address and then verified, which takes mail that only that Apple ID's owner receives. That
link is correct, and the email column's unique index rules out creating a second user with the same address anyway.

### The posted callback and its origin

Apple's POST is a cross-site navigation. The app's own cookies are `SameSite=Lax`, so the POST carries none of them.
Other cookies on the domain with `SameSite=None` can still arrive, and a POST with any cookie makes Better Auth check
the `Origin` header, which is `https://appleid.apple.com`.

`trustedOrigins` also decides which redirect urls Better Auth allows, such as a password reset's `redirectTo`. A plain
list with Apple's origin in it would let a reset link redirect to Apple with its token. So `trustedOrigins` becomes a
function, `toTrustedOrigins(request)`, which adds Apple's origin only when the request is Apple's callback, and the
LAN origins in dev only. Better Auth calls it once at startup with no request, and checks redirect urls against that
list, so Apple is never a trusted redirect. Its origin check calls it again with each request.

The POST handler sets no session. It redirects to the GET callback on the app's origin. Better Auth keeps the state and
the PKCE code verifier on the server, in Redis and Postgres, and its only state cookie is a signed `state` cookie,
`SameSite=Lax`. The GET is a top-level navigation, so the browser sends that cookie, and the response sets the session
cookie. The cookies stay Lax, since `SameSite=None` would send them on every cross-site request. Better Auth skips its
origin check under `bun test`, so `auth.test.ts` turns the check on for its two callback tests: Apple's posted
callback redirects with its fields, and one from another origin is rejected. The verification step signs in through the
dev loop and checks that the session exists afterward.

The redirect puts the code, the state, and the first authorization's `user` field into the GET's query string. The
Sentry scrub already drops every query string (`packages/server/monitoringScrub.ts`), and the api has no request log,
so the name and email stay out of error reports.

### Closing an account revokes its Apple tokens

App Review guideline 5.1.1(v) requires an app that offers Sign in with Apple and account deletion to revoke the user's
tokens through Apple's REST API. The web app already closes accounts, and the iOS app will share this backend, so the
close revokes the tokens now.

`revokeAppleTokens(appleProviderOptions, userId)` in `appleProvider.ts` reads the user's Apple `accounts` rows and posts
each refresh token to `https://appleid.apple.com/auth/revoke` with the Services ID and the current client secret. The
revokes run at once, and each times out after 5 seconds, so a slow Apple holds the close for 5 seconds at most. A
rejection's error includes Apple's reason, such as `invalid_client`. A stored access token is never sent: a native
sign-in stores whatever access token the client sends, unchecked, and Apple's token endpoint returns a refresh token on
every web sign-in. `deleteUser` in
`apps/api/users.ts` calls it after the spending is cancelled and before the `users` row cascades the `accounts` rows
away.

- A failed or slow revoke is reported under the `auth` stage, and the close goes on. Revoking spends no money, so it is
  not one of the steps that abort a close.
- The close reads the provider options from Better Auth's context through `loadAppleProviderOptions` in `auth.ts`, so
  it signs with the secret that the weekly timer last replaced. While Apple is off, the context has no Apple provider,
  and the close reads no tokens and sends no request. Module-scope state would leak between test files, since Bun
  shares modules across them.
- A native sign-in stores no refresh token, so it has nothing to revoke. If the mobile change exchanges a native
  authorization code, those tokens belong to the bundle identifier, and the revoke for them needs the bundle identifier
  as its client id. The mobile change adds that case.
- A sign-in that lands while the account closes could store a token after the revoke. The cascade then deletes the
  token unrevoked. The window is the length of one close, so the change accepts it.

### Ready for the native flow

The iOS app's ID tokens have the bundle identifier `com.carlnotes.app` as their audience, not the Services ID. Setting
`appBundleIdentifier` makes Better Auth check that audience when the app later calls `signIn.social({ provider:
"apple", idToken })`. The web code flow is unaffected, since it never checks the ID token's audience. Only Apple can
issue a token for that bundle identifier, so accepting the audience now opens nothing a stranger can use.

The bundle identifier moves into `packages/contracts/mobileApp.ts` as `MOBILE_APP_BUNDLE_IDENTIFIER`.
`apps/mobile/app.config.ts` reads it for the iOS bundle identifier and the Android package, and `auth.ts` reads it for
the provider. A universal package is the one place both can import.

### The web buttons

`SessionLayout.tsx` adds **Continue with Apple** below Google and GitHub, with an `AppleIcon` in
`OAuthProviderIcons.tsx`. The button uses the same `OAUTH_BUTTON_CLASS` as its siblings, which keeps it at least as
prominent as the others, as Apple's guidelines ask. The Apple logo is drawn in `currentColor`, so it follows the
button's text color in both themes. Apple's form works inside an in-app browser, so the button stays enabled there, as
GitHub's does.

The two pages had the same one-line OAuth handler. `SessionLayout` now opens a provider's sign-in itself from a
`redirectPath` prop, and its `OAuthProviderId` type replaces the four `"google" | "github"` copies. If
`signIn.social` returns an error, as it does while Apple is off, the layout says the sign-in didn't open under the
buttons. Before this change a failed provider sign-in did nothing. The Apple icon is simple-icons' `siApple` through
`BrandIcon`, like GitHub's.

### The dev loop: a Cloudflare named tunnel for the callback alone

Apple rejects a localhost return URL. The api's normal base url in dev is `http://localhost:5173`, which Google and
GitHub use. Changing it to a tunnel hostname would break their registered redirects.

Instead, Apple alone names a different return URL. In dev, `APPLE_DEV_REDIRECT_URL` is
`https://apple-dev.carlnotes.com/api/auth/callback/apple`, and the provider's `redirectURI` sends Apple there. The flow
then runs:

1. The user starts on `http://localhost:5173/login` and the state cookie is set on localhost.
2. Apple posts to the tunnel hostname, and the tunnel forwards the POST to the api on `localhost:3000`.
3. The POST handler redirects to `http://localhost:5173/api/auth/callback/apple?...`, the base url.
4. The browser follows it on localhost with the state cookie, and Better Auth exchanges the code with the same
   `redirectURI`.

The tunnel is a Cloudflare named tunnel, `carlnotes-dev`, since `carlnotes.com`'s DNS is already on Cloudflare. A
named tunnel keeps a stable hostname for free, where a quick tunnel's hostname changes on every start. Its config,
`infra/cloudflared/dev-tunnel.yml`, routes only the path `^/api/auth/callback/apple$` to `http://localhost:3000` and
returns 404 for everything else, so the tunnel never exposes the rest of the dev api. The tunnel's credentials file
stays in `~/.cloudflared/`, outside the repo.

`bun run dev:tunnel` runs `cloudflared tunnel --config infra/cloudflared/dev-tunnel.yml run`, in a second terminal
beside `bun run dev`. It stays out of the `dev` orchestrator, so a machine without cloudflared still runs the stack.

Alternatives considered:

- ngrok's free static domain. It works, but it adds an account and an agent token, and it cannot route one path alone.
- Pointing `BETTER_AUTH_URL` at the tunnel. Google and GitHub would need the tunnel's redirect too, and every page
  would load through the tunnel.

## Risks / Trade-offs

- [Digests to a Hide My Email user bounce] → Apple's relay accepts mail only from a registered domain. Registering the
  Resend sending domain and the from address under Sign in with Apple for Email Communication is a setup task before
  the prd deploy, and the README's setup steps name it.
- [A wrong key leaves Apple off without failing the deploy] → The api reports the signing error to Sentry under the
  `auth` stage, and the button says the sign-in didn't open, so the failure is visible on both sides.
- [The Apple button shows while Apple is off] → Pressing it says the sign-in didn't open. The values arrive within
  days, so the button is not hidden behind a new endpoint.
- [The weekly timer never runs in practice] → It costs one signature a week. A unit test covers that a new secret has
  a later `iat` on the same options object.
- [Better Auth changes how it reads `clientSecret` in a later version] → The re-creation depends on the options object
  being read per call. The test for the timer assigns through the same object the provider reads, and a Better Auth
  upgrade reruns it.
- [Apple asks to verify the domain] → If the Services ID configuration asks for a domain association file, the api
  serves it from `/.well-known/`, which it already routes.
- [The first authorization's name is lost if the create fails] → Accepted. The app falls back to the username.

## Migration Plan

1. Create the Apple accounts' pieces: the App ID `com.carlnotes.app` with Sign in with Apple, a Services ID per
   environment with its domain and return URL, and one `.p8` key.
2. Set `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` in Doppler dev and prd, and
   `APPLE_DEV_REDIRECT_URL` in dev.
3. Register the Resend sending domain with Apple's private email relay.
4. Deploy, before or after the values exist. Without them the api starts with Apple off.

Rollback: revert the commit. Users who signed up with Apple keep their accounts and can reset a password over email,
unless they used Hide My Email and the relay registration is gone.

## Open Questions

None.
