## Context

`api/currentUser.ts` is a one-line stub returning a fixed `DEV_USER_ID`, written with the comment "swapping the body for the Better Auth session lookup leaves callers unchanged." `db/schema.ts`'s `users` table is already shaped to Better Auth's core columns for exactly this moment. `.env.example` already carries `BETTER_AUTH_SECRET` and always-pass Turnstile test keys. None of it is wired up. `worker/models.ts` routes every LLM call through one shared `LITELLM_MASTER_KEY`; `.env.example` says outright that "per-user virtual keys land at launch." This change is that launch step (Notion roadmap, Days 6-9, item 1), grounded against the installed library surface — verified via Context7 against `better-auth` and `litellm` docs at propose time, and cross-checked directly against the installed `better-auth@1.6.24` package's own type definitions during implementation (Decision 3 found a real gap the docs alone hadn't surfaced).

No auth UI exists yet (`ui/` has no signin/signup routes) — this is greenfield on the frontend.

## Goals / Non-Goals

**Goals:**
- Real signup/login (password + Google/GitHub OAuth) backed by Better Auth, sessions in Neon.
- One OAuth identity and one password identity for the same verified email resolve to one user row.
- A public signup form can't be trivially bot-farmed (Turnstile on the password path).
- Signup is zero-friction and OAuth-first: one click for Google/GitHub, email de-emphasized behind a "Continue with email" toggle. No invite code or signup cap on any path (revised mid-build, see Decision 5).
- A signed-up stranger's LLM usage is capped at the account level, structurally, not just by convention.
- `currentUser` becomes a real per-request lookup. Feed mutations (rating, consume, view) 401 without a session; the topic feed read itself stays public.

**Non-Goals:**
- Authorization tiers (`users.role`, `plans`, `can()`). `domain-schema` explicitly forbids a role enum today; this change does not add one.
- Password reset (forgot-password). Email verification for password signups is in scope (Decision 3); reset is a distinct flow not asked for.
- Billing/metering, privacy/terms pages, account-settings UI beyond Better Auth's own endpoints.
- Gating public signup volume (invite code, waitlist, or otherwise) — deliberately open, per direct user steer.

## Decisions

### 1. Better Auth wiring: Drizzle adapter + Hono mount, and the `currentUser` ripple

`auth.ts` (new, likely `api/auth.ts`) configures `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }), ... })`. `usePlural: true` is required, not optional — it's what makes Better Auth address the existing `users` table (plural) instead of expecting `user`, and it must also apply consistently to the new `sessions` / `accounts` / `verifications` tables so naming stays consistent with the domain schema's convention.

Mount shape (confirmed against the Hono integration docs):
```ts
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set("user", session?.user ?? null)
  await next()
})
```

This changes `currentUser`'s shape, not just its body. Today it's `currentUser(): string`, called synchronously with no failure mode. A session lookup is per-request and can be absent, so it becomes `currentUser(c: Context): string | null`, reading `c.get("user")` set by the middleware above. The rating/consume/view endpoints in `api/index.ts` each gain a new branch: no user → `401`; the `topic-feed` read treats the user as optional and stays public, so a signed-out visitor still gets the Featured and Popular sections. This is the one genuinely breaking ripple in this change — flagged explicitly in tasks.md so it isn't discovered mid-implementation.

### 2. Schema additions

- `sessions`, `accounts`, `verifications` tables: Better Auth-managed, added to `db/schema.ts` by hand (matching how `users` already exists there) and picked up through the adapter's `schema` param, the same way the Drizzle docs show mapping `user: schema.users`. Migrated the normal way, `drizzle-kit generate` — not Better Auth's own CLI, which would fight the single-migration-history convention this repo already has.
- `users` gains one additional column for the LiteLLM virtual key (e.g. `litellmVirtualKey: text("litellm_virtual_key")`, nullable only until first provisioned), declared to Better Auth via `user: { additionalFields: { litellmVirtualKey: { type: "string", required: false, input: false, returned: false } } }` so it's server-only (never client-settable, never sent to the client) but still flows through Better Auth's typed user object.

