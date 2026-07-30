---
name: domain-model
description: Canonical CarlNotes domain vocabulary. Use whenever naming types, tables, routes, variables, files, or writing specs and docs that touch domain concepts.
---

# CarlNotes domain model

> A **Topic** (owner = creator) is tuned with context and **Sources**; each **Scan** discovers **Resources** and appends **Findings** to the topic's **Feed**; users and **Audiences** hold **Subscriptions**, and **Integrations** connect Sources in and deliveries out.

| Entity | Is | Notes |
|---|---|---|
| Topic | the configuration | name, context doc, attachments (file in R2 + distilled context, generated once by the processing workflow after upload), frequency, visibility (public / invite / private), owner_id |
| Source | topic input: "pull from X" | kind: rss, reddit, youtube, search, composio, plugin; `integration_id` nullable (RSS needs none) |
| Scan | one execution of a topic's pipeline | domain word; Temporal keeps "run" at the infra layer only |
| Resource | canonical external artifact, deduped globally | url, content hash, embedding, kind (read / watch / listen) |
| Finding | topic-scoped judgment about a Resource | relevance score, relevance explanation; one Resource → many Findings |
| Feed | a topic's stream of Findings | the output side; "channel" is UI copy only |
| Subscription | subscriber ↔ topic join | subscriber is a user **or** an Audience; delivery prefs live here; rows are created at self-subscribe or invite acceptance, so `created_at` is the activation time; the owner holds one too, so scheduled deliveries reach them, but it is excluded from every subscriber count and `isSubscribed` check |
| Audience | a named set of users that subscribes as one | `audience_members` joins users; members inherit the audience's Subscription; a personal Subscription to the same topic shadows the inherited one |
| Integration | a user's connected external account | OAuth grant + scopes (Composio-managed or native); referenced by Sources (input) and Subscriptions (delivery) |
| Billing Subscription | a user's active Stripe subscription; the active row derives their plan | `billing_subscriptions`; free = no row; **distinct from Subscription** (a topic subscriber join) — never conflate the two |
| Bookmark | a per-user marker keeping a Finding | `bookmarks` mirrors `consumptions`; a bookmarked Finding is exempt from the max-results prune; never a `findings` column |

## Layering rules
- Integration = the credential; Source = an input use of it; delivery = an output use of it. Connected once, reused everywhere.
- Adapter = worker code turning a Source into Resources (see adapter-authoring). One composio adapter; toolkit variety lives in Source config, not code.
- Topic authority is `topic.owner_id`; the single platform override is an `admin` (`users.role`). Every authority **and** entitlement check routes through one `isAllowed(user, capability, resource)` gate — never a scattered `role ===` or `tier ===`. Topic access is still "a Subscription path exists."
- Entitlements come from the user's **plan** (`free`/`plus`/`premium`), derived from the active Billing Subscription (free = no row) and resolved by the gate.
- Invites are consent-based: a `topic_invites` row grants topic-page view and stands as a pending offer, and nothing is subscribed until the invitee accepts. On invite Topics a subscriber sees only Findings from Scans started after their activation; the owner always sees full history. One Scan serves every subscriber — the amortization the pricing model assumes.
- A Resource is raw and global; a Finding is scored and topic-scoped. Don't blur them. A Resource may carry a captured `engagement` count (like a reddit score) that read-side ranking uses.
- A Scan closes by pruning the Topic to its `max_results` best Findings by relevance; bookmarked Findings are never pruned.

## Auth infrastructure is not domain vocabulary
Better Auth manages `users`, `sessions`, `accounts`, `verifications` — identity/access plumbing, the same tier as `users` itself, never content-domain nouns. `accounts` is sign-in identity only (a password credential or an OAuth grant used to authenticate) and is never referenced by a Source or a Subscription. **Integration** stays the sole representation of a connected external account used for sourcing or delivery (e.g. Composio-managed Gmail) — never conflate the two, and never resolve Source/delivery credentials through `accounts`.

## Rejected terms — never introduce
- "Channel", "Follow" (UI copy only, never schema)
- "Item" (use Resource or Finding)
- "Update" (CRUD collision; use Scan or Finding)
- "Run" (Temporal's word, infra layer only; use Scan)
- "Crawl" (names one stage of five)
- "Group", "List", "Cohort" (use Audience)

## Rules
- Singular entity names in code (`Finding`), plural tables (`findings`).
- New domain