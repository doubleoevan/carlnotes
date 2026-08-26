## Context

After `add-teams`, an invite is one row in `invites` with exactly one target — a Topic or a Team — a token, a use limit, an expiry, and a revocation. It names an email or nobody: an email invite has an address and one use, a link invite has no address and a limited use count. The Activity page's invitations accordion lists the invitations the user sent on Topics they own, joined to accounts by address. The Teams page is the index of the user's memberships. The daily invite limit is one flat number per account, and `users.createdAt` and `users.plan` already hold what a scaled limit needs.

What does not exist: any way to address a person by the name the app shows for them everywhere, any received-invitations surface, any per-recipient consent control, and any cost to a sender whose invitations nobody wants.

## Goals / Non-Goals

**Goals:**

- Invite someone by the username you already know, to a Topic or a Team, through the controls that already exist.
- An unwanted invitation costs its recipient a glance, never an inbox message.
- A sender's reach is bounded by their account's age, plan, and whether people accept what they send.
- A recipient can block invitations entirely, and the setting defaults open so the feature works day one.
- Both invitation kinds clear in an invitations section on the page beside what each concerns.

**Non-Goals:**

- A connection or friend table, or any request-and-accept flow for connections. Derived only.
- Email delivery on the username path, ever. The asymmetry is the design.
- A second invitations table or a username-invite entity. One object, two addressings.
- Notification surfaces beyond the two pages — no push, no badge counts, no digest of pending invitations.
- Changing the token lifecycle. Expiry, revocation, and the post-acceptance visibility rule are unchanged.

## Decisions

### Two columns with two meanings, and no check on the pair

`invites` gains a nullable `invited_user_id` referencing `users` with cascade delete, beside the nullable `email`. The email records which identifier the sender used; the user records the resolved recipient. A username invite sets the user alone, an email invite sets the email and — when the address already belongs to an account — the user too, and a link invite sets neither. No check constrains the pair, because the resolved email invite legitimately has both; what guards integrity instead is each creation path setting its own column and the unique indexes below.

Dedupe covers both modes: beside the existing per-target email indexes, per-target unique indexes on the invited user make re-inviting the same person a no-op — including across modes, since a resolved email invite occupies the same slot a username invite to that person would. Each is a plain unique index, not a partial one, so a declined row still occupies its person's slot: re-inviting cannot insert a second row and instead reopens the declined one, clearing the stamp and re-pending it.

Cascade on the recipient is deliberate: a closed account's pending invitations are meaningless rows naming a user that no longer exists, and the sender's withdraw control should not be the only thing that can clear them.

### The asymmetry is the anti-spam design

An email invite sends the invitation email and writes the row — email is the only channel that reaches someone with no account. A username invite writes the row and sends nothing: the recipient finds it in the invitations section of the page it belongs to. Recorded as deliberate so nobody "fixes" it: the identifier is not the spam vector, discovery and delivery are, and in-app-only delivery is the guard that makes harvestable usernames safe to accept as addresses.

When an email invite's address already belongs to an account, creation resolves it: the row keeps the address and gains the account, and the email still sends. One invitation in one section, reached by whichever identifier the sender knew, and the row renders the identifier the sender used — the email when set, the username otherwise. A resolved email invite consults the recipient's invite-access setting exactly as a username invite does; an unresolved address has no account to consult.

### The flat limit becomes a computed invite limit

The flat daily limit gives way to a per-sender invite limit computed from three inputs, all already recorded: the plan's base (free 10, plus 30, premium 50 per day — chosen defaults), an age factor that gives an account in its first week a fifth of its base, and a reputation factor. One formula, used everywhere it is spoken of: among the sender's user invitations at least a week old, the share accepted — a still-pending week-old invitation counts as ignored, which needs no expiry and leaves the token lifecycle untouched. A sender below a fifth accepted has their limit halved; nobody's limit drops below one per day, so a mistake is recoverable. Admins bypass, like every quota. Link creation draws from the same computed limit, so the invite-links requirement that creation is rate limited per account per day stays satisfied by one mechanism.