None of these are content-domain nouns (Topic/Source/Scan/Resource/Finding/Feed/Subscription/Audience/Integration); they're identity/access infrastructure, same tier as `users` itself. Domain-model skill sync (Decision 8) makes that explicit so nobody tries to force them into the content vocabulary.

### 3. OAuth account linking: rely on Better Auth's verified-email default, not `trustedProviders` — and close the local-verification gap it depends on

Confirmed from the docs: Better Auth already implicitly links an OAuth sign-in to an existing user "if the email matches and is verified" — this is the default when `account.accountLinking.enabled` is true. `trustedProviders` is a *different*, stronger knob: it links even when the incoming email is **not** verified, "with caution due to potential security risks." The proposal's requirement — link on *matching verified email* — is exactly the safe default, so:

```ts
account: { accountLinking: { enabled: true } }  // no trustedProviders
```

Google's OAuth userinfo asserts `email_verified` essentially always; GitHub's does via its own verified-email API — Better Auth's provider adapters surface that signal, so this needs no custom linking code, only correct config. Deliberately not setting `trustedProviders` — that would link on an *unverified* email too, which is a real account-takeover surface (attacker registers OAuth with a victim's unverified email) the proposal never asked for.

`socialProviders.google` / `.github` read `clientId`/`clientSecret` from `process.env` as usual. Per-environment separation is a Doppler/OAuth-console concern, not a code concern: dev and prd each get their own Google/GitHub OAuth app registration (separate redirect URIs), and the env var names stay identical across environments — Doppler's per-environment config is what makes `GOOGLE_CLIENT_ID` resolve differently in dev vs. prd.

