## 1. Schema and plans config

- [x] 1.1 Add the `billing_subscriptions` table to `db/schema.ts`: `userId` (fk cascade), `stripeCustomerId`, `stripeSubscriptionId`, `plan` (plan enum), `status` (text, mirrors Stripe), `currentPeriodEnd`, `hasPaymentMethod` (boolean), timestamps; model one active row per user (partial unique index or app-enforced).
- [x] 1.2 Add nullable `budget_override_cents` (integer) to the `users` table in `db/schema.ts`.
- [x] 1.3 Generate the additive Drizzle migration and confirm it only creates `billing_subscriptions` and adds `users.budget_override_cents` — no other table altered.
- [x] 1.4 Extend `db/schema.test.ts` to pin the `billing_subscriptions` columns and the `users.budget_override_cents` null default, mirroring the existing `role`/`plan` tests.
- [x] 1.5 Add `rank` to every plan in `shared/plans.ts`, keeping the `satisfies Record<Plan, PlanConfig>` shape so a missing field stays a compile error. (An earlier `weeklyManualUpdateLimit` was removed once the weekly limit was dropped — see group 5.)
- [x] 1.6 Manual-scan gating reuses the existing `startOfUtcDay` daily window via `scansToday`; no weekly helper is needed. (An earlier `startOfUtcWeek` was added then removed with the weekly limit.)

## 2. The `isAllowed` gate

- [x] 2.1 Create `api/authorization.ts` exporting `isAllowed(user, capability, resource)` for capabilities `topic:view`/`topic:edit`/`topic:delete`/`topic:create`/`scan:manual`/`topic:rate`/`admin:console`/`admin:setRole`/`admin:setBudget`; admin short-circuits authority and entitlement; resolve the effective plan from `users.plan`; export an `effectiveBudgetCents(user)` helper (`budget_override_cents ?? PLANS[plan].monthlyBudgetCents`).
- [x] 2.2 Export the batched `rateableTopicIds(userId, topicIds): Promise<Set<string>>` from `api/authorization.ts`, encoding the same subscriber rule as `hasSubscription` (direct `subscriptions.subscriberUserId = userId` OR audience membership) in one query.
- [x] 2.3 Refactor `api/topic/permissions.ts`, `api/topic/quotas.ts`, `api/topic/topics.ts` (owner checks, `loadTopicPayload` visibility incl. the admin override, spend visibility), and the `api/index.ts` topic edit/delete/scan routes to authorize through `isAllowed`, removing the scattered `role ===` / owner comparisons.
- [x] 2.4 Add `api/authorization.test.ts`: admin overrides authority and entitlement, non-admin owner/subscriber rules unchanged, the daily-limit overage decision, effective-budget resolution.
- [x] 2.5 Add a guard test asserting `role ===` / `plan ===` / `tier ===` appear only inside `api/authorization.ts`.

## 3. Feed performance fixes

- [x] 3.1 In `loadTopicFeedData` (`api/topic/feeds.ts`) build the rateable-topic-id set via `rateableTopicIds` and pass it into `buildTopicFeed`.
- [x] 3.2 Make `buildTopicFeed` synchronous, computing `canRate = isOwner || (visibility is public/invite && set.has(topic.id))`, dropping the per-topic `await canRateTopic`.
- [x] 3.3 In `buildTopicFeeds` bound the public-topic load *before* fetching feed data: featured Topics (`featureOrder` not null) plus the top-N non-featured by a subscriber-count subquery; keep the owner "yours" section and the signed-out path; keep featured and popular disjoint.
- [x] 3.4 Extend `api/topic/findings.test.ts` (or a new feeds test): fixed query count as Topics grow, correct `canRate` across the direct and audience subscriber paths, bounded public-topic load, and the signed-out path.

## 4. Stripe billing integration

