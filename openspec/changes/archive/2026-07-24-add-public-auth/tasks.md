## 1. Dependencies and environment

- [x] 1.1 Add `better-auth` to `package.json`; `bun install`
- [x] 1.2 Register Google and GitHub OAuth apps for dev (localhost redirect URI) and prd (prod redirect URI); land client id/secret in the matching Doppler environment — dev done: real client id/secret in Doppler, both providers live-verified redirecting to their real consent screens. prd still pending, no prod environment exists yet
- [x] 1.3 Add `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` to `.env.example` (`BETTER_AUTH_SECRET` and the Turnstile test keys already exist)

## 2. Schema

- [x] 2.1 Add `sessions`, `accounts`, `verifications` tables to `db/schema.ts`, matching Better Auth's Drizzle adapter conventions with plural naming consistent with `users`
- [x] 2.2 Add the nullable LiteLLM virtual key column to `users`
- [x] 2.3 `bun run db:generate`; review the generated migration; `bun run db:migrate` against the dev branch

## 3. Better Auth configuration

- [x] 3.1 Create `api/auth.ts`: `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }), ... })`
- [x] 3.2 Configure `emailAndPassword: { enabled: true }` and `socialProviders.google` / `.github` from env
- [x] 3.3 Configure `account: { accountLinking: { enabled: true } }` — deliberately no `trustedProviders`
- [x] 3.4 Declare `user.additionalFields.litellmVirtualKey` (`input: false`, `returned: false`, server-only)
- [x] 3.5 Configure `emailVerification: { sendVerificationEmail, sendOnSignUp: true }`; write the small Resend `sendEmail` helper (raw `fetch` to `https://api.resend.com/emails`, no new dependency) and a plain-text verification email using the `{ user, url }` Better Auth provides (design.md Decision 3)
- [x] 3.6 Manual smoke-check: confirm the gate cookie is readable inside `databaseHooks.user.create.before` against a real local signup — confirmed live: the litellm key attached correctly on a real signup through the browser

## 4. Hono mount and the `currentUser` rewrite

- [x] 4.1 Mount `/api/auth/*` to `auth.handler` in `api/index.ts`
- [x] 4.2 Add session middleware that sets `user`/`session` on Hono context via `auth.api.getSession`
- [x] 4.3 Rewrite `api/currentUser.ts` to resolve the user from Hono context instead of `DEV_USER_ID`
- [x] 4.4 Update every existing route in `api/index.ts` (`topic-feed`, rating, consume, view) to branch on a missing user and return 401
- [x] 4.5 Remove `db/devUser.ts`'s `DEV_USER_ID` export once the seed rework (group 7) no longer needs it as a fixed constant — file deleted, seed now takes `devUserId` as a parameter

## 5. Signup gate: Turnstile (password path only) and LiteLLM provisioning

No invite code or signup cap — revised mid-build per direct user steer toward a zero-friction, OAuth-first signup (design.md Decision 5). What remains: Turnstile still gates the password form only, and every new user still gets a budgeted LiteLLM key.

- [x] 5.1 Build `POST /api/signup-gate`: verifies the Turnstile token, then sets a short-lived `HttpOnly`/`SameSite=Lax` HMAC-signed cookie (signed with `BETTER_AUTH_SECRET`). Only the password signup form calls this — OAuth's `signIn.social()` never does
- [x] 5.2 Build the LiteLLM key-provisioning helper (`provisionLiteLLMKey` in `api/auth.ts`, keyed on `user.email` per design.md Decision 6) — live-verified against the running LiteLLM proxy: real signups received a real `sk-...` virtual key, confirmed in the database
- [x] 5.3 Wire `databaseHooks.user.create.before` in `api/auth.ts`: when `context.path === "/sign-up/email"`, read and verify the gate cookie and reject if missing/expired; regardless of path, provision the LiteLLM key and return `{ data: { ...user, litellmVirtualKey } }`
- [x] 5.4 Add the proxy-wide `max_budget` setting to `litellm-config.yaml`

## 6. Worker: per-user LiteLLM key threading

- [x] 6.1 `worker/scan.ts`'s `runTopicScan`: query the Topic's `ownerId` and that user's `litellmVirtualKey`
- [x] 6.2 Thread the resolved key through `reviewScan(scan, ...)` in `worker/review.ts`
- [x] 6.3 `worker/models.ts`: add an optional key-override parameter to `cheapModel()` / `scoreModel()` / `embedModel()`, falling back to `LITELLM_MASTER_KEY` when absent
- [x] 6.4 Update the four in-pipeline call sites (`loadTopicContext`, `embedResource`, `scoreResourceContent` via `scoreResource`, `summarizeScan`) to pass the resolved key through
- [x] 6.5 Confirm `worker/*.smoke.ts` and `worker/review.test.ts` still pass unchanged, exercising the master-key fallback

