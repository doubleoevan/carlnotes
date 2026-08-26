## Context

A Topic's authority today is its `owner_id` and nothing else. `isAllowed` in `api/authorization.ts` answers `topic:edit`, `topic:delete`, and the scan capabilities with `topic.ownerId === userId`, `canSeeTopic` in `api/topic/permissions.ts` answers reads with owner-or-public plus the invite and subscription branches, and beyond those two files the research found inline ownership checks in the feed queries, topic detail, attachments, subscriptions, featuring, chat, and profiles. Rewiring that assumption is the whole risk of this change, which is why it happens once, in one helper.

Around that core, the facts the design leans on:

- Usernames are unique per user through `users.username_normalized` and its unique index, with a five-word reserved set in `shared/usernames.ts` aimed at staff impersonation, not routes. Profiles live at `/profiles/:userId`, so no route collides with a name today — the collision arrives with team pages.
- The audiences scaffolding — `audiences`, `audience_members`, `subscriptions.subscriber_audience_id`, the XOR check — has no write path anywhere. Both tables are empty in every real database. Every reader is a dead OR-branch.
- A subscription is the delivery and follower mechanism: `is_active` gates membership in counts and feeds, `is_email_enabled` gates mail, and `recountTopicSubscribers` keeps `topics.subscriber_count` honest inside every mutating transaction.
- A rating is one nullable column on `findings` with no rater identity at all. Bookmarks are per-user rows, only the topic owner may create one, and the scan-time prune in `worker/review/index.ts` (`filterTopicFindings`) spares a Finding bookmarked by anyone, with no access check.
- Coffee talk is solo: `chat_turns` keyed by user and topic is both the transcript and the spend ledger, replies stream over plain chunked HTTP, and the monthly budget sums `scans.cost` plus `chat_turns.cost`. There is no SSE, no LISTEN/NOTIFY, and no websocket anywhere in the repo.
- The database client is `@neondatabase/serverless` over WebSocket — the full Postgres protocol, so LISTEN/NOTIFY works, but only on a direct connection, not through Neon's pooler endpoint.
- The invites table (from `add-invite-links`, on this branch) includes a token, limits, expiry, and revocation, and its acceptance lifecycle is already target-agnostic; what binds it to Topics is authorization, the dedupe key, and the accepted destination.

## Goals / Non-Goals

**Goals:**

- A named set of people can hold Topics together, edit them, and talk about them with Carl in one room.
- One permission helper answers every access question; no inline ownership check survives.
- Usernames stay unique among users; team pages are id-addressed, so no name can collide with a URL.
- Joining a Team is quiet: feed presence and follower counts without a digest flood.
- Every signal worth tuning on later is recorded from day one, and none of it is acted on.

**Non-Goals:**

- A Teams pricing tier. One Scan serves every subscriber, so collaboration costs nothing extra, and gating it behind a tier suppresses the behavior that brings new users in.
- An Org layer above Team. Deferred until a real multi-team company asks. Org and Workspace join the banned-noun list so it stays deferred.
- A Team as a billing object. It owns no wallet, holds no balance, and has no plan.
- Transferring Topic ownership to the Team. A one-way door that loses a departing member's work and forces the Team to hold a wallet.
- Team-owned bookmarks, for the reasons in the bookmarks decision below.
- A proactive mode where Carl speaks unprompted. Deferred, not missing.
- Tuning from the captured signals. Recording only; aggregation, scoring, and rule extraction are decided later.

## Decisions

### Usernames unique by index, teams addressed by id

Username uniqueness lives on a unique index over `users.username_normalized`; teams register no slug at all. The reserved list beside the username rules covers the root-route inventory — login, join, invite, api, topics, teams, admin, signup, reset-password, activity, account, plans, privacy, profiles, terms, blog, docs, pricing, and the static file names served at root — plus settings, t, all, and carl, reserved ahead of need, so no future vanity-url work can collide with an existing name.

Team pages live at `/teams/:teamId`. A team name registers no slug and can change freely, the way a username can, so no url ever points at a name; a caseless unique index keeps two teams from taking the same one.

### Schema: attachment grants, ownership funds