- [x] 4.1 Add the `stripe` dependency (`bun add stripe`) and wire env via Doppler (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, per-plan price ids); document the required env.
- [x] 4.2 Map plans to Stripe products/prices as `free`/`plus`/`premium` and add a price→plan resolver, so one spelling reaches the products and the gate.
- [x] 4.3 Add the Checkout route (create a Stripe Checkout Session for a plan's price) and the Customer Portal route.
- [x] 4.4 Add the webhook route: verify the Stripe signature and reject unsigned/invalid events; upsert or clear `billing_subscriptions` and the `users.plan` projection from the subscription's current state, idempotent by Stripe subscription id; sync `hasPaymentMethod`.
- [x] 4.5 On plan change in the webhook, resize the user's LiteLLM key budget to `effectiveBudgetCents` via `/key/update`.
- [x] 4.6 Source the signup-provisioned LiteLLM budget from `effectiveBudgetCents`, removing the hardcoded `FREE_TIER_MONTHLY_BUDGET_USD` and its TODO in `api/auth.ts`.

## 5. Manual-scan overage on the daily scan limit

- [x] 5.1 Gate `runManualScan` through `isAllowed(user, "scan:manual", topic)` on the daily scan limit (counted via `scansToday`); the daily shared pool is the manual-scan ceiling.
- [x] 5.2 Metered overage: when at/over the daily scan limit and `hasPaymentMethod` is true, allow the scan and report a Stripe usage record on the subscription's metered item; with no card, hard-reject before any scan work (paid-subscription scope per design Open Questions).
- [x] 5.3 Tests for the daily overage gate: within limit, at limit hard-rejected without a card, billed with a card, and admin bypass.

## 6. Admin console API

- [x] 6.1 Users-table query: per user, email, role, plan, signup date, topic count, attributed storage (`octet_length(content)` + attachment bytes + `EMBED_DIMENSIONS * 4 * embedded-rows`, distinct Resource per user), MTD variable cost (LiteLLM spend), and effective budget.
- [x] 6.2 Totals query: total attributed storage, total MTD variable cost, Stripe net revenue (the reporting/balance figure), and contribution = net revenue − total tracked variable cost − optional `FIXED_MONTHLY_COST_CENTS` (config, default 0).
- [x] 6.3 Admin write endpoints through `isAllowed`: set role (block self-demotion) and set/clear the budget override (resize the LiteLLM key to the new effective budget).
- [x] 6.4 Guard the admin routes via `isAllowed(user, "admin:console")`; reject non-admins. Tests for the cost/contribution math, the route guard, and the self-demotion block.

## 7. Admin console and billing UI

- [x] 7.1 Admin console page: users table + totals summary; inline role select and budget-override editor; labels read "attributed storage", "variable cost", and "contribution". (Labels later plain-Englished on user request: "Storage", "Cost this month", and "Cost / budget" with a monthly tooltip — the never-"storage cost" and never-"full cost to serve" rules stand.)
- [x] 7.2 Pricing/upgrade entry routes to Checkout; a "Manage billing" control opens the Customer Portal.
- [x] 7.3 Metering UI: scan usage against the daily limit plus any overage; surface the past-due/dunning state with a link to the Customer Portal. (Account sections later carded on user request, with "Current plan" merged into one Plan card. The inline per-plan checkout buttons were then simplified away: a free user's card shows one Upgrade button routing to the pricing page, which owns plan selection and checkout; a paying user keeps Manage billing.)
- [x] 7.4 Pricing page at `/pricing`, linked from the header for signed-in and signed-out users: the three plans from the shared catalog with quota lines (topics, scans per day, monthly budget), a monthly/yearly toggle (yearly = two months free), the signed-in user's plan highlighted as "Current plan" and the recommended plan (plus) highlighted for a visitor; a visitor's card routes to signup, a free user's paid card to Checkout at the toggle's interval, and a paying user's changes to the Customer Portal. (Added during the activity change's apply on user request.)

## 8. Reconciliation, docs, and skill

- [x] 8.1 Fix the stale "Pro" tier name in `openspec/specs/scan-history/spec.md` to "premium" and sweep any remaining Starter/Pro copy. (Reconciled via the scan-history delta's MODIFIED requirement, applied to the main spec on archive; a live-repo sweep found no other Starter/Pro copy.)
- [x] 8.2 Update the domain-model skill (`.agents/skills/domain-model` and its canonical copy) with the Billing Subscription noun, distinct from the topic Subscription.
- [x] 8.3 Update the README Development section if any `package.json` scripts changed (per AGENTS.md). (No scripts changed — `bun add stripe` only added a dependency. Documented the new Stripe/billing + admin env in `.env.example` and the README Development section instead.)

## 9. Verification

- [x] 9.1 Run `bunx biome check . && bunx tsc -b && bun test` and fix any failures.
- [x] 9.2 Run `openspec validate add-authz-plans-billing --strict`.
