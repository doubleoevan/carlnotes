## Why

Everything in CarlNotes is single-player. A Topic has one owner, its edit rights stop at that owner, and the only way to work on one together is to share an account. A Team gives a named set of people shared Topics, its own page, and a shared Coffee talk room where Carl joins the conversation — and collaboration costs the platform nothing extra, because one Scan already serves every subscriber of a Topic.

This supersedes the Audiences model. Audiences were scaffolded into the schema and never built: no route, no UI, and no write path ever existed, so the `audiences` and `audience_members` tables are empty in every real database and every audience branch in the code is dead. Teams replace the idea, and this change removes the scaffolding instead of leaving two nouns for a named set of people.

## What Changes

Two new capabilities, designed together and split so the room can be revised or deferred without reopening the authorization design. The `team-chat` capability adds no permission logic of its own — it consumes the teams permission helper.

**teams:**

Team pages are id-addressed like profiles, so names change freely and register nothing.
- `teams`, `team_members`, and `team_topics` tables, with roles lead and member. A nullable `topics.team_id` names the owning team and `team_topics` shares a Topic into any number of others; every holding grants access and places the Topic on that team's page, while `topics.owner_id` stays the creator and keeps funding every Scan.
- One permission helper resolves a viewer's effective role on a Topic — owner, lead, member, or none, reading membership across every holding team — and every route and query builder calls it instead of inline `owner_id` checks. An unauthorized read of a private or team Topic answers 404, not 403.
- Joining a Team writes a muted Subscription per team Topic, so members see team Topics in their feed and count among followers without receiving twenty digests.
- Bookmarks stay personal. A team Topic's Bookmarked view gains a Mine / Team scope toggle, and the scan-time prune keeps a Finding while any member who still has access has bookmarked it.
- A Team is private (default, the page answers outsiders a gated 403 with the Team's name and a way to ask for an invitation) or public, behind a lead-only toggle. Member visibility is per member per Team.
- Attribution on a public Topic is derived: the byline credits the Team when the Team is public or the viewer is one of its members, the creator otherwise.
- Signal capture, recording only: rater identity columns on the existing thumb, verbatim freeform feedback, and view events with dismissal. Nothing reads any of it.
- The invites table gains a target: a token invites to a Topic or to a Team, and accepting a team invite writes membership.
- Entry points: a Team Up button on the topic page and a teams index behind a header menu item, sharing one create modal. The team page reuses the profile template.
- the daily creation limit keeps team creation from flooding the invitations others receive

**team-chat:**

- Every team holding a Topic gets its own shared, persistent Coffee talk room on it, and the topic page offers a switcher across the rooms the viewer belongs to; a Topic no team holds gets none, and each room's access follows its own team's membership, never the Topic's visibility.
- Carl reads everything and answers only when addressed — an @carl mention, the room-wide @all, or a reply to one of his messages — and an unaddressed composer message defaults to @all, notifying every member and waking him.
- One mention parser, two outcomes: mentioning a member notifies them through the Activity page; mentioning Carl starts a billed completion, charged to the mentioner and metered through the existing chat spend ledger.
- Messages render like a phone messaging app — avatar and display name on every message — through one component serving the solo and team rooms, and the panel keeps its docked width with the expand toggle as the large-view affordance.
- Transport is a Postgres message log plus SSE with a cursor, fanned out across instances with LISTEN/NOTIFY. No websocket service.
- The room transcript never feeds scoring, reranking, or the Topic's context embedding the relevance gate compares against.

**Removed:** the audiences scaffolding — both tables, `subscriptions.subscriber_audience_id`, the XOR check, and every dead OR-branch that reads them.

## Capabilities

### New Capabilities

- `teams`: the Team itself — schema, the permission helper, membership and delivery, visibility and members, attribution, signal capture, invites, roles, departure and deletion, entry points, the team page, and limits.
- `team-chat`: the shared Coffee talk room — scope, Carl's behavior, mentions, billing, presentation, transport, and the tuning invariant.

### Modified Capabilities

- `domain-schema`: the Audience requirement is removed, subscriptions become user-subscriber only, and the invites requirement gains the Team target.
- `authorization`: the one-gate requirement adds the effective-role union and the 404 answer for unauthorized reads.
- `usernames`: uniqueness moves to a unique index on `users.username_normalized`, with the route-slug reserved list.
- `finding-bookmarks`: who may bookmark widens to team members, the prune exemption requires the bookmark holder to still have access, and the Bookmarked view gains the team scope.
- `public-profiles`: the byline requirement gains derived team attribution, and the subscriber-count requirement drops its audience clauses.
- `activity-page`: the subscriptions accordion drops its audience-held rows and treats a team-join Subscription as the member's own, and a mentions accordion is added.
- `topic-scan-email`: the recipients requirement drops its audience path and states the muted-member rule.
- `feed-api`: rating access and subscriber counts drop their audience clauses.
- `account-closing`: audiences leave the deletion list.

## Impact

- `db/schema.ts` and migrations: `teams`, `team_members`, `team_topics`, room message and room summary tables keyed by topic and team, `topics.team_id`, signal-capture columns, the invites target, and the audience drop.
- `api/authorization.ts` and `api/topic/permissions.ts`: the effective-role helper, and every caller of the inline ownership checks the research inventoried across `api/topic/*`, `api/chat/turns.ts`, `api/profiles.ts`.
- `api/topic/subscriptions.ts`, `worker/notify.ts`: muted membership Subscriptions and the audience-branch removal.
- New `api/team/` routes, `ui/src/pages/TeamPage.tsx`, `ui/src/pages/TeamsPage.tsx`, the create modal, header menu item, and Team Up button.
- The room: message log, SSE route, LISTEN/NOTIFY listener on a dedicated non-pooler connection, mention parser, and the shared message component adopted by the solo Coffee talk.
- `.agents/skills/domain-model/SKILL.md`, `.claude/skills/domain-model/SKILL.md`, and `AGENTS.md`: Team joins the domain nouns, Audience leaves, Org and Workspace join the banned list.
- Depends on `add-invite-links` (already implemented on this branch), which must archive first, since the invites requirement here modifies that change's delta.
- The Notion queue's Audiences row is already marked superseded; nothing to build from it.