`teams`: id, name, description, `avatar_key`, `is_public` defaulting to false, created_at. `team_members`: `team_id`, `user_id`, `role` (lead or member), `is_members_visible` defaulting to true, `invited_by_user_id`, created_at, unique on team and user. `topics` gains a nullable `team_id` naming the owning team, and `team_topics` — team, topic, created_at, primary key on the pair, index on the topic — records the additional teams a topic is shared into.

`topics.owner_id` remains the creator and continues to fund every Scan — the prompt's `user_id` is this codebase's `owner_id`. Attachment grants access and places the Topic on the team page; it transfers nothing. A Topic has one owning team at most and any number of teams it is shared into: attaching an unowned Topic writes `team_id` and makes the team its owner only when the Topic's owner leads the attaching team, every other attach writes a `team_topics` row and shares it in — so a team the owner does not lead never owns what it added — and the one rejection left is a team attaching a Topic it already holds. A picker offering Topics to attach leaves out only what the target team holds. Detaching ends whichever holding that team has — when the owning team lets go, the oldest holding team the owner leads takes the owning slot, and with no such team the owning column returns the Topic to its creator; a shared holding just ends — and both directions are reversible. The owning team is the byline credit; a shared-into team gets the page listing, the access, and its own room.

### The permission helper: an effective role, not a boolean

A new resolver answers "what is this viewer to this Topic": `owner` when `topic.ownerId` matches, the member's strongest role across the holding teams — the owning `topic.teamId` beside the `team_topics` shares — when the viewer belongs to one, and room for a direct per-topic grant if one is later added — a union of grants resolved into one effective role. It lives beside `canSeeTopic` and is consumed by `isAllowed`, which stays the single gate the house rules require; routes and query builders both reach it through `isAllowed` and the query fragments the helper exports, never an inline check. The research's inventory of inline `ownerId` comparisons — feeds, topic detail, attachments, subscriptions, chat, profiles — is the worklist this replaces.

Capability changes: `topic:view` adds the membership branch; `topic:edit` allows owner, lead, and member (a member edits team Topics); attach, detach, membership, and the public toggle are lead-only; `topic:delete` and the scan capabilities stay owner-only, because the owner funds them.

An unauthorized read of a private or team Topic answers 404, indistinguishable from a missing id, so existence is not disclosed. The invite-topic gate — the named 403 that walks an invitee through sign-in — stays, because disclosure to the invited is its purpose. Writes follow reads: a non-member's write to a team Topic answers 404.

### Members see a team Topic's full history

The invite-topic cutoff (`findingsActivationCutoff`) shows a subscriber only Findings from Scans after their subscription activated. That rule continues untouched for what it governs today: non-member subscribers of invite-visibility Topics. Team membership reads full history, like ownership, because a member can edit the Topic — an editor blind to half the Finding set would be editing a Topic they cannot see. This is a deliberate divergence from reading the prompt's "post-acceptance visibility rule continues to govern which Findings a member sees" as applying the cutoff to members; applying it would break shared editing, and the rule's own home is invite visibility, not membership.

### Joining writes muted Subscriptions

Joining a Team with twenty Topics must not send twenty digests, but the member does belong to those Topics: they should see them in their feed and count among followers. So the join writes a Subscription row per team Topic with `is_active` true and `is_email_enabled` false, and each new attachment writes the same for every member. Active rows make feeds and follower counts work with no new mechanism; the muted email flag keeps inboxes quiet; the member unmutes per Topic with the existing preference toggle. Membership and subscription stay separable afterwards: a member may unsubscribe from a team Topic and keeps access through the Team, since access comes from membership and delivery comes from the Subscription.

Two wrinkles the join path must handle. First, these rows are written directly, not through `setTopicSubscription`, whose guard rejects private Topics and owners — membership is the authority here. Second, the join copies the Topic's frequency onto the row. The research found that nothing ever writes `subscriptions.frequency`, while delivery filters on it matching the Topic's frequency — an existing defect that silently unsubscribes every follower of a weekly Topic from mail. The join must not replicate it, and the defect itself is flagged separately instead of fixed here.