## 7. Dev seed rework

- [x] 7.1 Replace `db/seed.ts`'s direct insert of the dev user with a real Better Auth server-side sign-up call for a fixed dev email/password, capturing the resulting user id — new `api/seed.ts` orchestrates this (`db/seed.ts` can't import `api/auth` per the module boundary rule; `seed()` now takes `devUserId` as a parameter instead)
- [x] 7.2 Better Auth's `signUpEmail` doesn't accept a caller-supplied id (confirmed: its body schema has no `id` field and traced through `sign-up.mjs`'s own id generation) — the seed's stable-id topics/scans/sources/resources/findings are re-keyed to the captured id via `buildSeedTopics(devUserId)`
- [x] 7.3 Document the fixed dev login credentials in `.env.example` and the README Development section
- [x] 7.4 Leave `usr_community` as a plain inserted row (it never logs in) unless a reason emerges to change that

## 8. UI: OAuth-first, zero-friction

Reworked mid-build to match a reference UI the user supplied (OAuth-first, one-click, email de-emphasized, no invite code).

- [x] 8.1 Small brand-icon components for Google and GitHub (`ui/src/components/icons/BrandIcons.tsx`) — lucide-react dropped brand logos, so these are small standalone svgs
- [x] 8.2 Signup page: Google and GitHub as prominent one-click buttons (no gate at all — straight to `signIn.social()`), a de-emphasized "Continue with email" toggle revealing Name/Email/Password + the Turnstile widget only when opened
- [x] 8.3 Login page: same OAuth-first pattern, email behind the same toggle, no Turnstile (existing accounts, not new signups)
- [x] 8.4 Session-aware nav: signed-in vs. signed-out state, logout action — `Header` only ever renders inside the now-gated route tree, so it shows sign-out only; `RequireAuth` handles the signed-out redirect
- [x] 8.5 Redirect unauthenticated users away from Feed/topic views to the login page — `RequireAuth` + restructured `App.tsx` (also moved `TopicFeedProvider` inside the gate so it never fetches before a session exists)
- [x] 8.6 A small "check your email to verify" notice after password signup (non-blocking — the user can dismiss it and use the app immediately)

## 9. Domain-model and docs sync

- [x] 9.1 Update `.agents/skills/domain-model/SKILL.md` with the `accounts`-vs-`Integration` distinction (design.md Decision 8) — `.claude/skills/`'s copy picked it up automatically
- [x] 9.2 Update the README Development section for the new Doppler variables and the dev login credentials

## 10. Verification

- [x] 10.1 `bunx biome check .` + `bunx tsc -b` + `bun test` — all green (biome: 0 errors, pre-existing nursery warnings only; tsc: clean; tests: 46/46 pass)
- [x] 10.2 Manual golden path in the browser, both before and after the invite-code removal: signed up new users with email/password (Turnstile test-key widget), got the non-blocking "check your email" notice, landed on the home feed signed in; separately signed out (redirected to `/login`) and logged the seeded dev user back in — confirmed via screenshots and network traces. Found and fixed a real bug along the way: sign-in/sign-up must do a full navigation (`window.location.href`), not client-side `navigate()` — Better Auth's client session store doesn't observably refresh on a same-SPA transition, so a client-side redirect landed back on the login page despite a valid session cookie
- [ ] 10.3 Manual OAuth path: sign up via Google, sign up via GitHub — redirect confirmed live for both: clicking each button reaches that provider's real consent screen (`accounts.google.com` "Sign in to continue to CarlNotes"; `github.com` "Sign in to GitHub, to continue to CarlNotes dev"), proving `socialProviders` config, client id/secret, and redirect URI are all correct. Not completing the round trip itself — that needs real Google/GitHub account credentials, which I don't have and won't attempt to obtain
- [ ] 10.4 Manual linking path — unverified for the same reason as 10.3: needs a completed OAuth login (real credentials) to exercise account linking against a seeded password user
- [x] 10.5 Manual edge cases, all confirmed live: a missing/empty Turnstile token on the password path is rejected (`{"error":"turnstile failed"}`, 400); signup with no gate at all succeeds via OAuth's direct path (nothing to check); an unauthenticated request to a gated route gets redirected to `/login` in the browser and 401 at the API. Also found and fixed a real silent-failure gap: `sendVerificationEmail` never checked the Resend response status, so a delivery failure (confirmed live — Resend's sandbox sender can only deliver to the account owner's own address) vanished with no log; it now logs the failure without blocking signup
- [ ] 10.6 Confirm a scan for an owned topic bills to that owner's LiteLLM virtual key — verified by code inspection and confirmed key provisioning (every signed-up user has a real per-user key in the database), but a live Temporal scan run was not additionally exercised in this session
