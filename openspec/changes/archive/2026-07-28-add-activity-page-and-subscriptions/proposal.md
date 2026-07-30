## Why

A signed-in user has no home for their own standing: their spend against budget lives nowhere they can see it, their subscriptions have no list, and topic invites grant access silently — an owner can force a topic into a stranger's view with no consent step. Meanwhile the sharing story is half-painted: the read path (visibility, subscriptions, featured/popular, subscriber counts) shipped, and a bare self-subscribe endpoint exists behind the topic-page bell, but there is no publish control, no invite consent, and no protection keeping a topic's earlier private-era Findings away from later joiners. The Activity page and the consent-based subscribe path close both gaps.

**Reconciliation note:** the prompt for this change states "no endpoint writes a subscription today" — that is stale against this codebase. `POST /api/topics/:id/subscription` (`setTopicSubscription`) already writes self-subscriptions behind the topic-page bell, and the edit modal already reconciles `topic_invites`. What is genuinely missing: the publish control, invite *consent* (today an invite grants access immediately, with nothing pending), the activation-gated Finding visibility for invite topics, and the Activity page itself.

## What Changes

**Activity page** (new, authenticated, own-data only, reached from the header menu when signed in)
- Spend section: a horizontal progress bar of month-to-date spend versus the effective monthly budget (plan backstop, or the per-user override when set), reading the same per-user Scan-budget spend the admin page reports — never a second cost figure. Labelled as metered variable spend against budget, not a bill.
- Topics accordion (default expanded): one row per owned Topic — name, scan count this month, created date, last updated date, a link to the topic page, and month-to-date spend as the last column. Clicking a topic's spend cell expands its scan history beneath the row: one row per Scan this month with date, resources kept, and the Scan's spend last. Every spend column is the last column of its table; every table is followed by a summary line carrying the column totals. Spend renders through the shared cents-to-dollars helper the admin cost column uses; all figures are month-to-date and reset with the budget period.
- Subscriptions accordion: the topics the user subscribes to (active rows they do not own), each linking to its topic page, shown only when non-empty.
- Pending-invites accordion: the user's pending invites with approve and deny controls, shown only when there are pending invites.

**Publish and subscribe write path**
- Publish: an owner-only control that sets `topics.visibility`; invite yields a shareable unlisted link (the topic URL — access stays email-gated as today, "unlisted" means not listed on the homepage). Demoting a public topic to private leaves subscription rows in place; they simply stop resolving, and re-publishing restores the previous subscribers. Nothing is deleted.
- Self-subscribe to a public topic: the existing Subscribe bell behavior, kept — creates and removes the caller's own subscription row on a topic they can already see, refused on a private topic, idempotent on repeat, no consent step (the user is granting themselves read access to already-public content).
- Owner-initiated invites become consent-based: an invite never silently subscribes anyone. An invite is pending until the invitee accepts — the invitee sees it on their own Activity page and approves (subscription row created, active from that moment) or denies (invite deleted). No email is sent; the approve/deny inbox is on-platform. Only the owner adds invitees, and only to their own topic. Authority stays `topic.owner_id` throughout; a subscriber gets read access through the subscription path, never through a role.
- Post-acceptance visibility on invite topics (where the subscription is the sole access grant): a subscriber sees only Findings whose Scan started after their subscription became active — never the back catalogue, so private-era context can't leak to later joiners. The owner is exempt and always sees full history. Public topics stay fully browsable for everyone, subscribers included. Because an invite acceptor therefore sees nothing until the next scheduled Scan, the accept controls carry a static disclaimer and acceptance shows a toast, both worded around the next scheduled scan.
- One Scan serves every subscriber — the amortization the pricing model assumes; documented, and the domain-model skill kept in sync.

## Capabilities

### New Capabilities
- `activity-page`: the authenticated Activity page — spend versus budget, the owned-topics accordion with per-Scan drill-down and totals, the subscriptions accordion, and the pending-invites inbox.
- `topic-publishing`: the owner publish control, consent-based invites (pending → accept/deny), and the activation-gated Finding visibility on invite topics with its consent-moment disclaimers.

### Modified Capabilities
- `topic-editing`: invitees stop granting access on save — saving invitees creates pending invites requiring acceptance.
- `topic-detail-page`: the bell on an invite topic acts on the viewer's invite (accept), and invite-topic Findings follow the activation gate; the page-view rule is unchanged.
- `domain-schema`: the topic-invite row's meaning changes — it grants topic-page view and a *pending* subscription offer, not subscribe access; a Subscription's `created_at` is its activation time.

## Impact

- **API**: new Activity payload endpoint; a lightweight owner visibility endpoint (publish control); an invite accept/deny endpoint; `isTopicFindingVisible` and the topic-page Findings load gain the activation gate for invite topics; `setTopicSubscription` unchanged for public topics, accept-semantics on invite topics.
- **DB**: **no migration** — pending state is an invite row with no subscription row, and activation time is the subscription row's existing `created_at`.
- **UI**: new ActivityPage (header link when signed in), publish control with copy-link, accept/deny controls with the next-scan disclaimer and toast; `formatCents` moves from AdminPage into the shared ui lib.
- **Docs/skills**: domain-model skill notes the invite consent lifecycle, activation-gated invite visibility, and the one-scan-serves-every-subscriber amortization.
- **No new dependencies.**
