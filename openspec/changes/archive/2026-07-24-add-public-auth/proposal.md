## Why

CarlNotes has no real auth: `api/currentUser.ts` hard-codes a dev user id, and `db/seed.ts` inserts every user row directly. Launch week (Notion roadmap, Days 6-9) turns the app public and multi-tenant, which needs real signup/login, bot resistance on the open signup form, and structural cost protection before a stranger's account can spend against the shared model budget.

## What Changes

- Add Better Auth as a library: email/password auth, sessions, and OAuth account storage in Neon via the Drizzle adapter, mounted on Hono. The `users` table already ships shaped to Better Auth's core columns (per `domain-schema`); this lands the `sessions`, `accounts`, and `verifications` tables alongside it.
- Add Google and GitHub social sign-in. An OAuth identity links to an existing user on matching verified email (Better Auth's default implicit linking) rather than creating a second user row. `trustedProviders` (link-without-verification) is deliberately not enabled — linking stays gated on a verified email.
- Add a minimal, non-blocking email-verification-send step to password signup. The installed Better Auth version requires the *existing local row's own* `emailVerified` flag before it will trust an incoming OAuth email as linking proof (`requireLocalEmailVerified`, on by default) — without this, a password signup's email never becomes verified and the linking requirement above silently never fires. Login is not blocked while unverified.
- Add separate Google and GitHub OAuth apps per environment (dev, prd), each with its own client id, secret, and redirect URI, stored in the matching Doppler environment.
- Add Cloudflare Turnstile (Managed mode) to the email/password signup form only. OAuth signup is not gated by Turnstile — the provider redirect is its own bot resistance.
- **Revised mid-build, per direct user steer:** no invite code or signup cap. Signup is zero-friction and OAuth-first — Google and GitHub as one-click, equal-weight buttons, with email as a de-emphasized "Continue with email" fallback (matching a reference UI the user supplied). The `databaseHooks.user.create.before` hook still enforces the Turnstile check on the password path (and OAuth still skips it entirely), it just no longer redeems a code.
- Add per-user LiteLLM virtual keys: a virtual key is provisioned for each user at signup with a per-key `max_budget`, and the Scan pipeline (`worker/models.ts`, `worker/review.ts`, `worker/scan.ts`) bills its LLM calls to the topic owner's key instead of the shared `LITELLM_MASTER_KEY`. A proxy-wide `max_budget` in `litellm-config.yaml` backstops the per-key caps.
- Replace `api/currentUser.ts`'s hard-coded dev user with a real Better Auth session lookup. Every API route gains an unauthenticated (401) path that does not exist today.
- Sync the `domain-model` skill and the `domain-schema` spec to distinguish Better Auth's `accounts` table (sign-in identity: how a user proves who they are) from the existing `Integration` entity (a connected external account used for sourcing/delivery, e.g. Composio-managed Gmail). The two are easy to conflate; only one governs sign-in.

**BREAKING**: `api/currentUser.ts` changes from a synchronous, always-succeeding stub to a per-request session lookup that can be unauthenticated. Every caller in `api/index.ts` changes shape (see design.md).

## Capabilities

### New Capabilities
- `user-auth`: signup and login (email/password and Google/GitHub OAuth) via Better Auth, session-backed request authentication, OAuth account linking on verified email, Turnstile-gated password signup, and per-user LiteLLM virtual key provisioning with a spend budget. Zero-friction, OAuth-first: no invite code or signup cap on any path.

### Modified Capabilities
- `domain-schema`: adds the Better Auth-managed `sessions`, `accounts`, and `verifications` tables; adds a LiteLLM virtual-key column to `users`. Clarifies that `accounts` (sign-in identity) and `integrations` (connected external account for sourcing/delivery) are distinct and never substitute for each other.
- `feed-api`: the requesting user is now resolved from a Better Auth session instead of a fixed dev id. An unauthenticated request now gets 401 instead of the dev user's Feed.

## Impact

- **New dependency**: `better-auth` (npm), added to the single root `package.json`.
- **Schema** (`db/schema.ts`, migration via `drizzle-kit generate`): new `sessions`, `accounts`, `verifications` tables; new column on `users` for the LiteLLM virtual key.
- **API** (`api/index.ts`, `api/currentUser.ts`, new `api/auth.ts`): mounts the Better Auth handler at `/api/auth/*`, adds session middleware, changes `currentUser` to a per-request lookup, adds a signup-gate endpoint that verifies Turnstile and sets a short-lived cookie the `user.create.before` hook reads (password path only — OAuth never calls it).
- **Worker** (`worker/models.ts`, `worker/review.ts`, `worker/scan.ts`): model calls take the topic owner's LiteLLM virtual key instead of always using the master key; `runTopicScan` gains a query to resolve it.
- **UI** (`ui/`, currently no auth routes at all): new signup/login pages, OAuth-first with Google/GitHub as prominent one-click buttons and email as a de-emphasized fallback, Turnstile widget on the email path only, session-aware nav.
- **Infra**: `litellm-config.yaml` gains a proxy-wide `max_budget`. Doppler gains per-environment `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY` (already listed in `.env.example` but unused until now); `.env.example` gains the dev placeholders (`BETTER_AUTH_SECRET` and Turnstile test keys already exist).
- **Dev workflow** (`db/seed.ts`): seeded demo topics are currently owned by a directly-inserted `usr_dev_evan` row with no password/OAuth account. Design.md covers how a developer logs in locally as that user after this change.
- **Docs**: `domain-model` skill (`.agents/skills/domain-model/SKILL.md`) and the README Development section (Doppler/env additions).

## Out of Scope

- The `users.role` / `plans` / `can()` authorization axis (a separate, later roadmap decision; `domain-schema` still forbids a role enum and this change does not add one).
- Password reset (forgot-password). Email verification for password signups is now in scope (see above) — reset is not; it's a distinct flow the user never asked for.
- Billing, subscriptions, and metered overage (post-traction, per the roadmap's decision log).
- Privacy policy / Terms pages (the Notion footer notes these are due "the moment auth or the hosted tier ships" — flagged for the user as a related follow-up, not built here).
- Account settings UI (change password, manage linked providers) beyond what Better Auth's endpoints provide out of the box.
