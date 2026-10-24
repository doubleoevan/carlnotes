## Why

The mobile app's sign-in change will offer Google, and App Review expects a privacy-focused option such as Sign in with
Apple beside it. Apple's provider also brings Apple's particular behaviors: a client secret that expires, a name sent
only once, private relay addresses, and a posted callback. Landing it on the web and the api first proves those
behaviors where they are easy to test, so the mobile change only adds the native flow.

## What Changes

- Add Apple as a third social provider in `apps/api/auth.ts`, through Better Auth's `apple` provider, beside Google and
  GitHub.
- Sign Apple's client secret at runtime as an ES256 JWT with the `.p8` key, using `jose`, from `APPLE_CLIENT_ID` (the
  Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` in Doppler. The secret is valid for 30 days,
  well under Apple's six-month limit, and a running api signs a new one every week. Apple is optional: with any value
  unset, or a key that will not sign, the api starts in every environment with Apple off.
- Map Apple's profile through `toCanonicalProfileEmail`, like Google's. Better Auth stores the name from Apple's first
  authorization in the same request that creates the user.
- Trust `https://appleid.apple.com` as an origin, since Apple posts its callback.
- Name the iOS app's bundle identifier `com.carlnotes.app` as the provider's ID token audience, so the mobile sign-in
  change adds the native flow with no change to this setup. The bundle identifier moves to one constant in
  `packages/contracts/` that `apps/mobile/app.config.ts` reads too.
- Add a **Continue with Apple** button to the shared sign-in layout that `LoginPage` and `SignupPage` render, beside the
  Google and GitHub buttons. The layout opens a provider's sign-in itself, in place of a copy in each page, and says so
  under the buttons if the sign-in does not open, as when Apple is off.
- Revoke a closing account's Sign in with Apple tokens through Apple's revoke endpoint before the user row is deleted,
  as App Review guideline 5.1.1(v) requires of an app that offers Sign in with Apple and account deletion.
- Add a dev loop for Apple: a Cloudflare named tunnel with a stable HTTPS hostname that forwards only Apple's callback
  path to the local api, started by `bun run dev:tunnel` beside `bun run dev`.
- Document the setup: the quickstart's sign-in step, the Apple account setup steps in the README, the four values in
  `.env.example`, and Sign in with Apple in the domain-model skill.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `user-auth`: users can sign in with Apple. The api signs Apple's client secret at runtime from the four Doppler
  values, and starts with Apple off without them. Apple's first-authorization name is stored, a private relay address is
  accepted, the posted callback is trusted, and the provider accepts the iOS app's ID tokens.
- `account-closing`: closing an account revokes its Sign in with Apple tokens, and a failed revoke does not stop the
  close.

## Impact

- **Code**: `apps/api/auth.ts` and its tests, `apps/api/users.ts`, a new `apps/api/appleProvider.ts` with its tests,
  an `auth` stage in `packages/server/monitoring.ts`, `apps/web/src/components/session/` (`SessionLayout.tsx`,
  `OAuthProviderIcons.tsx`), `apps/web/src/components/common/BrandIcon.tsx`, `apps/web/src/pages/LoginPage.tsx` and
  `SignupPage.tsx`, a new bundle identifier constant in `packages/contracts/`, and `apps/mobile/app.config.ts`.
- **Dependencies**: `jose` becomes a direct dependency of `apps/api`, at the version Better Auth already installs.
- **Config**: four new Doppler values in dev and prd, `APPLE_DEV_REDIRECT_URL` in dev, and a committed tunnel config
  under `infra/cloudflared/`. A `dev:tunnel` root script.
- **Accounts, outside the repo**: an Apple Developer Program membership, the App ID with Sign in with Apple, a Services
  ID with its domains and return URLs, a `.p8` key, a Cloudflare tunnel, and the Resend sending domain registered with
  Apple's private email relay. Digests to Hide My Email users fail without that registration.
- **Docs**: `apps/docs/src/content/docs/quickstart.md`, `README.md`, `.env.example`, `apps/api/AGENTS.md`, the root
  `AGENTS.md` module map's `infra/` entry, and `.agents/skills/domain-model/SKILL.md`.