The decline signal needs one new fact: a declined invitation must be distinguishable from a pending one, so declining stamps the row instead of deleting it. `invites` gains a nullable `declined_at`; a declined invitation leaves both pages and counts against reputation. Two existing delete paths learn about the stamp: the topic-save reconciliation skips declined rows instead of erasing the signal, and an explicit re-invite of the same person clears the stamp and re-pends the row, spending limit like any other creation.

### Who may invite me, and connections that skip it

`users` gains one setting — the stored values are anyone, connected, and nobody, with "People I interact with" as the settings copy for connected — defaulting to anyone, changed from the Account page's settings. It is enforced at creation for both addressings: a rejected invite is never written, and the sender is told the recipient is not accepting invitations instead of being left to wonder.

A connected sender skips the restriction (except nobody, which means nobody) and draws from a doubled invite limit. One exception: the topic-save batch (`reviewTopicInvites`) holds the whole batch against the limit with the connection doubling unapplied, treating every recipient as unconnected for the count — the per-recipient invite-access check still derives the real connection. Connected is derived at creation time from data that already exists: the two share a Team, the recipient holds an active subscription to one of the sender's Topics, or the recipient accepted an invitation from the sender before. A stored graph was rejected because it needs an unsolicited channel to bootstrap itself — the very thing it would exist to replace.

### Two pages, each beside what it concerns

Each page shows only what exists at its scope. The Activity page is Topic-scoped and keeps two sections: Your subscriptions renamed Your topic subscriptions, and Your invitations renamed Your topic invitations, both renames label-only. The topics a user owns moved to their own profile, where the topics they hold and the teams they belong to sit together. The Teams page is Team-scoped and shows two: Your teams as `add-teams` built it, and Your team invitations. It has no subscriptions section, because a subscription names a Topic, never a Team.

The invitations section holds both directions of one table: received rows first with accept and decline, sent rows below keeping their columns and withdraw control, with the row identity, withdraw addressing, and query widened to cover username rows. One table component, one column convention, each row rendering the identifier the sender used — the address when the invite has one, the username otherwise, with the avatar and profile link joining in whenever the recipient has an account. Accepting from the page does what accepting the token does: the subscription for a Topic, membership with its muted Subscriptions for a Team. A Team the user does not belong to appears on the Teams page only through a pending invitation, so no Team ever renders in two sections.

### Sender surfaces gain a field, not a screen

The username field goes beside the email field in the controls that already exist: the invite editor's Followers fields for Topics, and the team membership fields for Teams — the share menu keeps no invite fields, and the create modal has none to extend. Each surface stages an entered username as a chip its save sends; an unknown one is refused by name when the invitations send and no invite is created, resolved against `users.username_normalized` the way availability checks already resolve names.

## Risks / Trade-offs

- **Reputation punishes a sender whose recipients simply never look.** → Only invitations at least a week old count, and the floor of one per day keeps anyone from being locked out entirely.
- **Derived connections change silently when their inputs do.** → That is what derived means: leave the shared Team and the connection is gone. The derivation runs at creation time, so an already-written invitation never retroactively changes its sender's limit.
- **The interacted-with setting depends on the same derivation.** → One function answers both, so the setting and the bypass cannot drift apart.
- **A third change touches the invites requirement.** → Archive order is `add-invite-links`, `add-teams`, then this; each delta names the requirement as the previous change leaves it. All three ship in one commit on this branch.
- **Declined rows accumulate.** → They already do as revoked rows; the reconciliation skip keeps them until re-invited or their target's cascade clears them, and both are invisible everywhere but reputation.

## Migration Plan

One migration: `invites.invited_user_id` with its foreign key, the per-target user unique indexes, `invites.declined_at`, and `users.invite_access` defaulting to anyone. All additive; rollback drops them. No backfill — every existing invitation is an email or a link one, which the null column already says.

## Open Questions

- The limit numbers (10/30/50, fifth-for-a-week, half-below-a-fifth, doubled-for-connected) are chosen defaults, adjustable at review.
- Whether decline needs an undo. Leaning no: the sender can re-invite — which clears the stamp and re-pends the row — unless the recipient's setting now blocks them.