**Correction found during implementation, verified against the installed `better-auth@1.6.24` types (not the doc excerpts above, which predate this option):** `accountLinking` also has `requireLocalEmailVerified` (default `true`, `@deprecated` with the note "the gate will become unconditional" in Better Auth's next minor). It requires the *existing local user row's own* `emailVerified` to already be `true` before an incoming OAuth email is trusted as linking proof — not just the incoming side. Its purpose is a real, named attack: someone pre-registers a password account at a victim's email and never verifies it; without this gate, the victim's later "Continue with Google" sign-in (with their own real, verified email) would silently link into the attacker's pre-existing row.

Since this repo builds no email-verification flow otherwise, a password signup's `emailVerified` would stay `false` forever, so the linking requirement above would silently never fire in the one case it's meant for. Closing that (user-confirmed, see chat) with a minimal, non-blocking step:

```ts
emailVerification: {
  sendVerificationEmail: async ({ user, url }) => { await sendEmail(user.email, verificationEmail(url)) },
  sendOnSignUp: true,
}
```

Better Auth generates the token and the verify-callback endpoint itself (mounted under `/api/auth/*` already); this only supplies the send step. `sendEmail` is a new, small Resend helper — a raw `fetch` to `https://api.resend.com/emails` (bearer `RESEND_API_KEY`), not the `resend` npm package, since one endpoint call doesn't earn a new dependency. Login is **not** gated on verification (no `requireEmailVerification`) — a password user can use the app immediately; only *implicit OAuth linking* waits on the click. Concretely: sign up with password, then immediately try "Continue with Google" before clicking the emailed link, and you get a second row today — one row only after the local email is confirmed. That's a real, narrow gap (documented in tasks.md's verification group) rather than a silent one.

### 4. Turnstile: password signup only, server-side verification

Client renders the Turnstile widget only on the password signup form (existing `VITE_TURNSTILE_SITE_KEY`). The token is verified server-side in the signup-gate pre-check (Decision 5), not client-side — a client-side-only check is not a check. OAuth's "Continue with Google/GitHub" button skips Turnstile entirely, per the proposal.

### 5. Turnstile gate: password path only, not universal

**Revised mid-build.** The original design had a universal invite-code gate every signup path redeemed, enforced in `databaseHooks.user.create.before`. Per direct user steer (reference UI supplied: OAuth-first, one-click, "zero friction," no invite code), that cap is gone entirely — signup is open. What remains from that mechanism is narrower and path-specific: Turnstile still only applies to the password form (per the original ask, unchanged), and OAuth still never touches it.

Since only one path needs a gate now, the hook branches on `context.path`: it requires and verifies the gate cookie only when `context.path === "/sign-up/email"` (Better Auth's own endpoint path for password signup, confirmed via source), and skips the check entirely for every other path (OAuth callbacks). This is a real behavior change from "universal enforcement point" — the earlier design's whole rationale for a *universal* hook check (both paths end at `user.create`, so gate there once) still holds structurally, it's just that OAuth no longer has anything to gate.

Mechanically, the password path is unchanged: `POST /api/signup-gate` verifies the Turnstile token server-side, then sets a short-lived (~15 min) `HttpOnly`, `SameSite=Lax` cookie — an HMAC-signed `{ expiresAt }` token (signed with `BETTER_AUTH_SECRET`, no code to bind anymore). `databaseHooks.user.create.before` reads that cookie only on the `/sign-up/email` path, verifies signature and expiry, and rejects (`APIError`) if missing or expired. OAuth signup calls `authClient.signIn.social(...)` directly, no pre-check at all.

### 6. Per-user LiteLLM virtual keys, provisioned in the same hook, threaded into the scan pipeline

Traced directly in the installed package's compiled source (`better-auth/dist/api/routes/sign-up.mjs`, `better-auth/dist/oauth2/link-account.mjs`, `better-auth/dist/db/with-hooks.mjs`), not just its types, because this matters for what the hook can rely on: **the two signup paths hand `create.before` a differently-shaped `user` object.** The password path (`sign-up.mjs`) generates the row's id upfront (`ctx.context.generateId({ model: "user" })`) and includes it before calling create — so `user.id` is populated in `before`. The OAuth path (`link-account.mjs`) does not; it explicitly strips the provider's own id (`const { id: _id, ... } = userInfo`) and lets the row get its id at insert time, which happens *after* `before` hooks run — so `user.id` is **not** yet set when `before` fires for an OAuth signup. `user.email`, by contrast, is present in `before` on both paths (both callers set it explicitly before creating). So the key is provisioned keyed on `user.email`, not `user.id`:

```ts
const key = await provisionLiteLLMKey(user.email)   // POST {LITELLM_BASE_URL}/key/generate, bearer LITELLM_MASTER_KEY
// body: { user_id: user.email, key_alias: `user:${user.email}`, max_budget: FREE_TIER_MONTHLY_BUDGET_USD, budget_duration: "30d" }
// response: { key: "sk-..." }
return { data: { ...user, litellmVirtualKey: key } }
```

`user_id`/`key_alias` are LiteLLM-side labels only (its budget enforcement runs off the returned `key` value, not the label), so using email costs nothing functionally and reads better in LiteLLM's own admin UI than an id that isn't available for half the signup paths anyway.

One hook, one insert, no window where a user row exists without a spend cap. If `/key/generate` fails, the hook throws and the user is never created — fail-closed, matching "a stranger's signups can never overspend our card." (Best-effort, retry-after-the-fact provisioning was considered and rejected: it would mean a real window where a signed-up user's calls fall back to the master key with no cap, which is precisely the risk this feature exists to close. Provisioning keyed on `user.id` from an `after` hook instead — where both paths do have a final id — was also considered and rejected for the same reason: `after` cannot abort creation.)

The global backstop (`max_budget` as a proxy-wide setting, confirmed from the LiteLLM docs to be a **config-level** setting, not a runtime API) is one line in `litellm-config.yaml`'s `litellm_settings`, applied on the next proxy deploy — infra, not application code.

**Threading the key into the scan pipeline** is the other half, and it's a real gap today: `worker/models.ts`'s `cheapModel()` / `scoreModel()` / `embedModel()` take no arguments and always use `LITELLM_MASTER_KEY`; `worker/scan.ts`'s `runTopicScan(topicId)` never loads the topic row at all today, only `sources` by `topicId`. To bill a Scan to its owner:
- `runTopicScan` gains a query joining `topics.ownerId → users.litellmVirtualKey`, resolved once per Scan.
- That key threads through `reviewScan(scan, ...)` into every model call site in `worker/review.ts` (`loadTopicContext`, `embedResource`, `scoreResourceContent` ×2 via `scoreResource`, `summarizeScan`) — four call sites today.
- `worker/models.ts`'s model constructors take an optional key override (falling back to the master key when absent, e.g. for the smoke scripts), so `bun test` / `*.smoke.ts` callers that don't have a user context are unaffected.

This is the single largest code-shape change in the worker and is called out as its own task group rather than folded into "wire up Better Auth."

Budget window: `budget_duration: "30d"` makes each key's `max_budget` a resetting monthly allowance (free tier: `FREE_TIER_MONTHLY_BUDGET_USD`), not a lifetime cap, so an active user is never permanently locked out once they hit it. Per-tier budgets and a `/key/update` bump on upgrade will source from the plans file when it merges (TODO in `api/auth.ts`).

### 7. Dev workflow: seeded demo data needs a real, loggable-in account

`db/seed.ts` currently inserts `usr_dev_evan` and `usr_community` as plain rows with no password/OAuth account, then owns every demo topic under them. After this change, `currentUser` no longer has a bypass — `bun run dev:api` requires a real session like production does (the existing "always-pass Turnstile test keys, valid on localhost" comment in `.env.example` already anticipated exactly this). Two ends of the spectrum:
- Do nothing extra: the seeded topics stay visible (they're the public/community ones), but a freshly-signed-up local dev's own "Your topics" is empty until they create topics by hand. Cheapest, but a real regression in local-dev ergonomics versus today.
- Have the seed script call Better Auth's own server-side sign-up API (not a raw Drizzle insert) to create a real password-backed account for a fixed dev email (e.g. `evan@carlnotes.dev` / a fixed dev-only password documented in `.env.example`), so `bun run db:seed` produces something you can actually log into locally, exercising the real session path with no bypass.

Recommended: the second option, since it keeps local dev at parity with today (log in once, see rich seed data) while staying honest to "swap the body, leave callers unchanged" — no fake session shortcut in `currentUser` itself. Whether Better Auth's server API accepts a caller-chosen id (to keep the stable `usr_dev_evan` id the rest of the seed data already keys off) needs a quick check against the installed version at apply time; if it only auto-generates ids, the seed's stable-id constants get replaced with whatever id that one signup call returns, captured once and reused for the rest of the seed run.

### 8. Domain-model skill and `domain-schema` spec sync

Better Auth's `accounts` table and the domain's existing `Integration` entity are both, informally, "an OAuth grant tied to a user" — that similarity is exactly the confusion this change needs to head off:
- `accounts` (Better Auth-managed): **sign-in identity**. How a user proves who they are — a password hash or a Google/GitHub OAuth grant used for login. Never referenced by a Source or a Subscription.
- `Integration` (existing domain entity, unchanged): a **connected external account used for sourcing or delivery** (e.g. Composio-managed Gmail/YouTube). Never used to authenticate a session.

The `domain-model` skill gets a short rule stating this split explicitly, and `domain-schema`'s spec delta (below) carries the same distinction as a requirement, so it's enforceable rather than just documented.

### 9. Three things only browser verification caught

Design and unit tests can't see these; they only surfaced running the real signup and login flow in a browser.

- **`trustedOrigins` must include the Vite dev origin.** In dev the UI (`:5173`) and the API (`:3000`) are different ports; Better Auth's origin check rejected sign-in with "Invalid origin" until `trustedOrigins: ["http://localhost:5173"]` was added. Harmless in prod, where one service serves both.
- **Sign-in and sign-up must do a full navigation, not client-side routing.** `navigate("/")` right after `authClient.signIn.email()`/`signUp.email()` resolves lands back on the login page: the session cookie is set correctly (verified directly — a raw `fetch` to `/get-session` right after sign-in returns the new session), but Better Auth's client-side session store doesn't observably refresh across a same-SPA transition, so a `useSession()` reader (the session-aware nav) still reads the pre-login state. `window.location.href = "/"` forces a real reload and picks up the session correctly. Both `LoginPage` and the post-signup "Continue to CarlNotes" button use it.
- **`sendVerificationEmail` failures were silent.** The Resend call's response was never checked. Live-verified failure mode: Resend's sandbox sender (`onboarding@resend.dev`, used here since no domain is verified yet) can only deliver to the Resend account owner's own address — every other recipient gets a 403, and that 403 vanished with no log. Now logs the failure (never throws — a delivery hiccup still must not block signup).

## Risks / Trade-offs

- **[Risk]** The exact `databaseHooks` shape was originally only doc-confirmed. → **Mitigation applied**: traced directly through the installed `better-auth@1.6.24`/`@better-auth/core`/`better-call` compiled source and type definitions (`with-hooks.mjs`, `sign-up.mjs`, `link-account.mjs`, `endpoint.d.mts`) rather than taken from docs. This is *how* Decision 6 found the `user.id`-vs-`user.email` asymmetry between the password and OAuth paths — real verification changed the design, not just confirmed it. `context.request`/`context.headers` on the hook's `GenericEndpointContext` are now confirmed directly from `better-call`'s own `EndpointContext` type (not just the plugin-source excerpts Context7 surfaced), so the signup-gate cookie is readable from `create.before` as designed. `EndpointContext` also exposes `getSignedCookie`/`setSignedCookie` built-ins — deliberately not used here: the gate cookie is written by a plain Hono route (`/api/signup-gate`) and read from a Better Auth endpoint context, two different libraries, and nothing confirms their signed-cookie formats are interoperable. A small hand-rolled HMAC (Web Crypto, one shared verify/sign pair) sidesteps that cross-library assumption entirely.
- **[Risk]** LiteLLM `/key/generate`'s exact request/response field names were confirmed from a cookbook example, not the formal API reference. → **Mitigation**: verify against the deployed LiteLLM proxy's `/key/generate` (or its OpenAPI schema at `/`) before wiring the hook.
- **[Risk]** Fail-closed key provisioning means a LiteLLM outage blocks all new signups. → **Mitigation**: accepted deliberately — the alternative (letting signups through uncapped) is the exact cost exposure this feature exists to close. Existing scans already depend on LiteLLM being up; this doesn't add a new single point of failure, it extends the existing one to signup.
- **[Risk]** `currentUser`'s 401 ripple touches every route in `api/index.ts`; missing one silently leaves a route open (or broken). → **Mitigation**: tasks.md enumerates every existing route explicitly rather than "update currentUser call sites."
- **[Trade-off]** No signup cap at all means volume is unbounded. → Accepted deliberately, per direct user steer toward zero friction. The remaining structural backstop is the per-user + proxy-wide LiteLLM budget (Decision 6): a stranger can always sign up, but can never spend past their capped key regardless of how many strangers there are.

## Migration Plan

1. Add the `better-auth` dependency; add `sessions`/`accounts`/`verifications` to `db/schema.ts`; add the `litellmVirtualKey` column to `users`; generate and review the migration.
2. Register per-environment OAuth apps (Google, GitHub) for dev and prd; land their client id/secret/redirect URI in the matching Doppler environment, alongside `BETTER_AUTH_URL`.
3. Wire `auth.ts`, the Hono mount, and the session middleware; rewrite `currentUser` and its call sites (breaking, staged together so nothing is left half-migrated).
4. Wire the signup-gate endpoint (Turnstile check only) and the `user.create.before` hook (path-scoped Turnstile check + LiteLLM provisioning), and the worker-side key threading.
5. Update `db/seed.ts` for a real, loggable-in dev account; update the README Development section for the new Doppler variables (per AGENTS.md's rule that a workflow change and its README update land together).
6. Add the `max_budget` proxy-wide cap to `litellm-config.yaml` (requires a LiteLLM proxy redeploy to take effect).
7. Build the UI: signup/login pages, OAuth-first with Google/GitHub as one-click buttons, email de-emphasized behind a toggle, Turnstile widget on the email path only, session-aware nav.

**Rollback**: every schema addition is additive (new tables, one nullable column) — reverting the application code while leaving the migration applied is safe, since old code simply never references the new tables. No destructive step in this migration.

## Open Questions

- Confirm the exact LiteLLM `/key/generate` request/response shape against the deployed proxy version.
- Does Better Auth's server-side sign-up API accept a caller-supplied user id (needed to keep the seed's stable `usr_dev_evan` id)? Falls back to capturing whatever id it generates if not.
- Privacy/Terms pages are flagged in Notion as due "the moment auth... ships" but are out of scope here (copy/legal content, not backend wiring) — confirm that's an acceptable split or should be pulled into this change.