Removing a member deactivates their Subscriptions on the Team's Topics along with their membership, keeping any Topic they still reach through another holding team they belong to. Without that, a subscription to a private team Topic would keep the Topic in a departed member's feed — the feed's subscribed section trusts subscriptions and does not re-check visibility.

### Bookmarks stay personal, and the prune gains an access check

Team-owned bookmarks are the obvious wrong answer, recorded here so they are not rediscovered. A bookmark has two separable effects. It exempts a Finding from the max-results prune — inherently shared, since there is one Finding set per Topic, not one per reader. And it drives that person's Bookmarked view and pinned position — personal. Moving the personal half to the Team costs three things: it anonymizes the strongest implicit positive label in the product, directly undoing the provenance this same change adds to thumbs; it lets any member destroy another member's save with no undo and no attribution; and it breaks the private use of a bookmark — holding something to come back to — so people stop saving once saving broadcasts. A deliberately assembled shared reading list is a different noun, a collection, and is deferred instead of solved by overloading bookmark.

What changes: who may bookmark widens from owner to anyone the helper grants access (the prune exemption is shared, so a member's save protecting a Finding is the desired behavior — and the widened rule is what makes the team scope below coherent). The Bookmarked position in the feed filter gains a scope on team Topics — Mine and Team, Team showing every member's bookmarks with the saver's avatar. Removing a bookmark only ever removes the acting user's own row. And the prune exemption gains the check it silently lacks: today `filterTopicFindings` spares a Finding bookmarked by anyone, forever; it will spare a Finding only while some bookmark holder still has access, so a departed member's saves stop holding Findings past the prune and drop out of the Team view together.

### Two team visibility values, and per-Team member-visibility opt-out

A Team is private or public — no invite state, because membership already is the invite list and no third class of person holds a link. Private is the default: the page answers outsiders 403 with nothing but the Team's name and a way to ask for an invitation, while a missing id stays 404. The public toggle is lead-only.

Member visibility is per member per Team on `team_members.is_members_visible`, defaulting to visible, since someone may want to be listed on one Team and not another. Opting out hides that member from the public page only and never from other members, who always see the full members list. The public page lists visible members then a count of the remainder, so a Team never appears smaller than it is. Every member may opt out, leaving a page with no members listed, instead of forcing one person to be visible.

### Topic visibility stays three-valued; attribution is derived

Topic visibility keeps public, invite, and private, independent of Team attachment: a private team Topic is visible to the Team only, an invite team Topic adds its link and email holders, and a public team Topic is readable by anyone and listed on the team page when that page is public. No fourth value.

Attribution on a public Topic is derived instead of stored: the byline credits the owning team when the Team is public or the viewer is one of its members, and the creator otherwise — a team the Topic is only shared into never takes the byline — so flipping a Team public moves attribution with no migration. A member who opted out of the members stays hidden under team attribution — consistent, not a special case. The byline links to the team page when the viewer can reach it (public Team, or the viewer is a member) and to the creator's profile otherwise, so an outsider is never linked to a team page that refuses them.

### Signal capture: columns now, decisions later

The one part of this change with no feature attached. None of these can be backfilled, and every Scan that runs without them produces a permanently unusable batch of labels. Three captures, all inactive:

- Rater identity on the existing thumb. `findings` gains `rated_by_user_id`, `rated_team_id`, and `rated_role`, written when a rating is cast and cleared with it. Denormalized deliberately — roles change, and a label must keep the meaning it had when it was cast. The thumb stays one per Finding; a per-label history is part of the deferred tuning work.
- Freeform feedback. A table storing verbatim text against the Finding and the Topic, written from a small input in the finding popover. No extraction, no rule derivation, no effect on scoring. A sentence explaining why something was wrong is worth more later than the thumb beside it, and it is only available the moment the person types it.
- View events. A table recording opened and dismissal (marked read without ever opening). Today only a view counter and a consumed row exist; dismissal is captured nowhere. How long a finding stays open is analytics, and belongs in PostHog rather than this database.

None of it is used: not surfaced, not scored with, not wired into ranking. The room transcript is likewise excluded — see the team-chat invariant.

### One invites table with a target

The invites table from `add-invite-links` generalizes instead of growing a parallel mechanism: it renames to `invites`, `topic_id` becomes nullable, a nullable `team_id` arrives, and a check requires exactly one target. The token lifecycle — limits, expiry, revocation, refusals — is already target-agnostic. What forks by target is authorization (lead for a team invite), the membership write (a `team_members` row plus the muted Subscriptions, instead of `activateSubscription`), and which page acceptance opens. Removing a member revokes access on the next request and leaves their authored room messages in place, still attributed.

`add-invite-links` must archive before this change does, since this delta modifies that change's invites requirement.

### Roles, departure, and deletion

Lead and member only. A lead manages membership, promotes other leads, attaches and detaches Topics, and controls the public toggle. A member edits team Topics and chats. Multiple leads are allowed, and a Team may never reach zero: the last lead cannot leave or demote themselves without promoting someone first.

Departure and deletion get explicit rules or they become support tickets. When a team Topic's creator leaves its owning Team or their plan can no longer fund it, its Scans pause instead of failing silently, until the creator can fund it again or the Topic leaves the Team. Deleting a Team nulls `team_id` on the Topics it owns, returning them to their creators, and its shared holdings end with the join rows.

### Identity, entry points, and the team page

A Team is the Lucide `Users` icon everywhere one appears — the header menu item, the Team Up button, the teams index, the team badge on a Topic, the team page header. The research confirmed the icon is unused today, so it introduces no ambiguity. No second team icon.

Two entry points share one create modal. The Team Up button sits at the end of the topic page's action row, immediately right of Follow, and holds that position whether or not Follow renders — ordering the row and letting each button render on its own condition needs no special case for a private Topic, where Follow does not exist. An owner sees Team Up alone, a team member sees it beside their Follow state, an outsider sees Team Up beside Follow, and Follow alone on a private Topic. On an unheld Topic it opens the modal — two lines on what a Team gives you, shared editing and a room with Carl — offering attachment to an existing Team the viewer leads or creating a new one with the name prefilled from the Topic. On a held Topic the icon fills for a leader of a holding Team, whose menu lists each led holding Team with a remove X and each other led Team as an "Add to <team>" row behind a plus, sharing the Topic in; everyone else keeps the plain attach view.

The teams index at `/teams`, reached from a Teams item in the header menu directly below Profile (both are identity surfaces; someone looking for one is usually looking for the other), lists the viewer's Teams with their role, a New Team button, and the leave button governed by the last-lead rule. It is the only place to leave a Team. Creating from the index has no Topic to borrow, so the modal offers a multiselect of the Topics the viewer may bring — a Topic held elsewhere included, since attaching shares it in — and suggests a name instead of presenting an empty field, because naming is where people stall. One modal, both entry points, differing only in prefill and multiselect.

The team page is the profile template pointed at a Team — layout, topic table, follower count — plus the members and, for a lead, membership management, attach and detach, and the public toggle. The topic table is the profile page's own component over the same row contract, with a lead-only Active column for detaching, so the two pages never drift and no creator's plan name appears on it. Copy keeps the codebase's existing pattern: small uppercase section labels, Carl-voiced body copy per the Notion Persona & Voice page.

### Limits, mirrored from the existing quota patterns

A per-Team member limit on free and a daily creation limit, each following the house pattern: a constant or PLANS field, an admin-bypassed live count in `db/quotas.ts` or the gate, a check before the write, a 429 from the route. The member limit reads the best plan among the Team's leads, so one paying lead lifts it — a soft upsell, not a tier. No plan limits how many Teams an account leads; the daily creation limit is the only brake on making them. Chosen defaults, adjusted at review: 10 members per Team on free (unlimited paid), 20 Team creations per account per day. The creation limit is set by what it actually bounds, which is how many pending invitations one sender can stack on one person, since a username invite spends no invite allowance and one invite exists per team per person.

### The room: scope, and why it is not a public chat room

Every team holding a Topic gets its own shared, persistent Coffee talk room on it, addressed by team — the routes are `/topics/:id/rooms/:teamId` and `/topics/:id/rooms/:teamId/events`, and `room_messages`, `room_summaries`, and `room_attachments` all name their team. Room access follows the addressed team, never the Topic's visibility: a public team Topic still has its rooms because exposure comes from who can post, not who can read — followers read the feed and never see a room. A Topic no team holds has no room at all, which is what keeps this from becoming a public chat room with a moderation queue attached. Both rules are enforced at the API — the SSE stream, the message post, and the transcript read all answer 404 to non-members of the addressed team — not just by hiding the control. The topic page shows the rooms of the holding teams the viewer belongs to, `TopicResponse.roomTeams`, with a switcher when there is more than one.

### Carl speaks only when addressed

He reads every message and answers only an @carl mention, the room-wide @all, or a reply to one of his own messages, and never a message aimed at one other person. An unaddressed composer message defaults to @all — the composer prefixes it — so it notifies every member and Carl answers it. That rule keeps him from being muted, ties the bill to intent instead of to how talkative the room is, and avoids the worst failure mode of an assistant in a group: answering a question meant for someone else. Replies are a real mechanism — a message may reference a prior message id — so continuing a thread with Carl needs no re-mention.

### One mention parser, two outcomes

Typing @ opens an autocomplete listing Carl pinned first — he is why the room exists — then the room's team members by username, with @all as a reserved name addressing the whole room: every member is notified and Carl answers. One parser produces the mention spans; the outcomes differ by target. A member mention is a notification and nothing else: no completion, no cost, surfaced through the member's existing Activity page instead of a second notification surface. A Carl mention starts a completion and is billed. The composer placeholder teaches the mechanic — "@all, penny for your thoughts…", following whichever target the composer's chip names — because a placeholder is the cheapest teacher and the room is otherwise silent about how to wake him.

### Billing: the mentioner pays, through the ledger that already exists

Per mention, charged to the person who mentioned him — never the Topic creator, never the Team, which holds no wallet. The completion runs under the mentioner's LiteLLM key, and the mentioner's coffee budget is checked before the completion starts, not after it returns. An empty budget delivers Carl's refusal privately to that person — a public out-of-credit moment in front of teammates is a bad moment — and posts nothing to the room.

The ledger is the existing one: a room completion writes a `chat_turns` row for the mentioner with the cost, a new nullable room message reference, and a new nullable token count. Reusing the ledger means `isMonthlySpendExhausted`, the spend meter, and the Account page's chat spend line all keep working with zero changes — the alternative, a separate mention ledger, would need its own sum folded into every budget read. That table answers the median-cost question and any later per-team spend view.

### Presentation: phone-shaped messages, one component, one docked width

Messages render the shape people know: the author's avatar beside the bubble, display name above it, on every message in both the solo and team rooms, never collapsed on consecutive messages from one author. Deliberate, not an oversight: one component serves both rooms with no participant-count branching, and when Carl and several people interleave there is never a bubble whose author must be inferred from position. Carl's avatar is the raccoon — the same art as the social avatar — added under `ui/src` and imported by the component so the bundler hashes and caches it like any other asset, never fetched per message. His display name is Carl, per the Persona & Voice page.

The Coffee talk panel keeps its docked width, with the expand toggle as the way to the large view and the message column limited so a line stays in a comfortable reading range instead of stretching a wide monitor. A substantially wider docked panel was tried and rejected for covering too much of the page. The room is a place several people read at length now, and the expanded view is where they do it.

### Transport: Postgres log, SSE cursor, LISTEN/NOTIFY

A room message table is the log; the stream is SSE with a cursor on the message id; fan-out across Northflank instances uses LISTEN/NOTIFY. No websocket service, no edge state product at this scale. Specifics forced by the codebase:

- Message ids are a bigint identity, not the uuid `primaryId()` the other tables use, because a reconnect resumes from the cursor instead of replaying the room, and resumption needs ordered ids. Each message records its author's name at post time beside the nullable account reference, which is what keeps attribution through account closes.
- The app's pooled Neon client speaks the full Postgres protocol, but LISTEN requires a dedicated connection on the direct (non-pooler) connection string, held once per instance beside the pool.
- Messages record an author, and the author's username is included in the content sent to the model — the role field alone cannot tell Carl who asked what.
- Carl's turns take a per-room advisory lock (`pg_advisory_xact_lock` on a hash of the topic and team ids) around the transcript read and the summary roll only, released before the model call, so no pooled connection or lock is held for a completion's whole runtime. Two overlapping mentions may therefore both answer the pre-reply transcript — a weaker serialization accepted in exchange for freeing the pool.
- Message text is encrypted at the application layer with the existing chat helper, matching the solo transcript.

### Context budget

A completion includes the last thirty turns plus the Topic's retrieved Findings through the existing retrieval path. Older turns roll into a running summary — one row per room, updated as turns age out — instead of growing the window forever, and individual message length is limited, because every participant's words are paid for by whoever mentions Carl next.

### Membership changes and the tuning invariant

A member removed from the Team loses room access on the next request. Their authored messages remain, attributed by the name recorded at post time — deleting them would silently rewrite a conversation other people took part in. An account closing later clears the message's account reference and keeps the recorded name, so the transcript stays whole and a cleared author can never read as Carl.

The room transcript never feeds scoring, reranking, or the Topic's context embedding that the relevance gate compares unscored Resources against. If a conversation should change how Carl scores, it does so through an approved revision to the Topic's context document — that is the tuning path, and this is not it.

### Dropping audiences, not deprecating them

Teams and Audiences are the same idea — a named set of users that subscribes as one — and the domain-model skill exists precisely to prevent two nouns for one concept. Since no write path ever existed and both tables are empty everywhere, removal is a code deletion plus one migration: drop both tables and the column, drop the XOR check, make `subscriptions.subscriber_user_id` NOT NULL, and delete every dead OR-branch the research inventoried across authorization, permissions, feeds, subscriber counts, activity, profiles, and notify. The `audienceName` field leaves the subscription contract and its read-only row treatment leaves the table UI. Leaving the scaffolding in place unused was considered and rejected: it costs a XOR check on every subscription write, an extra join in every permission read, and a second noun forever.

## Risks / Trade-offs

- **The permission rewrite touches every read path.** → It goes in first, with the helper tested across every role-and-visibility combination before any Team UI exists, and the old checks are deleted instead of left as fallbacks, so a missed call site fails loudly in review instead of silently diverging.
- **404-on-unauthorized changes today's 403s.** → Only for private and team Topics, where hiding existence is the point. The invite gate keeps its named 403, and the tests pin both.
- **Existing users whose names are newly reserved keep them.** → Accepted: renaming real accounts is worse. New registrations are blocked; the reserved list is enforced at creation time only.
- **Muted Subscriptions inflate follower counts the day a big Team joins.** → Intended: members do belong to those Topics. The count stays honest about people with access who chose to be there.
- **A LISTEN connection per instance is new operational surface.** → One dedicated client with reconnect-and-resume from the cursor; a dropped listener degrades to reconnect, never to lost messages, because the log is the source of truth and SSE replays from the cursor.
- **Two open changes edit the same invites requirement.** → Archive order is stated in the proposal, and this change's delta names the requirement as `add-invite-links` leaves it.
- **The prune's new access check changes existing behavior for legacy non-owner bookmarks.** → Today those are rare (only owners could create bookmarks); the check makes the documented rule true instead of approximately true.
- **Room spend goes through `chat_turns`, so a room completion is indistinguishable from a solo turn in old spend views.** → The room message reference distinguishes them where it matters; the budget math deliberately does not care.

## Migration Plan

Order inside one change: (1) the unique index on `users.username_normalized`; (2) teams with the caseless unique name index, team_members, `topics.team_id`, and the `team_topics` share join; (3) the audience drop and the subscriber-column NOT NULL; (4) invites rename and target; (5) signal columns and tables; (6) room tables. Each is additive or drops something never written, so rollback is dropping what the step added; the audience drop is the one destructive step, and it destroys rows that cannot exist.

## Open Questions

- The limit defaults (10 free members, 5 creations per day) are chosen, not derived. Adjust at review.
