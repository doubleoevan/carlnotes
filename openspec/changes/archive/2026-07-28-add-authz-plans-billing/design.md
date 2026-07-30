## Context

CarlNotes already has the *config* for authorization and plans but none of the enforcement or monetization:

- `users.role` (text, default `user`) and `users.plan` (enum `free`/`plus`/`premium`, default `free`) exist. The `pro`→`premium` rename already shipped (migration `0018`); the only stale "Pro" text is [scan-history spec.md:33](openspec/specs/scan-history/spec.md).
- Entitlement/authority logic is scattered: `role === "admin"` in [quotas.ts](api/topic/quotas.ts), owner checks in [permissions.ts](api/topic/permissions.ts) and [topics.ts](api/topic/topics.ts), `isAdmin || isOwner` for spend visibility in `loadTopicPayload`.
- The "Scan budget" is a per-user **LiteLLM virtual key** provisioned at signup ([auth.ts:108](api/auth.ts)) with a hardcoded `FREE_TIER_MONTHLY_BUDGET_USD = 10` that already carries a TODO to source from `PLANS`. LiteLLM enforces the budget atomically and records spend.
- There is **no Stripe code**. `PLANS` in [shared/plans.ts](shared/plans.ts) already carries prices in cents.
- The homepage feed ([feeds.ts](api/topic/feeds.ts)) has two known pre-launch defects: an N+1 `canRateTopic` await per Topic, and an unbounded load of every public Topic before slicing to featured + top-5 popular.

Naming constraint: the domain already owns **Subscription** = topic subscriber↔topic. The billing concept is a separate **Billing Subscription** (Stripe→plan); the two must never be conflated.

## Goals / Non-Goals

**Goals:**
- One `isAllowed(user, capability, resource)` gate is the sole decision point for authority and entitlement; no `role ===` / `plan ===` outside it.
- Real Stripe billing whose active subscription derives the plan (`free` = no row), with `users.plan` a webhook-synced projection.
- An admin console that shows per-user cost against budget and platform contribution, with inline role and budget-override edits.
- Manual scans gated by the daily scan limit, soft (metered) with a card on file and hard without.
- The two feed perf defects fixed, behavior preserved, with test coverage.
- Domain-model skill updated with the Billing Subscription noun.

**Non-Goals:**
- Reconstructing true profit or full accounting on the page — that stays in Stripe. The page shows *contribution* (net revenue − tracked variable cost), explicitly not profit.
- Proration/refund math in app code — we read Stripe's already-netted reporting figure.
- Chargeback-grade storage accounting — attributed storage is an attribution over globally-deduplicated Resources, for spotting heavy accounts only.
- Ingestion-cost tracking for Exa/paid sources — MTD variable cost covers only what already flows through the budget today (models, Firecrawl); the rest lands when ingestion tracking does.
- Enforcing the LiteLLM budget in app code — LiteLLM already does; we only set it from config.

## Decisions

### 1. The gate: `api/authorization.ts`, one module, async, owning both scalar and batched predicates
`isAllowed(user, capability, resource)` lives in a new `api/authorization.ts`. Capability keys: `topic:view`, `topic:edit`, `topic:delete`, `topic:create`, `scan:manual`, `topic:rate`, `admin:console`, `admin:setRole`, `admin:setBudget`. It resolves `role` + effective `plan` (one `users` row, as `loadUserAccess` does today) and, for resource capabilities, the owner/subscription facts it needs. Admin short-circuits to allowed for every entitlement and for `topic:*` authority.

The existing call sites (`quotas.ts` limits, `topics.ts` owner checks, `permissions.ts`, `loadTopicPayload`) refactor to call the gate. The scattered `role === "admin"` / `topic.ownerId === userId` comparisons move behind it.

- **Why not Better Auth's admin plugin / a lib like CASL?** Overkill for two roles and a handful of capabilities; the plans catalog is our own config. A thin function is testable and greppable.
- **Reconciling "one gate" with "batch the N+1":** the gate is the single *source of truth* for each predicate, but the hot feed path must not call `isAllowed` per Topic (that *is* the N+1). So `authorization.ts` exports both the scalar `isAllowed(...)` and a batched `rateableTopicIds(userId, topicIds): Promise<Set<string>>` that encodes the same subscriber rule in one query. The feed uses the batched form; everything else uses `isAllowed`. One predicate, two shapes, one module — still "no scattered checks."

### 2. Plan derivation via a projection, not a join on every read
`billing_subscriptions` is the Stripe-facing source of truth; the Stripe webhook writes both the row and the `users.plan` projection. `isAllowed`/quota reads keep reading `users.plan` (single row, unchanged shape).

- **Why not derive on every read (drop `users.plan`)?** Every entitlement check would grow a join; `users.plan` already exists and is read everywhere. Projection keeps reads O(1).
- **Why not store Stripe fields on `users` (no table)?** Loses "free = no row" and models cancel/resubscribe history poorly. (User chose `billingSubscriptions` + projection.)

### 3. `billing_subscriptions` shape
Columns: `id`, `userId` (fk cascade), `stripeCustomerId`, `stripeSubscriptionId`, `plan` (enum), `status` (text, mirrors Stripe: `active`/`past_due`/`canceled`/…), `currentPeriodEnd`, `hasPaymentMethod` (boolean, synced by webhook — drives the soft/hard cap without a Stripe round-trip at scan time), timestamps. One active row per user (a partial unique index or app-enforced). Status is plain text like `role`, mirroring Stripe rather than pinning an enum we'd chase.

