## Context

The read path shipped: `topics.visibility`, the `subscriptions` table (user XOR audience), `buildTopicFeeds` surfacing public Topics, `isTopicFindingVisible`/`canRateTopic` enforcing access, `subscriberCount` on the feed payload. A bare write path partially shipped too: `POST /api/topics/:id/subscription` (`setTopicSubscription`) behind the topic-page bell, and `updateTopic` reconciling `topic_invites`. What does not exist: a publish control, invite consent (an invite grants access immediately today), any distinction between a topic's back catalogue and what a new joiner should see, and a page where a user sees their own spend, subscriptions, and invites.

Billing landed the pieces this page reads: `effectiveBudgetCents` (override ?? plan backstop), `readLiteLLMKeySpend` (the observed per-user spend the admin console reports), and per-Scan `scans.cost` already summed month-to-date elsewhere (`monthCost`).

Two forks were resolved with the user before this design:
- **Activation gate scope: invite topics only.** Public topics stay fully browsable for everyone, subscribers included — on a public topic the gate would protect nothing (logging out reveals the catalogue), and self-subscribe is explicitly "read access to already-public content".
- **Unlisted link: email-gated, as today.** The link is the topic URL; "unlisted" means not listed on the homepage. No link-bearer access mode.

## Goals / Non-Goals

**Goals:**
- The Activity page: spend vs effective budget, owned-topics accordion with per-Scan drill-down and totals, subscriptions accordion, pending-invites inbox.
- Consent-based invites: pending until accepted, approve/deny on Activity, nothing granted before acceptance.
- Activation-gated Finding visibility on invite topics; owner exempt; next-scan disclaimers at the consent moment.
- The owner publish control with a copy-link affordance.
- Zero schema migration.

**Non-Goals:**
- Invite emails or any off-platform notification — the inbox is on-platform.
- Changing public-topic browsing, the homepage feed, or rating rules.
- A second cost figure — Activity reads the same spend sources the admin console and topic pages already read.
- Delivery frequency/digests (the `subscriptions.frequency` column stays untouched).

## Decisions

### 1. Pending state is an invite row with no subscription row — no migration
A "pending invite" for user U on topic T is: a `topic_invites` row matching U's email AND no `subscriptions` row for (T, U). Accepting creates the subscription row; denying deletes the invite row. No status column is added.
- **Why not a `status` column on `subscriptions`?** A pending row needs a `subscriber_user_id`, so it cannot represent an invite to an email with no account — `topic_invites` (email-keyed, pre-account) already models exactly that. Two pending mechanisms would drift; one already exists.
- Consequence: the Activity inbox query is one join (invites on my email, left-joined to my subscription rows, keep the nulls). An invite to an unregistered email becomes visible as pending the moment that email signs up, with no signup-hook code.

### 2. Activation time is `subscriptions.created_at`
Subscription rows are only ever created at self-subscribe or invite acceptance, so `created_at` IS the activation instant. The invite-topic Finding gate compares `scans.started_at > subscriptions.created_at` (the Scan that last touched the Finding, via `findings.scan_id`). Audience-granted subscriptions activate at the audience subscription row's `created_at`; members inherit it.

### 3. Where the gate is enforced
`isTopicFindingVisible`'s invite branch changes from `isInvited OR hasSubscription` to an activation-aware subscription check, and the topic-page Findings load (`loadTopicFindings` for a non-owner invite-topic viewer) filters by the same rule. Page-level view (`canSeeTopic`) keeps `isInvited` — an invitee can open the page to decide, they just see no Findings until they accept and a new Scan runs. This is a deliberate behavior change for existing invitees (today they see Findings pre-subscription); called out in Risks.

### 4. API surface
- `GET /api/activity` — one payload: `{ spendCents, budgetCents, topics: [{id, name, scanCountMonth, createdAt, updatedAt, monthCostCents, scans: [{id, startedAt, keptCount, costCents}]}], subscriptions: [{topicId, name}], pendingInvites: [{topicId, name, invitedAt}] }`. Scans ride along per topic (month-scoped, small) so the drill-down needs no second request.
- `POST /api/topics/:id/visibility { visibility }` — the publish control, authorized by `isAllowed(user, "topic:edit", topic)`. A dedicated light endpoint because `updateTopic`'s payload demands the full invitee/source lists — wrong shape for a one-click control.
- `POST /api/topics/:id/invite-response { isAccepted }` — invitee-only: accept inserts the subscription row (idempotent via the existing direct-subscription lookup), deny deletes the invite row for the caller's email.
- The bell keeps `POST /api/topics/:id/subscription`; on an invite topic an invited user's subscribe IS acceptance — both paths converge on the same row insert, so there is one write shape.

### 5. Spend figures reuse, never recompute
The bar: `readLiteLLMKeySpend(user.litellmVirtualKey)` vs `effectiveBudgetCents(...)` — identical sourcing to the admin row, converted with the same shared cents formatter (moved from `AdminPage` into the ui lib). Per-topic and per-Scan rows: `scans.cost` month-to-date, the same source `monthCost` already uses. Known nuance, inherited from the admin page: LiteLLM budgets reset on a rolling 30-day window while the Scan sums use the UTC calendar month — both figures are labelled month-to-date and reset with the budget period, matching the admin console's presentation.

### 6. UI shape
`ActivityPage` at `/activity`, header link when signed in (beside Account). Accordions with the repo's primitives; topics accordion default-expanded; spend cells right-aligned last columns; a totals line after every table. Accept controls carry the static next-scan disclaimer; acceptance fires the sonner toast. The publish control lives on the topic page for the owner (visibility select + copy-link when invite), reusing the disclaimer copy beside the bell on invite topics.

## Risks / Trade-offs

- **[Behavior change] Existing invitees lose pre-acceptance Finding visibility** → intended (consent is the point); invitees keep page view, and accepting restores Findings from the next Scan. Called out in the proposal.
- **[Expectation] An acceptor sees an empty topic until the next scheduled Scan** → the disclaimer + toast set the next-scan expectation at the consent moment; weekly topics won't read as broken.
- **[Attribution] A Finding re-scored by a later Scan becomes visible to subscribers who joined before that Scan** → acceptable: `scan_id` tracks the last touch, and a re-score is a fresh judgment under current configuration.
- **[Perf] The Activity payload loads a month of Scans per owned Topic** → bounded by the plan's topic cap × daily scan limit; one batched query grouped in memory, the feed pattern. Revisit only if it drags.

## Migration Plan

No database migration. Ship order: (1) activation gate + invite-response + visibility endpoints with tests, (2) Activity payload endpoint, (3) UI (page, header link, publish control, disclaimers), (4) domain-model skill sync. Each step deploys independently; rollback is removing routes/UI, since no data shape changed.

## Open Questions

- None — both product forks (gate scope, link semantics) were resolved with the user before this design.
