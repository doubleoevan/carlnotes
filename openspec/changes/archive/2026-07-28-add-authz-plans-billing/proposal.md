## Why

CarlNotes already carries plan config (`shared/plans.ts`) and `users.role` / `users.plan` columns, but nothing enforces or monetizes them: authority is scattered owner checks, entitlement is ad-hoc `role === "admin"`, there is no way to charge for a plan, and no way to see what a user costs against what they pay. This change routes every authority and entitlement decision through one gate, adds real Stripe billing that derives the plan, and gives admins a console to watch cost against revenue — turning latent config into an enforced, paid product. It also clears two pre-launch feed performance defects flagged during the topic-detail review.

## What Changes

**Authorization**
- One `isAllowed(user, capability, resource)` gate becomes the sole entry point for every authority and entitlement check; scattered `role === "admin"` and owner checks route through it — no `role ===` / `tier ===` outside the gate.
- `users.role` (`admin` | `user`) is platform authority: an admin bypasses entitlement checks and is the single override that may edit or delete any Topic regardless of owner (resolved through the gate, not scattered owner checks).
- The plans catalog gains an integer `rank` and an additive, inherited capability map (each tier includes everything below): topic limit, daily scan limit, monthly spend backstop, and price. Limits stay config.
- Manual scans (scan-now) are gated by the daily scan limit through the gate — soft with a card on file (metered overage), hard without.

**Plans & billing**
- New Billing Subscription entity (`billing_subscriptions` table) maps a Stripe subscription to a plan; the active row derives the user's plan (free = no row). `users.plan` becomes a webhook-synced projection so gate and quota reads stay single-row.
- Checkout runs through Stripe Checkout with Link enabled (including Link Instant Bank Payments at the lower bank rate) — a Dashboard toggle, not a code path, so the integration surface stays Stripe Billing subscriptions, webhooks, and the Customer Portal.
- Metered manual-scan overage: a card on file makes the daily scan ceiling soft, billed per extra Scan via Stripe usage records; no card keeps it a hard cap. Plus metering UI and dunning (surfacing past-due state).
- The per-user LiteLLM key budget is sourced from the plan's monthly backstop (resolving the hardcoded `FREE_TIER_MONTHLY_BUDGET_USD`) and resized on plan change and on budget override.
- Reconcile the provisional Starter/Pro tier names to `free`/`plus`/`premium` so one spelling reaches the Stripe products and the gate (the code enum is already `free`/`plus`/`premium`; this fixes the stale `scan-history` spec text and any remaining copy) and keeps the domain-model skill in sync.

**Admin console**
- Admin-only route: a users table (email, role, current plan, signup date, topic count, attributed storage, month-to-date variable cost shown against the effective budget) and a totals summary.
- **Attributed storage** = Σ bytes the user's Topics hold (resource content bytes + attachment bytes + embedding width × row count); labelled *attributed storage*, not storage cost, because Resources are global and deduplicated — an attribution for spotting heavy accounts, not a chargeback.
- **Month-to-date variable cost** is read from the same per-user Scan budget spend (observed, not estimated), covering only what flows through the budget; labelled *variable cost*, not full cost to serve.
- **Totals**: total attributed storage, total MTD variable cost, total net revenue pulled from Stripe (the reporting/balance figure that already nets refunds, proration, and fees), and **contribution** = net revenue − total tracked variable cost, labelled *contribution* not profit (omits fixed infra and Stripe fees); an optional flat monthly fixed-cost constant may be subtracted.
- Inline role change and a per-user budget override that takes precedence over the plan backstop in both directions (null = plan value). Both write through the gate. An admin cannot remove their own admin role, so the platform can never be locked out of its last admin.

**Feed performance** (pre-launch, from the topic-detail review)
- Batch the N+1 rate-permission check: `loadTopicFeedData` runs one query for the feed's topic ids the signed-in user may rate as a subscriber (direct subscription OR audience membership), passes the resulting Set into `buildTopicFeed`, and `buildTopicFeed` becomes synchronous.
- Bound the public-topic load: load featured Topics plus only the top-N non-featured ranked by a subscriber-count subquery, so feed data is never built for Topics that will not render. Preserve the owner ("yours") section for signed-in users and the signed-out path. Add or extend feed test coverage.

## Capabilities

### New Capabilities
- `authorization`: the `isAllowed(user, capability, resource)` gate, the `admin` / `user` role, admin as the single Topic-authority override, and the plans catalog as an additive rank-ordered capability map the gate resolves.
- `subscription-billing`: Stripe Billing subscriptions mapped to the plans catalog via `billing_subscriptions`; plan derivation and the `users.plan` projection; Stripe Checkout (Link), webhooks, and the Customer Portal; metered manual-scan overage, metering UI, and dunning.
- `admin-console`: the admin-only users table and totals summary, inline role changes, and per-user budget overrides.

### Modified Capabilities
- `domain-schema`: add the `billing_subscriptions` table and a per-user budget-override column; `users.plan` becomes the webhook-synced projection of the active billing subscription; `users.role` becomes the gate's authority input; new migration(s).
- `scan-history`: the manual-Scan quota's daily limit gains the metered-overage soft/hard cap (soft with a card, hard without); fix the stale "Pro" tier name to "premium".
- `feed-api`: bound the homepage assembly — batch the per-Topic rate-permission check and limit the public Topics loaded to featured plus top-N by subscriber count (featured and popular disjoint).
- `user-auth`: the signup-provisioned LiteLLM budget is sourced from the plan's monthly backstop (or the per-user override), replacing the hardcoded free-tier constant.
- `topic-editing`: Topic save and delete authorize through the gate (owner or admin), not an owner-only check.
- `topic-detail-page`: the topic-payload access gate adds the admin override, so an admin can open (and thereby edit or delete) any Topic through the existing UI.

## Impact

- **Schema/db**: new `billing_subscriptions` table, new `users.budget_override_cents` column, migration(s); `db/schema.ts`, `db/schema.test.ts`.
- **Shared**: `shared/plans.ts` (rank, capability map); `shared/enums.ts` plan values unchanged.
- **API**: new `isAllowed()` gate module; changes to `api/topic/permissions.ts`, `api/topic/quotas.ts`, `api/topic/topics.ts`, `api/topic/feeds.ts`, `api/index.ts`; new billing routes (checkout, webhook, portal) and admin routes.
- **Worker / LiteLLM**: key budget sourced from plan/override via `/key/*`; per-user spend read for MTD cost.
- **UI**: pricing/checkout entry, billing + metering + dunning surfaces, admin console page.
- **External**: Stripe (Billing subscriptions, webhooks, Customer Portal, usage records, Link Dashboard toggle) — **new dependency**; env/secrets for Stripe API keys and webhook signing.
- **Docs/skills**: update the domain-model skill with the Billing Subscription noun (distinct from the topic Subscription); update the README Development section if scripts change.