### 4. Effective budget flows to the LiteLLM key
`effectiveBudgetCents = users.budget_override_cents ?? PLANS[plan].monthlyBudgetCents`. Provision it at signup (replacing `FREE_TIER_MONTHLY_BUDGET_USD`), and resize via LiteLLM `/key/update` on (a) plan change in the webhook and (b) override change in the admin write. MTD variable cost reads LiteLLM's recorded spend for the user's key (`/key/info`).

- **Why LiteLLM stays the enforcer:** it already caps spend atomically per key; app code only sets `max_budget` from config. One number, one source.

### 5. Manual-scan gating reuses the daily scan limit
There is no separate weekly limit — manual scans are gated by the existing `dailyScanLimit` (the shared scheduled-and-manual pool, counted via `scansToday`). `isAllowed(user, "scan:manual", topic)` owns the check; a card on file makes the daily ceiling soft (decision 6), no card keeps it hard.

### 6. Metered overage on the subscription's usage-based item
Overage bills through a metered price line on the user's Stripe subscription: when a manual Scan exceeds the daily scan limit and `hasPaymentMethod` is true, report a Stripe **usage record** for one unit. No payment method → hard reject before any scan work. See Open Questions for the free-tier edge.

- **Why usage records over one-off charges:** they roll onto the existing invoice, Stripe-native, no separate payment intent.

### 7. Admin console cost math (all SQL, read-only)
- **Attributed storage** per user: `octet_length(resources.content)` + `attachments.byte_size` + `EMBED_DIMENSIONS * 4 * (# embedded resources)`, summed over the user's Topics → Findings → Resources, **distinct per Resource per user** so a Resource in two of the user's Topics counts once. Labelled *attributed storage*.
- **MTD variable cost** per user: LiteLLM recorded spend for the user's key this month. Labelled *variable cost*.
- **Net revenue:** Stripe's reporting/balance figure (already nets refunds, proration, fees) — not a sum of list prices.
- **Contribution** = net revenue − Σ tracked variable cost − optional `FIXED_MONTHLY_COST_CENTS` (config, default `0`). Labelled *contribution*, never profit.

### 8. Feed fixes (behavior-preserving)
- **N+1:** `loadTopicFeedData` gains `rateableTopicIds` (one query: `subscriptions.subscriberUserId = userId` OR `subscriberAudienceId IN (user's audiences)`, intersected with the feed's Topic ids). `buildTopicFeed` becomes **synchronous**, computing `canRate = isOwner || (visibility is public/invite && set.has(topic.id))`.
- **Unbounded load:** compute the load set *before* fetching feed data = featured Topics (`featureOrder IS NOT NULL`) ∪ top-N non-featured by a subscriber-count subquery (`N = MAX_POPULAR_TOPICS`). Featured and Popular become disjoint. Owner "yours" and the signed-out path are untouched.
- Coverage added to a feeds test (round-trip count / correct `canRate` across both subscriber paths / bounded load).

### 9. Admin authority is uniform: view/edit/delete
For the admin to edit or delete any Topic through the existing UI, `loadTopicPayload`'s visibility gate (`canSeeTopic`) must admit admins — so `isAllowed(admin, "topic:view", topic)` is true for any Topic. This modifies `topic-detail-page`'s access requirement. (See Risks for the privacy implication.)

## Risks / Trade-offs

- **Webhook/projection drift** (a missed or out-of-order Stripe event leaves `users.plan` wrong) → verify signatures, treat events idempotently keyed by Stripe subscription id, and reconcile from the subscription's current state on every event rather than applying diffs.
- **Admins can read private Topic content** (decision 9) → this is inherent to a platform-admin override and matches the existing admin spend-visibility carve-out; note it explicitly and keep the role change itself gated (last-admin self-demotion blocked).
- **Attributed storage over-counts across users** (global Resources) → by design and labelled as attribution, not a chargeback; never presented as storage cost.
- **`octet_length(content)` scan cost** on a large `resources` table for the admin page → acceptable for an admin-only, low-traffic view; add an index or a cached rollup only if it measurably drags. `ponytail: full-table sum on read; cache/rollup if the admin page gets slow.`
- **Free-tier "card on file" mismatch** (metering needs a subscription item) → see Open Questions; default is paid-only overage, free hard-capped.
- **Refactoring every authority call site to the gate** risks a behavior change slipping in → the gate must be behavior-preserving for existing owner/plan rules (naming-accuracy bar); cover with the existing topics/quotas/permissions tests plus gate unit tests.

## Migration Plan

1. Additive Drizzle migration: create `billing_subscriptions`; add `users.budget_override_cents` (nullable) and `billing_subscriptions.has_payment_method`. No existing column changes.
2. Ship `authorization.ts` and refactor call sites behind it (no behavior change) — deployable before any Stripe wiring.
3. Add the `PLANS` `rank` field.
4. Wire Stripe: products/prices (`free`/`plus`/`premium`), Checkout, Customer Portal, webhook endpoint; enable Link via Dashboard toggle. Source the LiteLLM budget from the effective budget.
5. Admin console route + queries.
6. Feed perf fixes + tests (independent; can land first).
- **Rollback:** the schema is additive; disabling the Stripe webhook and admin route reverts to today's behavior with `users.plan` frozen at its last value.

## Open Questions

- **Free-tier metered overage:** Stripe usage records attach to a subscription item, so "card on file makes the cap soft" cleanly covers paid users (who inherently have a subscription + card). A *free* user with a card but no subscription has no metered item. **Recommendation:** overage applies to users with an active subscription carrying the metered item; free users are hard-capped. Confirm before implementing, or we add a standalone metered subscription for free users (heavier).
- **Admin viewing private Topics** (decision 9): confirm the privacy expansion is intended, or scope admin edit/delete to a dedicated admin path that never returns private Topic *content*.
- **Fixed-cost constant** for contribution: default `0` (omit) unless a real Northflank/Neon/R2 monthly figure is provided.
